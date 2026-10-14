/**
 * Validation of Supabase Storage public URLs.
 *
 * A plain `startsWith(prefix)` / `includes('/<userId>/')` check is not enough:
 * `https://project.supabase.co.evil.test/...`, userinfo tricks, `..` segments,
 * encoded slashes or a second `/object/` segment can all satisfy a naive check
 * while pointing somewhere else. This parses the URL and compares exact parts.
 */

export interface StorageUrlOptions {
  /** Base URL of the Supabase project, e.g. https://abc.supabase.co */
  supabaseUrl: string | undefined | null;
  /** Bucket the object must live in */
  bucket: string;
  /** When set, the first path segment after the bucket must equal this id */
  userId?: string;
}

export interface ParsedStorageUrl {
  bucket: string;
  /** Object path inside the bucket, e.g. `<userId>/<name>` */
  path: string;
  /** First path segment (the owning user id) */
  ownerSegment: string;
  /** Normalised URL string */
  url: string;
}

const PUBLIC_PREFIX = '/storage/v1/object/public/';

/** Percent-encoded slash, backslash, dot and NUL are never legitimate in our generated paths */
const FORBIDDEN_ENCODED = /%(2f|5c|2e|00)/i;
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

export function parseStoragePublicUrl(
  input: unknown,
  options: StorageUrlOptions
): ParsedStorageUrl | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) return null;
  if (!options.supabaseUrl || !options.bucket) return null;
  if (CONTROL_OR_BACKSLASH.test(input)) return null;

  let target: URL;
  let base: URL;
  try {
    target = new URL(input);
    base = new URL(options.supabaseUrl);
  } catch {
    return null;
  }

  // Exact origin match (scheme + host + port); no userinfo, query or fragment
  if (target.origin === 'null' || target.origin !== base.origin) return null;
  if (target.username || target.password) return null;
  if (target.search || target.hash) return null;

  const pathname = target.pathname;
  if (FORBIDDEN_ENCODED.test(pathname)) return null;

  const expectedPrefix = `${PUBLIC_PREFIX}${options.bucket}/`;
  if (!pathname.startsWith(expectedPrefix)) return null;

  const rest = pathname.slice(expectedPrefix.length);
  const segments = rest.split('/');
  // Require at least `<userId>/<name>`
  if (segments.length < 2) return null;

  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || seg === 'object') return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      return null;
    }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
      return null;
    }
  }

  if (options.userId !== undefined && segments[0] !== options.userId) return null;

  return {
    bucket: options.bucket,
    path: rest,
    ownerSegment: segments[0],
    url: target.toString(),
  };
}

export function isValidStoragePublicUrl(input: unknown, options: StorageUrlOptions): boolean {
  return parseStoragePublicUrl(input, options) !== null;
}
