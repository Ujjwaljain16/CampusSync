import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withRole, success, error as errorResponse, apiError, parseAndValidateBody, isValidUUID } from '@/lib/api';
import { logger } from '@/lib/logger';
import {
  ADMIN_ROLES,
  actorHasRoleInOrg,
  actorOrganizationIds,
  resolveActor,
  revokeAllCredentialsForCertificate,
  writeAudit,
} from '@/lib/services/certificateService';
import { CERTIFICATES_BUCKET, parseCertificateFileUrl } from '@/lib/services/storageUrl';

interface DeleteCertificateBody {
  certificateId: string;
}

interface Row {
  id: string;
  student_id: string;
  organization_id: string | null;
  verification_status: string | null;
  file_url: string | null;
  storage_path?: string | null;
}

/**
 * Remove the stored object after the DB row is gone. Failures are logged only.
 * Prefers `storage_path`; rows from before it existed fall back to parsing `file_url`.
 * Either way the object must live in the owner's own folder.
 */
async function removeStoredFile(
  supabase: SupabaseClient,
  row: { storage_path?: string | null; file_url: string | null },
  ownerId: string
) {
  try {
    let target: { bucket: string; path: string } | null = null;
    const storagePath = row.storage_path;
    if (typeof storagePath === 'string' && storagePath.length > 0) {
      // <ownerId>/<file>, same shape rules as the URL form (no traversal, no extra segments)
      const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(storagePath);
      if (m && m[1] === ownerId && m[2] !== '.' && m[2] !== '..') {
        target = { bucket: CERTIFICATES_BUCKET, path: storagePath };
      }
    }
    if (!target && row.file_url) {
      const parsed = parseCertificateFileUrl(row.file_url, { expectedUserId: ownerId });
      if (parsed) target = { bucket: parsed.bucket, path: parsed.path };
    }
    if (!target) {
      if (row.storage_path || row.file_url) {
        logger.warn('[Delete] stored file is not in the owner folder / not recognised; skipping file removal');
      }
      return;
    }
    const { error } = await supabase.storage.from(target.bucket).remove([target.path]);
    if (error) logger.error('[Delete] Error deleting file from storage', error);
  } catch (storageError) {
    logger.error('[Delete] Error deleting file from storage', storageError);
  }
}

export const DELETE = withRole(['student', 'admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<DeleteCertificateBody>(req, ['certificateId']);
  if (result.error) return result.error;

  const { certificateId } = result.data;
  if (typeof certificateId !== 'string' || !isValidUUID(certificateId)) {
    throw apiError.badRequest('A valid certificateId is required');
  }

  const supabase = await createSupabaseServerClient();
  const actor = await resolveActor(supabase, user.id);
  // `certificates` has no DELETE policy (user-session deletes silently affect 0 rows) and credential
  // updates are staff-only, so all writes below use the service-role client AFTER the
  // app-level authorization checks.
  const admin = (await createSupabaseAdminClient()) as unknown as SupabaseClient;

  const { data: rec, error: readErr } = await supabase
    .from('certificates')
    .select('id, student_id, organization_id, verification_status, file_url, storage_path')
    .eq('id', certificateId)
    .maybeSingle();

  if (readErr) {
    logger.error('[Delete] Query error in certificates', readErr);
    throw apiError.internal('Failed to look up certificate');
  }
  if (!rec) throw apiError.notFound('Certificate not found');
  const row = rec as unknown as Row;

  const isOwner = row.student_id === user.id;
  const isAdminOfOrg = actorHasRoleInOrg(actor, ADMIN_ROLES, row.organization_id);
  if (!isOwner && !isAdminOfOrg) throw apiError.forbidden('Access denied');

  // A student (non-admin) may only delete their own pending or rejected certificate.
  const ownerOnly = isOwner && !isAdminOfOrg;
  if (ownerOnly && row.verification_status === 'verified') {
    throw apiError.forbidden('Verified certificates can only be deleted by an administrator');
  }

  // 1) Revoke every credential issued for the certificate.
  const revoke = await revokeAllCredentialsForCertificate(admin, row.id, 'Certificate deleted');
  if (!revoke.ok) throw apiError.internal('Failed to revoke credentials; certificate not deleted');

  // 2) The row itself, scoped in the WHERE clause.
  let del = admin.from('certificates').delete().eq('id', row.id);
  if (ownerOnly) {
    del = del.eq('student_id', user.id).in('verification_status', ['pending', 'rejected']);
  } else {
    const orgIds = actorOrganizationIds(actor, ADMIN_ROLES);
    if (orgIds !== 'all') del = del.in('organization_id', orgIds);
  }
  const { data: deleted, error: deleteError } = await del.select('id');
  if (deleteError) {
    logger.error('[Delete] Failed to delete from certificates', deleteError);
    throw apiError.internal('Failed to delete');
  }
  if (!deleted || deleted.length === 0) {
    // RLS or a concurrent change prevented the delete; do NOT touch storage.
    return errorResponse('Could not delete: the record was changed or is not deletable by you', 409);
  }

  // 3) Storage object last: a failure here leaves an orphan file, never a dangling row.
  await removeStoredFile(admin, row, row.student_id);

  await writeAudit(admin, {
    actorId: user.id,
    organizationId: row.organization_id,
    action: 'delete_certificate',
    targetId: row.id,
    details: { previous_status: row.verification_status },
  });

  return success({ success: true }, 'Certificate deleted successfully');
});
