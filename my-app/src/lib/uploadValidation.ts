/**
 * Helpers for validating uploaded files and untrusted (LLM) extraction output.
 * Pure functions with no framework dependencies so they are easy to unit test.
 */

export type DetectedFileType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

const EXTENSIONS_BY_TYPE: Record<DetectedFileType, string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/**
 * Identify a file from its leading bytes (never from the client-declared MIME).
 * Supports PDF, PNG, JPEG and WEBP; returns null for anything else.
 */
export function detectFileType(bytes: Uint8Array): DetectedFileType | null {
  // %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  // \x89PNG\r\n\x1a\n
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/** Lower-cased extension of a file name ('' when there is none). */
export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function extensionForType(type: DetectedFileType): string {
  return EXTENSIONS_BY_TYPE[type][0];
}

export type UploadCheck =
  | { ok: true; type: DetectedFileType }
  | { ok: false; reason: 'unsupported' | 'mime_mismatch' | 'extension_mismatch' };

/**
 * The declared MIME, the file extension and the actual content must all agree.
 */
export function checkUpload(fileName: string, declaredMime: string, bytes: Uint8Array): UploadCheck {
  const detected = detectFileType(bytes);
  if (!detected) return { ok: false, reason: 'unsupported' };
  if ((declaredMime || '').toLowerCase() !== detected) return { ok: false, reason: 'mime_mismatch' };
  if (!EXTENSIONS_BY_TYPE[detected].includes(fileExtension(fileName))) {
    return { ok: false, reason: 'extension_mismatch' };
  }
  return { ok: true, type: detected };
}

// ---------------------------------------------------------------------------
// Untrusted model output
// ---------------------------------------------------------------------------

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g;

/** Coerce to a string, strip control characters, trim and cap the length. */
export function sanitizeModelText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(CONTROL_CHARS, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

/** Accept only a real calendar date in YYYY-MM-DD form (year 1900-2100); otherwise null. */
export function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return match[0];
}

/** The model's own confidence clamped to 0..1, or null when it did not provide a usable number. */
export function normalizeConfidence(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}
