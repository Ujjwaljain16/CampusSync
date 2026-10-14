// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { GET } from '@/app/api/recruiter/dashboard/route';
import { adminClient, jsonRequest, newUserId, ORG_A, recruiterSessionClient } from './helpers/fixture';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

describe('GET /api/recruiter/dashboard audit reader', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reads the recruiter own verification actions through actor_id (canonical audit shape)', async () => {
    const userId = newUserId();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(recruiterSessionClient({ userId }) as never);
    const admin = adminClient({
      certificates: () => ({ data: [], count: 0 }),
      audit_logs: () => ({
        data: [{ action: 'recruiter_certificate_verification', created_at: '2026-01-01', target_id: 'c1', details: {}, organization_id: ORG_A }],
      }),
    });
    vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin as never);

    const res = await GET(jsonRequest('http://localhost/api/recruiter/dashboard', 'GET'), undefined);
    expect(res.status).toBe(200);

    const audit = admin.callsFor('audit_logs');
    expect(audit).toHaveLength(1);
    expect(audit[0].find('eq', 'actor_id')?.args).toEqual(['actor_id', userId]);
    expect(audit[0].find('eq', 'user_id')).toBeUndefined();
    const body = await res.json();
    expect(body.data.recent_verifications).toHaveLength(1);
  });
});
