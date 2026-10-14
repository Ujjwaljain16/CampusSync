/**
 * pdf-lib's standard fonts (Helvetica) only encode WinAnsi (Windows-1252);
 * drawing anything else (Devanagari, CJK, emoji, even "\n") throws. These
 * helpers make arbitrary user text safe to draw.
 */

// Code points above 0xFF that exist in Windows-1252.
const CP1252_EXTRAS = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function isWinAnsiEncodable(codePoint: number): boolean {
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    CP1252_EXTRAS.has(codePoint)
  );
}

/**
 * Replace every character the standard fonts cannot encode with '?'
 * (one '?' per code point, so emoji do not become two) and collapse control
 * characters/newlines to spaces. Optionally truncates to `maxLength` code points.
 */
export function sanitizeForWinAnsi(input: unknown, maxLength = 500): string {
  if (input === null || input === undefined) return '';
  const text = String(input);
  let out = '';
  let count = 0;
  for (const ch of text) {
    if (count >= maxLength) {
      out += '...';
      break;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0b || code === 0x0c || code === 0x2028 || code === 0x2029) {
      out += ' ';
    } else if (code < 0x20 || code === 0x7f) {
      // other control characters are dropped
      continue;
    } else if (isWinAnsiEncodable(code)) {
      out += ch;
    } else {
      out += '?';
    }
    count++;
  }
  return out;
}
