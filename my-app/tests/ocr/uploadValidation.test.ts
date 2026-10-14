import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  checkUpload,
  fileExtension,
  sanitizeModelText,
  normalizeIsoDate,
  normalizeConfidence,
} from '@/lib/uploadValidation';

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

describe('detectFileType (magic bytes)', () => {
  it('recognises PDF, PNG, JPEG and WEBP', () => {
    expect(detectFileType(PDF)).toBe('application/pdf');
    expect(detectFileType(PNG)).toBe('image/png');
    expect(detectFileType(JPEG)).toBe('image/jpeg');
    expect(detectFileType(WEBP)).toBe('image/webp');
  });

  it('rejects other content, truncated data and RIFF files that are not WEBP', () => {
    expect(detectFileType(HTML)).toBeNull();
    expect(detectFileType(new Uint8Array([0x25, 0x50]))).toBeNull();
    expect(detectFileType(new Uint8Array([]))).toBeNull();
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]);
    expect(detectFileType(wav)).toBeNull();
  });
});

describe('checkUpload', () => {
  it('accepts consistent MIME, extension and content', () => {
    expect(checkUpload('cert.PDF', 'application/pdf', PDF)).toEqual({ ok: true, type: 'application/pdf' });
    expect(checkUpload('a.jpeg', 'image/jpeg', JPEG)).toEqual({ ok: true, type: 'image/jpeg' });
    expect(checkUpload('a.jpg', 'image/jpeg', JPEG)).toEqual({ ok: true, type: 'image/jpeg' });
  });

  it('rejects spoofed MIME (HTML declared as PNG)', () => {
    expect(checkUpload('x.png', 'image/png', HTML)).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('rejects a MIME that disagrees with the content', () => {
    expect(checkUpload('x.png', 'application/pdf', PNG)).toEqual({ ok: false, reason: 'mime_mismatch' });
  });

  it('rejects an extension that disagrees with the content', () => {
    expect(checkUpload('x.html', 'image/png', PNG)).toEqual({ ok: false, reason: 'extension_mismatch' });
    expect(checkUpload('noextension', 'image/png', PNG)).toEqual({ ok: false, reason: 'extension_mismatch' });
  });

  it('extracts extensions safely', () => {
    expect(fileExtension('a/b\\c.PnG')).toBe('png');
    expect(fileExtension('.hidden')).toBe('');
  });
});

describe('untrusted model output helpers', () => {
  it('sanitizeModelText strips control chars, trims and caps length', () => {
    expect(sanitizeModelText('  Hello\u0000\u0007 World\u202e ', 100)).toBe('Hello World');
    expect(sanitizeModelText('x'.repeat(500), 200)).toHaveLength(200);
    expect(sanitizeModelText({ evil: true }, 200)).toBe('');
    expect(sanitizeModelText(undefined, 200)).toBe('');
  });

  it('normalizeIsoDate accepts only real YYYY-MM-DD dates', () => {
    expect(normalizeIsoDate('2024-05-01')).toBe('2024-05-01');
    expect(normalizeIsoDate(' 2024-02-29 ')).toBe('2024-02-29');
    expect(normalizeIsoDate('2023-02-29')).toBeNull();
    expect(normalizeIsoDate('2024-13-01')).toBeNull();
    expect(normalizeIsoDate('May 1, 2024')).toBeNull();
    expect(normalizeIsoDate('')).toBeNull();
    expect(normalizeIsoDate(null)).toBeNull();
    expect(normalizeIsoDate('1800-01-01')).toBeNull();
  });

  it('normalizeConfidence clamps to 0..1 and never fabricates', () => {
    expect(normalizeConfidence(0.42)).toBe(0.42);
    expect(normalizeConfidence(7)).toBe(1);
    expect(normalizeConfidence(-3)).toBe(0);
    expect(normalizeConfidence('0.8')).toBe(0.8);
    expect(normalizeConfidence(undefined)).toBeNull();
    expect(normalizeConfidence('high')).toBeNull();
    expect(normalizeConfidence(NaN)).toBeNull();
    expect(normalizeConfidence(0)).toBe(0);
  });
});
