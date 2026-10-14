// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PDFPage } from 'pdf-lib';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { resetVisibilityWarningForTests } from '@/lib/privacy/visibility';
import { POST } from '@/app/api/portfolio/export-pdf/route';
import { createMockClient, type MockClient, type QueryResult, type QueryState } from './helpers/mockSupabase';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const TARGET = '33333333-3333-4333-8333-333333333331';

type Role = { role: string; organization_id: string | null; approval_status: string };
const REAL_DRAW_TEXT = PDFPage.prototype.drawText;
let counter = 0;
const newUser = () => `88888888-8888-4888-8888-${String(++counter).padStart(12, '0')}`;

interface Opts {
  callerId?: string;
  callerRoles?: Role[];
  targetOrgs?: Array<string | null>;
  targetRolesError?: boolean;
  share?: boolean;
  certs?: Array<Record<string, unknown>>;
  profile?: Record<string, unknown>;
}

function setup(opts: Opts = {}): { admin: MockClient; callerId: string; drawn: string[] } {
  const callerId = opts.callerId ?? newUser();
  const session = createMockClient(
    { user_roles: () => ({ data: opts.callerRoles ?? [] }) },
    { id: callerId }
  );
  const targetOrgs = opts.targetOrgs ?? [ORG_A];
  const admin = createMockClient({
    user_roles: (): QueryResult =>
      opts.targetRolesError
        ? { data: null, error: { message: 'db down' } }
        : { data: targetOrgs.map((organization_id) => ({ organization_id })) },
    profiles: (s: QueryState) => {
      if (String(s.find('select')?.args[0]).includes('recruiter_share_contact')) {
        return { data: [{ id: TARGET, public_portfolio_enabled: false, recruiter_share_contact: opts.share === true }] };
      }
      return {
        data: [opts.profile ?? { id: TARGET, full_name: 'Asha Rao', email: 'asha@uni.edu', phone: '123', university: 'Uni', major: 'CS', graduation_year: 2026 }],
      };
    },
    certificates: () => ({
      data: opts.certs ?? [{ id: 'c1', title: 'Python Basics', institution: 'Uni', date_issued: '2025-05-01', description: 'SECRET OCR' }],
    }),
    audit_logs: () => ({ data: null }),
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(session as never);
  vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin as never);

  const drawn: string[] = [];
  const original = REAL_DRAW_TEXT;
  vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text: string, options?: Parameters<PDFPage['drawText']>[1]) {
    drawn.push(text);
    return original.call(this, text, options);
  });
  return { admin, callerId, drawn };
}

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/portfolio/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

const approved = (role: string, organization_id: string | null): Role => ({ role, organization_id, approval_status: 'approved' });
const recruiterRoles = (orgs: string[], platform = 'approved'): Role[] => [
  { role: 'recruiter', organization_id: null, approval_status: platform },
  ...orgs.map((o) => approved('recruiter', o)),
];

async function isPdf(res: Response): Promise<boolean> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  return res.headers.get('content-type') === 'application/pdf' && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
}

describe('POST /api/portfolio/export-pdf authorisation', () => {
  beforeEach(() => {
    resetVisibilityWarningForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('owner (caller id == target) gets a PDF including contact info; no audit row', async () => {
    const { drawn, admin } = setup({ callerId: TARGET, callerRoles: [approved('student', ORG_A)] });
    const res = await call({ userId: TARGET });
    expect(res.status).toBe(200);
    expect(await isPdf(res)).toBe(true);
    expect(drawn.some((t) => t.includes('asha@uni.edu'))).toBe(true);
    expect(admin.callsFor('audit_logs')).toHaveLength(0);
  });

  it('owner can opt out of personal info', async () => {
    const { drawn } = setup({ callerId: TARGET, callerRoles: [approved('student', ORG_A)] });
    expect((await call({ userId: TARGET, includePersonalInfo: false })).status).toBe(200);
    expect(drawn.join('\n')).not.toContain('asha@uni.edu');
  });

  it('reviewer (faculty) of the target org: allowed, personal info OFF by default, audited', async () => {
    const { drawn, admin, callerId } = setup({ callerRoles: [approved('faculty', ORG_A)] });
    const res = await call({ userId: TARGET });
    expect(res.status).toBe(200);
    expect(await isPdf(res)).toBe(true);
    expect(drawn.join('\n')).not.toContain('asha@uni.edu');
    expect(drawn.join('\n')).not.toContain('SECRET OCR');
    expect(admin.callsFor('audit_logs')[0].payload).toMatchObject({ actor_id: callerId, action: 'portfolio_pdf_export', target_type: 'student', target_id: TARGET });
  });

  it('reviewer may opt in to personal info', async () => {
    const { drawn } = setup({ callerRoles: [approved('org_admin', ORG_A)] });
    expect((await call({ userId: TARGET, includePersonalInfo: true })).status).toBe(200);
    expect(drawn.join('\n')).toContain('asha@uni.edu');
  });

  it('reviewer of a different org is rejected', async () => {
    setup({ callerRoles: [approved('admin', ORG_B)] });
    expect((await call({ userId: TARGET })).status).toBe(403);
  });

  it('pending user is rejected', async () => {
    setup({ callerRoles: [{ role: 'faculty', organization_id: ORG_A, approval_status: 'pending' }] });
    expect((await call({ userId: TARGET })).status).toBe(403);
  });

  it('pending owner is rejected too', async () => {
    setup({ callerId: TARGET, callerRoles: [{ role: 'student', organization_id: ORG_A, approval_status: 'pending' }] });
    expect((await call({ userId: TARGET })).status).toBe(403);
  });

  it('plain student cannot export another student', async () => {
    setup({ callerRoles: [approved('student', ORG_A)] });
    expect((await call({ userId: TARGET })).status).toBe(403);
  });

  it('recruiter without student consent is rejected', async () => {
    setup({ callerRoles: recruiterRoles([ORG_A]), share: false });
    expect((await call({ userId: TARGET })).status).toBe(403);
  });

  it('recruiter with consent gets a PDF (not a 500) and the export is audited', async () => {
    const { admin } = setup({ callerRoles: recruiterRoles([ORG_A]), share: true });
    const res = await call({ userId: TARGET });
    expect(res.status).toBe(200);
    expect(await isPdf(res)).toBe(true);
    expect(admin.callsFor('audit_logs')).toHaveLength(1);
  });

  it('recruiter with consent but without org access / platform approval is rejected', async () => {
    setup({ callerRoles: recruiterRoles([ORG_B]), share: true });
    expect((await call({ userId: TARGET })).status).toBe(403);
    setup({ callerRoles: recruiterRoles([ORG_A], 'pending'), share: true });
    expect((await call({ userId: TARGET })).status).toBe(403);
  });

  it('fails closed when the target organisation cannot be determined', async () => {
    setup({ callerRoles: [approved('faculty', ORG_A)], targetRolesError: true });
    expect((await call({ userId: TARGET })).status).toBe(500);
    setup({ callerRoles: [approved('faculty', ORG_A)], targetOrgs: [] });
    expect((await call({ userId: TARGET })).status).toBe(404);
    setup({ callerRoles: [approved('faculty', ORG_A)], targetOrgs: [null] });
    expect((await call({ userId: TARGET })).status).toBe(404);
  });

  it('handles targets with several org rows: only shared orgs authorise and scope the data', async () => {
    const denied = setup({ callerRoles: [approved('faculty', '77777777-7777-4777-8777-777777777777')], targetOrgs: [ORG_A, ORG_B] });
    expect((await call({ userId: TARGET })).status).toBe(403);
    expect(denied.admin.callsFor('certificates')).toHaveLength(0);

    const allowed = setup({ callerRoles: [approved('faculty', ORG_B)], targetOrgs: [ORG_A, ORG_B] });
    expect((await call({ userId: TARGET })).status).toBe(200);
    expect(allowed.admin.callsFor('certificates')[0].find('in', 'organization_id')?.args[1]).toEqual([ORG_B]);
  });

  it('super_admin without an org may export', async () => {
    setup({ callerRoles: [approved('super_admin', null)] });
    expect((await call({ userId: TARGET })).status).toBe(200);
  });

  it('only exports verified certificates, capped at 100', async () => {
    const { admin } = setup({ callerRoles: [approved('faculty', ORG_A)] });
    await call({ userId: TARGET });
    const q = admin.callsFor('certificates')[0];
    expect(q.eq('verification_status')).toBe('verified');
    expect(q.find('limit')?.args[0]).toBe(100);
  });

  it('401 without a session, 400 for bad input', async () => {
    setup({ callerRoles: [] });
    const session = createMockClient({}, null);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(session as never);
    expect((await call({ userId: TARGET })).status).toBe(401);
    setup({ callerRoles: [approved('faculty', ORG_A)] });
    expect((await call({ userId: 'nope' })).status).toBe(400);
    expect((await call([1])).status).toBe(400);
    expect((await call('{bad')).status).toBe(400);
    expect((await call({ userId: TARGET, includePersonalInfo: 'yes' })).status).toBe(400);
  });
});

describe('POST /api/portfolio/export-pdf text handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('does not throw on non-Latin text, emoji and newlines', async () => {
    setup({
      callerRoles: [approved('faculty', ORG_A)],
      profile: { id: TARGET, full_name: 'आशा राव 😀', university: '東京大学', major: 'Ελληνικά\nline2' },
      certs: [
        { id: 'c1', title: 'पायथन प्रमाणपत्र 🎓', institution: 'विश्वविद्यालय\u0000', date_issued: 'garbage-date' },
        { id: 'c2', title: 'x'.repeat(5000), institution: null, date_issued: null },
      ],
    });
    const res = await call({ userId: TARGET, includePersonalInfo: true });
    expect(res.status).toBe(200);
    expect(await isPdf(res)).toBe(true);
  });

  it('paginates long portfolios', async () => {
    setup({
      callerRoles: [approved('faculty', ORG_A)],
      certs: Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, title: `Certificate ${i}`, institution: 'Uni', date_issued: '2025-01-01' })),
    });
    const res = await call({ userId: TARGET });
    expect(res.status).toBe(200);
    expect(await isPdf(res)).toBe(true);
  });
});
