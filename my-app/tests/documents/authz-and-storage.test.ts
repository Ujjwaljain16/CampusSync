// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { canTransition, normalizeConfidence, mergeDetails, requireApprovedReviewer } from '@/lib/documents/authz';
import { parseStoragePublicUrl } from '@/lib/storageUrl';
import { FACULTY, ORG, OTHER_ORG, makeDb, roleRow } from './fixtures';

describe('canTransition', () => {
  const statuses = ['pending', 'verified', 'rejected', 'revoked'];
  const allowed = new Set([
    'pending>verified',
    'pending>rejected',
    'verified>revoked',
    'verified>pending',
    'rejected>pending',
    'revoked>pending',
  ]);

  for (const from of statuses) {
    for (const to of statuses) {
      const key = `${from}>${to}`;
      it(`${key} as faculty is ${allowed.has(key) && from !== 'revoked' ? 'allowed' : 'denied'}`, () => {
        expect(canTransition(from, to, 'faculty')).toBe(allowed.has(key) && from !== 'revoked');
      });
    }
  }

  it('revoked -> pending requires an admin role', () => {
    for (const role of ['admin', 'org_admin', 'super_admin']) {
      expect(canTransition('revoked', 'pending', role)).toBe(true);
    }
    expect(canTransition('revoked', 'pending', 'faculty')).toBe(false);
  });

  it('unknown statuses are denied', () => {
    expect(canTransition('__proto__', 'verified', 'admin')).toBe(false);
    expect(canTransition('pending', 'approved', 'admin')).toBe(false);
  });
});

describe('normalizeConfidence', () => {
  it('keeps 0..1, divides 1..100, rejects the rest', () => {
    expect(normalizeConfidence(0)).toBe(0);
    expect(normalizeConfidence(0.5)).toBe(0.5);
    expect(normalizeConfidence(1)).toBe(1);
    expect(normalizeConfidence(50)).toBe(0.5);
    expect(normalizeConfidence(100)).toBe(1);
    expect(normalizeConfidence(100.5)).toBeNull();
    expect(normalizeConfidence(-0.1)).toBeNull();
    expect(normalizeConfidence(Number.NaN)).toBeNull();
    expect(normalizeConfidence(Infinity)).toBeNull();
    expect(normalizeConfidence('0.5')).toBeNull();
    expect(normalizeConfidence(null)).toBeNull();
  });
});

describe('mergeDetails', () => {
  it('keeps existing keys and overrides patched ones', () => {
    expect(mergeDetails({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
    expect(mergeDetails(null, { c: 1 })).toEqual({ c: 1 });
    expect(mergeDetails([1, 2], { c: 1 })).toEqual({ c: 1 });
  });
});

describe('requireApprovedReviewer', () => {
  it('ignores pending/denied rows, other orgs, and non-reviewer roles', async () => {
    const db = makeDb(FACULTY, [
      roleRow(FACULTY, 'faculty', 'pending'),
      roleRow(FACULTY, 'faculty', 'approved', OTHER_ORG),
      roleRow(FACULTY, 'student', 'approved', ORG),
    ]);
    expect(await requireApprovedReviewer({ id: FACULTY }, ORG, db.client())).toBeNull();
  });

  it('accepts an approved same-org row and a global approved super_admin', async () => {
    let db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect(await requireApprovedReviewer({ id: FACULTY }, ORG, db.client())).toMatchObject({ role: 'faculty' });

    db = makeDb(FACULTY, [roleRow(FACULTY, 'super_admin', 'approved', null)]);
    expect(await requireApprovedReviewer({ id: FACULTY }, ORG, db.client())).toMatchObject({ role: 'super_admin' });

    db = makeDb(FACULTY, [roleRow(FACULTY, 'super_admin', 'pending', null)]);
    expect(await requireApprovedReviewer({ id: FACULTY }, ORG, db.client())).toBeNull();
  });

  it('rejects malformed organization ids without querying', async () => {
    const db = makeDb(FACULTY, [roleRow(FACULTY, 'faculty', 'approved')]);
    expect(await requireApprovedReviewer({ id: FACULTY }, 'x,organization_id.not.is.null', db.client())).toBeNull();
    expect(db.log).toHaveLength(0);
  });
});

describe('parseStoragePublicUrl', () => {
  const supabaseUrl = 'https://proj.supabase.co';
  const user = 'user-1';
  const opts = { supabaseUrl, bucket: 'certificates', userId: user };
  const ok = `${supabaseUrl}/storage/v1/object/public/certificates/${user}/123_file.pdf`;

  it('accepts a well-formed own-file URL', () => {
    const parsed = parseStoragePublicUrl(ok, opts);
    expect(parsed).toMatchObject({ bucket: 'certificates', path: `${user}/123_file.pdf`, ownerSegment: user });
  });

  it('accepts without userId constraint and with encoded filename chars', () => {
    expect(parseStoragePublicUrl(`${supabaseUrl}/storage/v1/object/public/certificates/u/my%20file.pdf`, { supabaseUrl, bucket: 'certificates' })).not.toBeNull();
  });

  it.each([
    ['http downgrade', ok.replace('https', 'http')],
    ['suffix host', ok.replace('proj.supabase.co', 'proj.supabase.co.evil.test')],
    ['prefix host', ok.replace('proj.supabase.co', 'evilproj.supabase.co')],
    ['userinfo', ok.replace('https://', 'https://proj.supabase.co@evil.test/@')],
    ['different port', ok.replace('.co/', '.co:8443/')],
    ['other bucket', ok.replace('/certificates/', '/avatars/')],
    ['other user', ok.replace(`/${user}/`, '/user-2/')],
    ['user only appears later', `${supabaseUrl}/storage/v1/object/public/certificates/user-2/${user}/a.pdf`],
    ['dot-dot', `${supabaseUrl}/storage/v1/object/public/certificates/${user}/../user-2/a.pdf`],
    ['encoded dot-dot', `${supabaseUrl}/storage/v1/object/public/certificates/${user}/%2e%2e/user-2/a.pdf`],
    ['encoded slash', `${supabaseUrl}/storage/v1/object/public/certificates/${user}%2f..%2fuser-2/a.pdf`],
    ['encoded backslash', `${supabaseUrl}/storage/v1/object/public/certificates/${user}/..%5cuser-2/a.pdf`],
    ['extra /object/', `${supabaseUrl}/storage/v1/object/public/certificates/${user}/object/public/other/a.pdf`],
    ['signed path', `${supabaseUrl}/storage/v1/object/sign/certificates/${user}/a.pdf`],
    ['authenticated path', `${supabaseUrl}/storage/v1/object/authenticated/certificates/${user}/a.pdf`],
    ['query string', `${ok}?download=1`],
    ['fragment', `${ok}#x`],
    ['no file segment', `${supabaseUrl}/storage/v1/object/public/certificates/${user}`],
    ['trailing slash', `${supabaseUrl}/storage/v1/object/public/certificates/${user}/`],
    ['double slash', `${supabaseUrl}/storage/v1/object/public/certificates//${user}/a.pdf`],
    ['backslash', ok.replace('/123_file', '\\123_file')],
    ['javascript scheme', 'javascript:alert(1)'],
    ['empty', ''],
    ['relative', `/storage/v1/object/public/certificates/${user}/a.pdf`],
  ])('rejects %s', (_n, url) => {
    expect(parseStoragePublicUrl(url, opts)).toBeNull();
  });

  it('rejects non-strings and a missing supabase url', () => {
    expect(parseStoragePublicUrl(undefined, opts)).toBeNull();
    expect(parseStoragePublicUrl(42, opts)).toBeNull();
    expect(parseStoragePublicUrl(ok, { ...opts, supabaseUrl: undefined })).toBeNull();
  });
});
