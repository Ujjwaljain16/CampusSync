/**
 * Input sanitisation helpers for recruiter-facing routes.
 *
 * PostgREST `.or()` takes a *string* DSL (`col.op.value,col2.op.value`), so any
 * user input interpolated into it can inject extra conditions (`x,id.neq.0`).
 * Prefer parameter-safe builders (`.ilike('col', pattern)`, JS-side matching);
 * where `.or()` is unavoidable, pass every term through `sanitizeFilterTerm`.
 */

/** Maximum length of a single search term after sanitisation. */
export const MAX_FILTER_TERM_LENGTH = 64;

const STRUCTURAL_CHARS = ',()"\'\\%*:;<>{}[]`|&=!?#$^~+@/';

/**
 * Make a free-text term safe to interpolate into a PostgREST filter value.
 *
 * Removes every character that is structural in the filter DSL or in LIKE
 * patterns: `, ( ) " ' \ % * : ; < > { } [ ] ` and control characters.
 * A `.` (the `col.op.value` delimiter) is turned into `_`, which is a
 * single-character wildcard in LIKE, so "john.doe" still matches "john.doe".
 * Whitespace is collapsed, the result is trimmed and capped in length.
 * Returns '' when nothing usable remains - callers must then skip the filter.
 */
export function sanitizeFilterTerm(input: unknown, maxLength: number = MAX_FILTER_TERM_LENGTH): string {
  if (typeof input !== 'string') return '';
  let out = '';
  for (const ch of input.normalize('NFKC')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      out += ' ';
    } else if (ch === '.') {
      out += '_';
    } else if (STRUCTURAL_CHARS.includes(ch)) {
      out += ' ';
    } else {
      out += ch;
    }
  }
  out = out.replace(/\s+/g, ' ').trim();
  if (out.length > maxLength) out = out.slice(0, maxLength).trim();
  // A term made only of wildcards carries no information.
  if (/^_*$/.test(out)) return '';
  return out;
}

/** Sanitise a list of terms, dropping empties/duplicates and capping the count. */
export function sanitizeTermList(input: unknown, maxTerms = 10): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const seen = new Set<string>();
  for (const item of raw) {
    const term = sanitizeFilterTerm(item);
    if (term) seen.add(term);
    if (seen.size >= maxTerms) break;
  }
  return Array.from(seen);
}

/** Parse an integer query/body value and clamp it into [min, max]. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Any RFC-4122-shaped UUID (version-agnostic, so seeded/test ids pass). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** True for a plain JSON object (not null, not an array). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ISO calendar date (YYYY-MM-DD) or full ISO timestamp that actually parses. */
export function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}
