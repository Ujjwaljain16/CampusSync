// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseCertificateFileUrl, normalizeDateIssued } from '@/lib/services/storageUrl';

const SUPABASE = 'https://proj.supabase.co';
const ME = '11111111-1111-4111-8111-111111111111';
const VICTIM = '22222222-2222-4222-8222-222222222222';
const base = `${SUPABASE}/storage/v1/object/public/certificates`;
const opts = { supabaseUrl: SUPABASE, expectedUserId: ME };

describe('parseCertificateFileUrl', () => {
  it('accepts a legitimate upload URL', () => {
    expect(parseCertificateFileUrl(`${base}/${ME}/1700000000_my-cert.pdf`, opts)).toEqual({
      bucket: 'certificates',
      userId: ME,
      fileName: '1700000000_my-cert.pdf',
      path: `${ME}/1700000000_my-cert.pdf`,
    });
  });

  const bypasses: Record<string, string> = {
    'path confusion with nested /object/public': `${SUPABASE}/storage/v1/object/${ME}/object/public/certificates/${VICTIM}/f.pdf`,
    'other user folder': `${base}/${VICTIM}/f.pdf`,
    'user id only as a later segment': `${base}/${VICTIM}/${ME}/f.pdf`,
    'user id in a query string': `${base}/${VICTIM}/f.pdf?x=/${ME}/`,
    'user id in the fragment': `${base}/${VICTIM}/f.pdf#/${ME}/`,
    'dot-dot traversal': `${base}/${ME}/../${VICTIM}/f.pdf`,
    'encoded dot-dot': `${base}/${ME}/%2e%2e/${VICTIM}/f.pdf`,
    'encoded slash': `${base}/${ME}%2f${VICTIM}/f.pdf`,
    'backslash': `${base}\\${ME}\\f.pdf`,
    'wrong origin (prefix trick)': `https://proj.supabase.co.evil.com/storage/v1/object/public/certificates/${ME}/f.pdf`,
    'userinfo trick': `https://proj.supabase.co@evil.com/storage/v1/object/public/certificates/${ME}/f.pdf`,
    'wrong bucket': `${SUPABASE}/storage/v1/object/public/other/${ME}/f.pdf`,
    'private object path (not public)': `${SUPABASE}/storage/v1/object/${ME}/f.pdf`,
    'sign path': `${SUPABASE}/storage/v1/object/sign/certificates/${ME}/f.pdf`,
    'extra nesting': `${base}/${ME}/sub/f.pdf`,
    'no file name': `${base}/${ME}/`,
    'empty segment': `${base}/${ME}//f.pdf`,
    'file name is dot-dot': `${base}/${ME}/..`,
    'file named object': `${base}/${ME}/object`,
    'javascript scheme': 'javascript:alert(1)',
    'data scheme': 'data:text/plain,hi',
    'empty string': '',
    'relative path': `/storage/v1/object/public/certificates/${ME}/f.pdf`,
  };
  for (const [name, url] of Object.entries(bypasses)) {
    it(`rejects: ${name}`, () => {
      expect(parseCertificateFileUrl(url, opts)).toBeNull();
    });
  }

  it('rejects non-string input and missing configuration', () => {
    expect(parseCertificateFileUrl(undefined, opts)).toBeNull();
    expect(parseCertificateFileUrl({ toString: () => `${base}/${ME}/f.pdf` }, opts)).toBeNull();
    expect(parseCertificateFileUrl(`${base}/${ME}/f.pdf`, { expectedUserId: ME, supabaseUrl: '' })).toBeNull();
  });

  it('without expectedUserId any owner folder is parsed (used by delete to compare itself)', () => {
    const r = parseCertificateFileUrl(`${base}/${VICTIM}/f.pdf`, { supabaseUrl: SUPABASE });
    expect(r?.userId).toBe(VICTIM);
  });
});

describe('normalizeDateIssued', () => {
  const now = new Date('2025-03-04T10:00:00Z');
  it('keeps valid dates', () => expect(normalizeDateIssued('2024-05-01', now)).toBe('2024-05-01'));
  it('replaces empty / whitespace / undefined / garbage with today', () => {
    expect(normalizeDateIssued('', now)).toBe('2025-03-04');
    expect(normalizeDateIssued('   ', now)).toBe('2025-03-04');
    expect(normalizeDateIssued(undefined, now)).toBe('2025-03-04');
    expect(normalizeDateIssued('not a date', now)).toBe('2025-03-04');
  });
});
