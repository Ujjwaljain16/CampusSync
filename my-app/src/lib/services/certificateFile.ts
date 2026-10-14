/**
 * Access to certificate files in the PRIVATE `certificates` bucket.
 *
 * The bucket is not public: nothing is served from a permanent URL. The server
 * checks that the caller may see the certificate and then hands out a
 * short-lived signed URL created with the service-role client.
 *
 * Who may open a file (same rule as the certificate metadata read path):
 *  - the owning student,
 *  - an approved faculty / admin / org_admin of the certificate's organization,
 *  - an approved super admin.
 * Recruiters never see certificate files (see `lib/privacy/studentView.ts`).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { assertSuperAdmin, authorizeOrg } from '@/lib/api/utils/authorize';
import { CERTIFICATES_BUCKET, parseCertificateFileUrl } from './storageUrl';

/** Lifetime of a signed URL, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 300;

export const FILE_REVIEWER_ROLES = ['faculty', 'admin', 'org_admin', 'super_admin'] as const;

export interface CertificateFileRow {
  id: string;
  student_id: string;
  organization_id: string | null;
  storage_path?: string | null;
  file_url?: string | null;
}

/**
 * Object path of a certificate's file, or null when there is none we trust.
 * Prefers `storage_path`; rows from before that column existed fall back to
 * parsing `file_url`. Either way the object must be `<ownerId>/<file>`, i.e. in
 * the owning student's own folder, with no traversal or extra segments.
 */
export function resolveCertificateObjectPath(row: CertificateFileRow): string | null {
  const ownerId = row.student_id;
  const stored = row.storage_path;
  if (typeof stored === 'string' && stored.length > 0) {
    const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(stored);
    if (m && m[1] === ownerId && m[2] !== '.' && m[2] !== '..') return stored;
  }
  if (typeof row.file_url === 'string' && row.file_url.length > 0) {
    const parsed = parseCertificateFileUrl(row.file_url, { expectedUserId: ownerId });
    if (parsed) return parsed.path;
  }
  return null;
}

/** 400/403 from the authorization helpers mean "not allowed"; anything else is a real failure. */
function isDenial(err: unknown): boolean {
  return err instanceof Response && (err.status === 400 || err.status === 403);
}

/** May `user` open the file of this certificate? */
export async function canViewCertificateFile(
  user: Pick<User, 'id'>,
  row: Pick<CertificateFileRow, 'student_id' | 'organization_id'>,
  client?: SupabaseClient
): Promise<boolean> {
  if (row.student_id === user.id) return true;
  try {
    if (row.organization_id) {
      await authorizeOrg(user, { orgId: row.organization_id, roles: FILE_REVIEWER_ROLES, client });
    } else {
      await assertSuperAdmin(user, client);
    }
    return true;
  } catch (err) {
    if (isDenial(err)) return false;
    throw err;
  }
}

/**
 * Create a signed URL for an object path with the SERVICE-ROLE client.
 * `error` is set (and `url` empty) when the object cannot be signed.
 */
export async function createCertificateSignedUrl(
  admin: SupabaseClient,
  path: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS
): Promise<{ url: string; error: string | null }> {
  const { data, error } = await admin.storage.from(CERTIFICATES_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return { url: '', error: error?.message ?? 'no signed url' };
  return { url: data.signedUrl, error: null };
}
