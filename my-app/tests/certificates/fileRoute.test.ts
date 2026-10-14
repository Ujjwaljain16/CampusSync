// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, uuid, type FakeDb, type Row } from './fakeSupabase';

const h = vi.hoisted(() => ({ db: null as any }));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => h.db.client,
  createSupabaseAdminClient: async () => h.db.adminClient,
}));

import { GET } from '@/app/api/certificates/[id]/file/route';
import { __resetRateLimitStore } from '@/lib/rateLimit';
import { resolveCertificateObjectPath } from '@/lib/services/certificateFile';

const SUPABASE_URL = 'https://proj.supabase.co';
const ORG = uuid(100);
const OTHER_ORG = uuid(101);
const STUDENT = uuid(2);
const OTHER_STUDENT = uuid(3);
const FACULTY = uuid(1);
const CERT = uuid(10);
const SIGNED = 'https://proj.supabase.co/storage/v1/object/sign/certificates/x?token=t';

const cert = (over: Row = {}): Row => ({
  id: CERT,
  student_id: STUDENT,
  organization_id: ORG,
  storage_path: `${STUDENT}/1_file.pdf`,
  file_url: `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/1_file.pdf`,
  ...over,
});

const role = (user_id: string, r: string, organization_id: string | null = ORG): Row => ({
  user_id,
  role: r,
  organization_id,
  approval_status: 'approved',
});

let db: FakeDb;
let adminSigned: ReturnType<typeof vi.fn>;
let adminBucket: ReturnType<typeof vi.fn>;
let userSigned: ReturnType<typeof vi.fn>;

const setup = (userId: string | null, roles: Row[], certs: Row[] = [cert()]) => {
  db = createFakeDb({ certificates: certs, user_roles: roles });
  db.user = userId ? { id: userId } : null;
  adminSigned = vi.fn(async () => ({ data: { signedUrl: SIGNED }, error: null }));
  adminBucket = vi.fn(() => ({ createSignedUrl: adminSigned }));
  userSigned = vi.fn(async () => ({ data: { signedUrl: 'user-client-url' }, error: null }));
  db.adminClient.storage = { from: adminBucket };
  db.client.storage = { from: vi.fn(() => ({ createSignedUrl: userSigned })) };
  h.db = db;
};

const call = (id: string = CERT) =>
  GET(new NextRequest(`http://localhost/api/certificates/${id}/file`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  __resetRateLimitStore();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/certificates/[id]/file: authorization', () => {
  it('lets the owner student open the file', async () => {
    setup(STUDENT, []);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { url: SIGNED, expiresIn: 300 } });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('lets approved faculty of the same organization open it', async () => {
    setup(FACULTY, [role(FACULTY, 'faculty')]);
    expect((await call()).status).toBe(200);
  });

  it('lets an org admin of the organization open it', async () => {
    setup(FACULTY, [role(FACULTY, 'org_admin')]);
    expect((await call()).status).toBe(200);
  });

  it('lets a super admin open a file of any organization', async () => {
    setup(FACULTY, [role(FACULTY, 'super_admin', null)]);
    expect((await call()).status).toBe(200);
  });

  it('lets a super admin open a certificate without an organization', async () => {
    setup(FACULTY, [role(FACULTY, 'super_admin', null)], [cert({ organization_id: null })]);
    expect((await call()).status).toBe(200);
  });

  it('answers 404 for faculty of another organization', async () => {
    setup(FACULTY, [role(FACULTY, 'faculty', OTHER_ORG)]);
    const res = await call();
    expect(res.status).toBe(404);
    expect(adminSigned).not.toHaveBeenCalled();
  });

  it('answers 404 for faculty whose role is not approved', async () => {
    setup(FACULTY, [{ ...role(FACULTY, 'faculty'), approval_status: 'pending' }]);
    expect((await call()).status).toBe(404);
  });

  it('answers 404 for another student', async () => {
    setup(OTHER_STUDENT, [role(OTHER_STUDENT, 'student')]);
    expect((await call()).status).toBe(404);
    expect(adminSigned).not.toHaveBeenCalled();
  });

  it('answers 404 for a recruiter (recruiters never see certificate files)', async () => {
    setup(FACULTY, [role(FACULTY, 'recruiter')]);
    expect((await call()).status).toBe(404);
    expect(adminSigned).not.toHaveBeenCalled();
  });

  it('answers 404 for a certificate without organization when the caller is not a super admin', async () => {
    setup(FACULTY, [role(FACULTY, 'admin')], [cert({ organization_id: null })]);
    expect((await call()).status).toBe(404);
  });

  it('answers 401 when not signed in', async () => {
    setup(null, []);
    const res = await call();
    expect(res.status).toBe(401);
    expect(adminSigned).not.toHaveBeenCalled();
  });

  it('gives unknown ids, malformed ids and other-org ids the same answer', async () => {
    setup(FACULTY, [role(FACULTY, 'faculty', OTHER_ORG)]);
    const other = await (await call()).json();
    const unknown = await (await call(uuid(999))).json();
    const malformed = await (await call('not-a-uuid')).json();
    expect(unknown).toEqual(other);
    expect(malformed).toEqual(other);
    expect(other).toEqual({ error: 'File not found' });
  });
});

describe('GET /api/certificates/[id]/file: signing', () => {
  it('signs with the service-role client for 300 seconds and does not force a download', async () => {
    setup(STUDENT, []);
    await call();
    expect(adminBucket).toHaveBeenCalledWith('certificates');
    expect(adminSigned).toHaveBeenCalledTimes(1);
    expect(adminSigned.mock.calls[0]).toEqual([`${STUDENT}/1_file.pdf`, 300]);
    expect(userSigned).not.toHaveBeenCalled();
  });

  it('falls back to parsing file_url for rows without storage_path', async () => {
    setup(STUDENT, [], [cert({ storage_path: null, file_url: `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/old.pdf` })]);
    const res = await call();
    expect(res.status).toBe(200);
    expect(adminSigned.mock.calls[0][0]).toBe(`${STUDENT}/old.pdf`);
  });

  it('refuses a storage_path that points into another owner folder', async () => {
    setup(STUDENT, [], [cert({ storage_path: `${OTHER_STUDENT}/secret.pdf`, file_url: null })]);
    const res = await call();
    expect(res.status).toBe(404);
    expect(adminSigned).not.toHaveBeenCalled();
  });

  it.each(['../x/secret.pdf', `${STUDENT}/../${OTHER_STUDENT}/secret.pdf`, `${STUDENT}/a/b.pdf`, `${STUDENT}/..`, '/etc/passwd'])(
    'refuses a traversal-style storage_path (%s)',
    async (storage_path) => {
      setup(STUDENT, [], [cert({ storage_path, file_url: null })]);
      expect((await call()).status).toBe(404);
      expect(adminSigned).not.toHaveBeenCalled();
    }
  );

  it('refuses an old file_url that belongs to another owner', async () => {
    setup(STUDENT, [], [cert({
      storage_path: null,
      file_url: `${SUPABASE_URL}/storage/v1/object/public/certificates/${OTHER_STUDENT}/x.pdf`,
    })]);
    expect((await call()).status).toBe(404);
    expect(adminSigned).not.toHaveBeenCalled();
  });

  it('answers 404 when the row has no file at all', async () => {
    setup(STUDENT, [], [cert({ storage_path: null, file_url: null })]);
    expect((await call()).status).toBe(404);
  });

  it('does not leak storage error text', async () => {
    setup(STUDENT, []);
    adminSigned.mockResolvedValue({ data: null, error: { message: 'Object not found: bucket certificates internal-detail' } });
    const res = await call();
    expect(res.status).toBe(404);
    const text = JSON.stringify(await res.json());
    expect(text).toBe(JSON.stringify({ error: 'File not found' }));
  });

  it('does not leak database error text', async () => {
    setup(STUDENT, []);
    db.errors['select:certificates'] = 'relation "secret_table" exploded';
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret_table');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('is rate limited per user', async () => {
    setup(STUDENT, []);
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await call()).status;
    expect(last).toBe(429);
  });

  it('never writes anything', async () => {
    setup(STUDENT, []);
    await call();
    expect(db.writes).toEqual([]);
  });
});

describe('resolveCertificateObjectPath', () => {
  it('prefers storage_path over file_url', () => {
    expect(
      resolveCertificateObjectPath({
        id: CERT,
        student_id: STUDENT,
        organization_id: ORG,
        storage_path: `${STUDENT}/new.pdf`,
        file_url: `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/old.pdf`,
      })
    ).toBe(`${STUDENT}/new.pdf`);
  });

  it('uses file_url when storage_path is invalid', () => {
    expect(
      resolveCertificateObjectPath({
        id: CERT,
        student_id: STUDENT,
        organization_id: ORG,
        storage_path: `${OTHER_STUDENT}/x.pdf`,
        file_url: `${SUPABASE_URL}/storage/v1/object/public/certificates/${STUDENT}/old.pdf`,
      })
    ).toBe(`${STUDENT}/old.pdf`);
  });
});
