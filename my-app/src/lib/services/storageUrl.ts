/**
 * Strict parsing of Supabase Storage public URLs for certificate files.
 *
 * Certificates are uploaded by `/api/certificates/ocr-gemini` to the
 * `certificates` bucket at `<userId>/<timestamp>_<sanitizedName>` and exposed via
 * `getPublicUrl`, i.e. `<SUPABASE_URL>/storage/v1/object/public/certificates/<userId>/<file>`.
 * Anything that is not exactly that shape is rejected.
 */

/** Bucket used by the upload route (hard-coded there as well). */
export const CERTIFICATES_BUCKET = 'certificates';

export interface ParsedCertificateFileUrl {
  bucket: string;
  userId: string;
  fileName: string;
  /** Object path inside the bucket (`<userId>/<fileName>`). */
  path: string;
}

const PUBLIC_PREFIX = ['storage', 'v1', 'object', 'public'];

/**
 * Parse a certificate file URL. Returns null unless:
 *  - it parses with `new URL()` and its origin equals the Supabase project origin,
 *  - there is no credentials / query / fragment,
 *  - the path is exactly `/storage/v1/object/public/<bucket>/<userId>/<fileName>`,
 *  - there are no empty, `.`/`..` segments, no `%` escapes (so no encoded slashes or
 *    dots), no backslashes and no extra `/object/` segments.
 *
 * @param expectedUserId when given, the `<userId>` segment must equal it.
 */
export function parseCertificateFileUrl(
  rawUrl: unknown,
  opts: { supabaseUrl?: string; bucket?: string; expectedUserId?: string } = {}
): ParsedCertificateFileUrl | null {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) return null;
  const bucket = opts.bucket ?? CERTIFICATES_BUCKET;
  const supabaseUrl = opts.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  // Reject things URL parsing would silently "fix" (backslashes, whitespace, escapes).
  if (/[\\\s%]/.test(rawUrl)) return null;

  let url: URL;
  let origin: string;
  try {
    url = new URL(rawUrl);
    origin = new URL(supabaseUrl).origin;
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.origin !== origin) return null;
  if (url.username || url.password || url.search || url.hash) return null;

  const segments = url.pathname.split('/');
  // leading '' + 4 prefix + bucket + user + file
  if (segments.length !== 8 || segments[0] !== '') return null;
  const parts = segments.slice(1);
  if (parts.some(s => s === '' || s === '.' || s === '..')) return null;
  for (let i = 0; i < PUBLIC_PREFIX.length; i++) {
    if (parts[i] !== PUBLIC_PREFIX[i]) return null;
  }
  const [urlBucket, userId, fileName] = parts.slice(4);
  if (urlBucket !== bucket) return null;
  if (!/^[A-Za-z0-9-]+$/.test(userId)) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) return null;
  if (userId === 'object' || fileName === 'object') return null;
  if (opts.expectedUserId !== undefined && userId !== opts.expectedUserId) return null;

  return { bucket: urlBucket, userId, fileName, path: `${userId}/${fileName}` };
}

/**
 * Normalise an OCR `date_issued` value: empty / whitespace / unparseable values
 * fall back to today (YYYY-MM-DD, UTC).
 */
export function normalizeDateIssued(value: unknown, now: Date = new Date()): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && !Number.isNaN(Date.parse(trimmed))) return trimmed;
  }
  return now.toISOString().slice(0, 10);
}
