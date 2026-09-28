/**
 * Open-redirect protection.
 * Only same-site relative paths are accepted; anything else falls back.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  // Must be a single-slash relative path: rejects absolute URLs, protocol-relative
  // (//evil.com), backslash tricks and control characters.
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0x5c /* backslash */) return fallback;
  }
  return raw;
}
