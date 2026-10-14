import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { success, apiError, isUuid, withSession } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import {
  SIGNED_URL_TTL_SECONDS,
  canViewCertificateFile,
  createCertificateSignedUrl,
  resolveCertificateObjectPath,
  type CertificateFileRow,
} from '@/lib/services/certificateFile';

const NOT_FOUND = 'File not found';
const LIMIT = { interval: 60 * 1000, uniqueTokenPerInterval: 60 };

function noStore<T extends Response>(res: T): T {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
const notFound = () => noStore(apiError.notFound(NOT_FOUND));

/**
 * GET /api/certificates/[id]/file
 *
 * Short-lived signed URL for the certificate's file in the private bucket.
 * Allowed: the owner, approved faculty/admin/org_admin of the certificate's
 * organization, super admins. Every other case (unknown id, other
 * organization, other student, recruiter, missing file) gets the same 404.
 */
export const GET = withSession<{ id: string }>(async (req: NextRequest, { user, params }) => {
  const limited = enforceRateLimit(req, 'certificate-file', LIMIT, user.id);
  if (limited) return noStore(limited);

  const { id } = params;
  if (!isUuid(id)) return notFound();

  // Service role: the row is read here so the app-level check below is the single
  // decision point (no dependence on which rows a given RLS policy happens to expose).
  const admin = (await createSupabaseAdminClient()) as unknown as SupabaseClient;

  const { data, error } = await admin
    .from('certificates')
    .select('id, student_id, organization_id, storage_path, file_url')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('[certificates/file] lookup failed', error.message);
    return noStore(apiError.internal('Failed to load file'));
  }
  if (!data) return notFound();
  const row = data as unknown as CertificateFileRow;

  if (!(await canViewCertificateFile(user, row))) return notFound();

  const path = resolveCertificateObjectPath(row);
  if (!path) return notFound();

  const signed = await createCertificateSignedUrl(admin, path, SIGNED_URL_TTL_SECONDS);
  if (signed.error) {
    logger.error('[certificates/file] could not sign url', signed.error);
    return notFound();
  }

  return noStore(success({ url: signed.url, expiresIn: SIGNED_URL_TTL_SECONDS }));
});
