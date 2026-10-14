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
import { parseCertificateFileUrl } from '@/lib/services/storageUrl';

interface DeleteCertificateBody {
  certificateId: string;
}

interface Row {
  id: string;
  student_id: string;
  organization_id: string | null;
  verification_status: string | null;
  file_url: string | null;
}

/** Remove the stored object after the DB row is gone. Failures are logged only. */
async function removeStoredFile(supabase: SupabaseClient, fileUrl: string | null, ownerId: string) {
  if (!fileUrl) return;
  try {
    const parsed = parseCertificateFileUrl(fileUrl, { expectedUserId: ownerId });
    if (!parsed) {
      logger.warn('[Delete] file_url is not a recognised storage URL for this owner; skipping file removal');
      return;
    }
    const { error } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
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

  // Certificates first; fall back to documents (newer flow). Same rules for both.
  const tables = [
    { table: 'certificates', metaTable: 'certificate_metadata', metaKey: 'certificate_id', isCertificate: true },
    { table: 'documents', metaTable: 'document_metadata', metaKey: 'document_id', isCertificate: false },
  ] as const;

  for (const t of tables) {
    const { data: rec, error: readErr } = await supabase
      .from(t.table)
      .select('id, student_id, organization_id, verification_status, file_url')
      .eq('id', certificateId)
      .maybeSingle();

    if (readErr) {
      logger.error(`[Delete] Query error in ${t.table}`, readErr);
      if (t.isCertificate) throw apiError.internal('Failed to look up certificate');
      continue;
    }
    if (!rec) continue;
    const row = rec as Row;

    const isOwner = row.student_id === user.id;
    const isAdminOfOrg = actorHasRoleInOrg(actor, ADMIN_ROLES, row.organization_id);
    if (!isOwner && !isAdminOfOrg) throw apiError.forbidden('Access denied');

    // A student (non-admin) may only delete their own pending or rejected certificate.
    const ownerOnly = isOwner && !isAdminOfOrg;
    if (ownerOnly && row.verification_status === 'verified') {
      throw apiError.forbidden('Verified certificates can only be deleted by an administrator');
    }

    // 1) Revoke every credential issued for the certificate.
    if (t.isCertificate) {
      const revoke = await revokeAllCredentialsForCertificate(admin, row.id, 'Certificate deleted');
      if (!revoke.ok) throw apiError.internal('Failed to revoke credentials; certificate not deleted');
    }

    // 2) Metadata (foreign key), then the row itself, scoped in the WHERE clause.
    const { error: metaErr } = await admin.from(t.metaTable).delete().eq(t.metaKey, row.id);
    if (metaErr) logger.error(`[Delete] Error deleting ${t.metaTable}`, metaErr);

    let del = admin.from(t.table).delete().eq('id', row.id);
    if (ownerOnly) {
      del = del.eq('student_id', user.id).in('verification_status', ['pending', 'rejected']);
    } else {
      const orgIds = actorOrganizationIds(actor, ADMIN_ROLES);
      if (orgIds !== 'all') del = del.in('organization_id', orgIds);
    }
    const { data: deleted, error: deleteError } = await del.select('id');
    if (deleteError) {
      logger.error(`[Delete] Failed to delete from ${t.table}`, deleteError);
      throw apiError.internal('Failed to delete');
    }
    if (!deleted || deleted.length === 0) {
      // RLS or a concurrent change prevented the delete; do NOT touch storage.
      return errorResponse('Could not delete: the record was changed or is not deletable by you', 409);
    }

    // 3) Storage object last: a failure here leaves an orphan file, never a dangling row.
    await removeStoredFile(admin, row.file_url, row.student_id);

    await writeAudit(supabase, {
      actorId: user.id,
      organizationId: row.organization_id,
      action: t.isCertificate ? 'delete_certificate' : 'delete_document',
      targetId: row.id,
      details: { previous_status: row.verification_status },
    });

    return success({ success: true }, t.isCertificate ? 'Certificate deleted successfully' : 'Document deleted successfully');
  }

  throw apiError.notFound('Certificate not found');
});
