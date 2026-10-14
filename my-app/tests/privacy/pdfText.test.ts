// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { isWinAnsiEncodable, sanitizeForWinAnsi } from '@/lib/privacy/pdfText';

describe('sanitizeForWinAnsi', () => {
  it('replaces unencodable characters with ? (one per code point)', () => {
    expect(sanitizeForWinAnsi('नमस्ते')).toMatch(/^\?+$/);
    expect(sanitizeForWinAnsi('hi 😀!')).toBe('hi ?!');
    expect(sanitizeForWinAnsi('日本語')).toBe('???');
  });

  it('keeps Latin-1 and cp1252 punctuation', () => {
    expect(sanitizeForWinAnsi('José – “quoted” • €5')).toBe('José – “quoted” • €5');
  });

  it('collapses newlines/tabs and drops other control characters', () => {
    expect(sanitizeForWinAnsi('a\nb\tc\u0000d')).toBe('a b cd');
  });

  it('handles null and truncates', () => {
    expect(sanitizeForWinAnsi(null)).toBe('');
    expect(sanitizeForWinAnsi('x'.repeat(50), 10)).toBe('xxxxxxxxxx...');
  });

  it('only ever yields text that Helvetica can really encode', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let cp = 0; cp < 0x3000; cp++) {
      const ch = String.fromCodePoint(cp);
      const clean = sanitizeForWinAnsi(ch);
      expect(() => font.encodeText(clean), `U+${cp.toString(16)}`).not.toThrow();
    }
    expect(isWinAnsiEncodable(0x20ac)).toBe(true);
    expect(isWinAnsiEncodable(0x0915)).toBe(false);
  });
});
