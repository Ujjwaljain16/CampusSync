/**
 * Return a normalised http(s) URL string, or null when the value is missing,
 * unparseable, or uses any other scheme (javascript:, data:, file:, ...).
 * Safe to use in both server and client code.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Conservative e-mail check used before building a mailto: link. */
export function safeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const ok = /^[^\s@,;<>?&"'()]+@[^\s@,;<>?&"'()]+\.[^\s@,;<>?&"'()]+$/.test(trimmed) && trimmed.length <= 254;
  return ok ? trimmed : null;
}
