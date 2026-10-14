// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { writeAudit } from '@/lib/api/utils/audit';
import { recordPiiRead } from '@/lib/privacy/audit';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

const ACTOR = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

function makeClient(result: { error: unknown } | Error = { error: null }) {
  const insert = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as SupabaseClient, from, insert };
}

let admin: ReturnType<typeof makeClient>;
let userClient: ReturnType<typeof makeClient>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  admin = makeClient();
  userClient = makeClient();
  vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin.client as never);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('writeAudit', () => {
  it('writes exactly the canonical shape', async () => {
    const ok = await writeAudit(admin.client, {
      actorId: ACTOR,
      organizationId: ORG,
      action: 'role_approve',
      targetType: 'role_request',
      targetId: 'req-1',
      details: { role: 'faculty' },
    });
    expect(ok).toBe(true);
    expect(admin.from).toHaveBeenCalledWith('audit_logs');
    const row = (admin.insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(
      ['action', 'actor_id', 'created_at', 'details', 'organization_id', 'target_id', 'target_type'].sort()
    );
    expect(row).toMatchObject({
      actor_id: ACTOR,
      organization_id: ORG,
      action: 'role_approve',
      target_type: 'role_request',
      target_id: 'req-1',
      details: { role: 'faculty', target_type: 'role_request' },
    });
    expect(Number.isNaN(Date.parse(row.created_at as string))).toBe(false);
    expect(row).not.toHaveProperty('user_id');
    expect(row).not.toHaveProperty('target_user_id');
  });

  it('defaults organization_id / target_id to null and keeps non-uuid target ids as text', async () => {
    await writeAudit(admin.client, { actorId: ACTOR, action: 'a', targetType: 'credential' });
    await writeAudit(admin.client, { actorId: ACTOR, action: 'a', targetType: 'credential', targetId: 'urn:uuid:abc' });
    const [first, second] = admin.insert.mock.calls.map((c) => (c as unknown[])[0] as Record<string, unknown>);
    expect(first).toMatchObject({ organization_id: null, target_id: null });
    expect(second.target_id).toBe('urn:uuid:abc');
  });

  it('uses the admin client even when handed a user client', async () => {
    await writeAudit(userClient.client, { actorId: ACTOR, action: 'a', targetType: 'user', targetId: ACTOR });
    expect(userClient.from).not.toHaveBeenCalled();
    expect(admin.insert).toHaveBeenCalledTimes(1);
  });

  it('logs the {error} and returns false instead of throwing', async () => {
    admin = makeClient({ error: { message: 'permission denied', code: '42501' } });
    vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin.client as never);
    await expect(writeAudit(userClient.client, { actorId: ACTOR, action: 'x', targetType: 'user' })).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('"x"');
  });

  it('never throws when the insert or the admin client itself throws', async () => {
    admin = makeClient(new Error('network down'));
    vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin.client as never);
    await expect(writeAudit(userClient.client, { actorId: ACTOR, action: 'x', targetType: 'user' })).resolves.toBe(false);

    vi.mocked(createSupabaseAdminClient).mockRejectedValue(new Error('no service key'));
    await expect(writeAudit(userClient.client, { actorId: ACTOR, action: 'x', targetType: 'user' })).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});

describe('recordPiiRead', () => {
  it('writes the canonical shape with actor_id and target_type student', async () => {
    await recordPiiRead(admin.client as never, {
      userId: ACTOR,
      organizationId: ORG,
      action: 'recruiter_view_student',
      targetId: 'stu-1',
      details: { contact_shared: false },
    });
    const row = (admin.insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      actor_id: ACTOR,
      organization_id: ORG,
      action: 'recruiter_view_student',
      target_type: 'student',
      target_id: 'stu-1',
      details: { contact_shared: false, target_type: 'student' },
    });
    expect(row).not.toHaveProperty('user_id');
  });

  it('uses null target_id for collection reads and the admin client for a user client', async () => {
    await recordPiiRead(userClient.client as never, {
      userId: ACTOR,
      organizationId: null,
      action: 'recruiter_search_students',
    });
    expect(userClient.from).not.toHaveBeenCalled();
    expect((admin.insert.mock.calls[0] as unknown[])[0]).toMatchObject({ organization_id: null, target_id: null });
  });

  it('logs the {error} and does not throw', async () => {
    admin = makeClient({ error: { message: 'boom' } });
    vi.mocked(createSupabaseAdminClient).mockResolvedValue(admin.client as never);
    await expect(
      recordPiiRead(userClient.client as never, { userId: ACTOR, organizationId: ORG, action: 'recruiter_export_students' })
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    vi.mocked(createSupabaseAdminClient).mockRejectedValue(new Error('x'));
    await expect(
      recordPiiRead(userClient.client as never, { userId: ACTOR, organizationId: ORG, action: 'recruiter_export_students' })
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});
