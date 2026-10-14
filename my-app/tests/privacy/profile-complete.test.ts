// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { GET, POST } from '@/app/api/profile/complete/route';
import { createMockClient, type MockClient, type QueryResult, type QueryState } from './helpers/mockSupabase';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

const ORG_A = '11111111-1111-4111-8111-111111111111';
let counter = 0;

function setup(opts: {
  roles?: Array<{ role: string; organization_id: string | null; approval_status?: string }>;
  upsert?: (payload: Record<string, unknown>, attempt: number) => QueryResult;
  profile?: Record<string, unknown> | null;
  authed?: boolean;
} = {}): { client: MockClient; payloads: Array<Record<string, unknown>> } {
  const userId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(++counter).padStart(12, '0')}`;
  const payloads: Array<Record<string, unknown>> = [];
  const client = createMockClient(
    {
      user_roles: () => ({ data: opts.roles ?? [{ role: 'student', organization_id: ORG_A, approval_status: 'approved' }] }),
      profiles: (s: QueryState) => {
        if (s.action === 'upsert') {
          const payload = s.payload as Record<string, unknown>;
          payloads.push(payload);
          return opts.upsert ? opts.upsert(payload, payloads.length) : { data: null, error: null };
        }
        return { data: opts.profile === undefined ? [{ id: userId, full_name: 'A', role: 'student' }] : opts.profile ? [opts.profile] : [] };
      },
    },
    opts.authed === false ? null : { id: userId }
  );
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
  return { client, payloads };
}

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/profile/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

describe('POST /api/profile/complete validation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it.each([
    [{ full_name: 'A', gpa: 11 }, 'gpa'],
    [{ full_name: 'A', gpa: -1 }, 'gpa'],
    [{ full_name: 'A', gpa: 'abc' }, 'gpa'],
    [{ full_name: 'A', gpa: 'NaN' }, 'gpa'],
    [{ full_name: 'A', gpa: {} }, 'gpa'],
    [{ full_name: 'A', graduation_year: 1900 }, 'graduation_year'],
    [{ full_name: 'A', graduation_year: 3000 }, 'graduation_year'],
    [{ full_name: 'A', graduation_year: 2026.5 }, 'graduation_year'],
    [{ full_name: 'A', graduation_year: 'soon' }, 'graduation_year'],
    [{ full_name: 'A', public_portfolio_enabled: 'true' }, 'public_portfolio_enabled'],
    [{ full_name: 'A', recruiter_share_contact: 1 }, 'recruiter_share_contact'],
    [{ full_name: 'A', university: { x: 1 } }, 'university'],
    [{ full_name: 'A', major: 'm'.repeat(500) }, 'major'],
    [{ full_name: '   ' }, 'Full name'],
    [{}, 'Full name'],
    [['x'], 'object'],
    ['{bad json', 'JSON'],
  ])('rejects %j with 400', async (body, fragment) => {
    const { payloads } = setup();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain(fragment);
    expect(payloads).toHaveLength(0); // nothing written
  });

  it('accepts valid values (including boundaries and numeric strings) and never writes NaN', async () => {
    const { payloads } = setup();
    const year = new Date().getFullYear() + 10;
    const res = await post({ full_name: ' Asha ', gpa: '9.5', graduation_year: String(year), university: 'Uni', major: 'CS', location: 'Pune' });
    expect(res.status).toBe(200);
    expect(payloads[0]).toMatchObject({ full_name: 'Asha', gpa: 9.5, graduation_year: year, university: 'Uni', major: 'CS', location: 'Pune', role: 'student', organization_id: ORG_A });
    expect(Number.isNaN(payloads[0].gpa)).toBe(false);
    expect((await post({ full_name: 'A', gpa: 0, graduation_year: 1950 })).status).toBe(200);
    expect((await post({ full_name: 'A', gpa: 10 })).status).toBe(200);
  });

  it('whitelists fields: role / organisation / id in the body are ignored', async () => {
    const { payloads } = setup();
    await post({ full_name: 'A', role: 'super_admin', organization_id: 'evil', id: 'someone-else', email: 'x@y.z', is_admin: true });
    expect(Object.keys(payloads[0]).sort()).toEqual(['full_name', 'id', 'organization_id', 'role']);
    expect(payloads[0].role).toBe('student');
    expect(payloads[0].organization_id).toBe(ORG_A);
    expect(payloads[0].id).not.toBe('someone-else');
  });

  it("does not overwrite profiles.role when the caller's highest role is not student", async () => {
    const { payloads } = setup({
      roles: [
        { role: 'student', organization_id: ORG_A, approval_status: 'approved' },
        { role: 'faculty', organization_id: ORG_A, approval_status: 'approved' },
      ],
    });
    expect((await post({ full_name: 'Prof' })).status).toBe(200);
    expect(payloads[0]).not.toHaveProperty('role');
  });

  it('resolves the organisation from multiple role rows without .single()', async () => {
    const { payloads } = setup({
      roles: [
        { role: 'recruiter', organization_id: null },
        { role: 'student', organization_id: ORG_A },
        { role: 'student', organization_id: '22222222-2222-4222-8222-222222222222' },
      ],
    });
    expect((await post({ full_name: 'A' })).status).toBe(200);
    expect(payloads[0].organization_id).toBe(ORG_A);
  });

  it('stores the two privacy flags (booleans only)', async () => {
    const { payloads } = setup();
    const res = await post({ full_name: 'A', public_portfolio_enabled: true, recruiter_share_contact: false });
    const json = await res.json();
    expect(payloads[0]).toMatchObject({ public_portfolio_enabled: true, recruiter_share_contact: false });
    expect(json.data).toMatchObject({ public_portfolio_enabled: true, recruiter_share_contact: false });
    expect(json.warnings).toBeUndefined();
  });

  it('surfaces a warning when privacy columns are missing, saving the core profile without them', async () => {
    const { payloads } = setup({
      upsert: (payload) =>
        'public_portfolio_enabled' in payload ? { error: { code: '42703', message: 'column "public_portfolio_enabled" does not exist' } } : { error: null },
    });
    const res = await post({ full_name: 'A', university: 'Uni', public_portfolio_enabled: true });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.warnings[0].code).toBe('privacy_settings_unavailable');
    expect(json.data.public_portfolio_enabled).toBe(false);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toMatchObject({ university: 'Uni' }); // other fields are kept, not silently dropped
    expect(payloads[1]).not.toHaveProperty('public_portfolio_enabled');
  });

  it('returns 500 (not a silent 200) when the upsert fails, without leaking the DB message', async () => {
    setup({ upsert: () => ({ error: { code: 'XX000', message: 'relation "internal_secret" broke' } }) });
    const res = await post({ full_name: 'A' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('internal_secret');
  });

  it('requires authentication', async () => {
    setup({ authed: false });
    expect((await post({ full_name: 'A' })).status).toBe(401);
  });
});

describe('GET /api/profile/complete', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports privacy flags as false when columns are absent', async () => {
    setup({ profile: { id: 'x', full_name: 'A' } });
    const res = await GET(new NextRequest('http://localhost/api/profile/complete'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ public_portfolio_enabled: false, recruiter_share_contact: false });
  });

  it('404 without a profile, 401 without a session', async () => {
    setup({ profile: null });
    expect((await GET(new NextRequest('http://localhost/api/profile/complete'))).status).toBe(404);
    setup({ authed: false });
    expect((await GET(new NextRequest('http://localhost/api/profile/complete'))).status).toBe(401);
  });
});
