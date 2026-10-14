// @vitest-environment node
// Proves each wired route family calls the global limiter with the right scope and returns its 429 untouched.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const enforceGlobalRateLimit = vi.fn();
const getServerUserWithRole = vi.fn();

vi.mock('@/lib/rateLimitGlobal', () => ({
  enforceGlobalRateLimit: (...a: unknown[]) => enforceGlobalRateLimit(...a),
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseAdminClient: vi.fn(async () => {
    throw new Error('admin client must not be reached when the global limiter says no');
  }),
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'wired-user-1' } }, error: null }) },
  })),
  getServerUserWithRole: (...a: unknown[]) => getServerUserWithRole(...a),
}));

const BLOCKED = () =>
  new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '42' },
  });

let ipCounter = 0;
const ip = () => `10.77.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`; // fresh client for the in-memory limiter

const post = (path: string, body: unknown = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() },
    body: JSON.stringify(body),
  });

const scopesCalled = () => enforceGlobalRateLimit.mock.calls.map((c) => c[1]);

async function expectBlocked(res: Response) {
  expect(res.status).toBe(429);
  expect(res.headers.get('Retry-After')).toBe('42');
  expect(await res.json()).toEqual({ error: 'Too many requests. Please try again later.' });
}

beforeEach(() => {
  enforceGlobalRateLimit.mockImplementation(async () => BLOCKED());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('global limiter wiring', () => {
  it('auth/complete-login', async () => {
    const { POST } = await import('@/app/api/auth/complete-login/route');
    await expectBlocked(await POST(post('/api/auth/complete-login', { access_token: 'a', refresh_token: 'b' })));
    expect(enforceGlobalRateLimit).toHaveBeenCalledWith(expect.anything(), 'complete-login', { limit: 60, windowSeconds: 60 });
  });

  it('auth/signup (recruiter and student-faculty share the signup scope)', async () => {
    const recruiter = await import('@/app/api/auth/signup/recruiter/route');
    const studentFaculty = await import('@/app/api/auth/signup/student-faculty/route');
    await expectBlocked(await recruiter.POST(post('/api/auth/signup/recruiter')));
    await expectBlocked(await studentFaculty.POST(post('/api/auth/signup/student-faculty')));
    expect(scopesCalled()).toEqual(['signup', 'signup']);
    expect(enforceGlobalRateLimit.mock.calls[0][2]).toEqual({ limit: 10, windowSeconds: 900 });
  });

  it('auth e-mail checks: check-email, validate-email, check-user-exists', async () => {
    const checkEmail = await import('@/app/api/auth/check-email/route');
    const validateEmail = await import('@/app/api/auth/validate-email/route');
    const userExists = await import('@/app/api/auth/check-user-exists/route');
    await expectBlocked(await checkEmail.POST(post('/api/auth/check-email', { email: 'a@b.test' })));
    await expectBlocked(await validateEmail.POST(post('/api/auth/validate-email', { email: 'a@b.test' })));
    await expectBlocked(await userExists.POST(post('/api/auth/check-user-exists', { email: 'a@b.test' })));
    expect(scopesCalled()).toEqual(['check-email', 'validate-email', 'check-user-exists']);
  });

  it('auth/resend-confirmation: per client, then per e-mail address (identifier passed in clear, hashed inside the limiter)', async () => {
    const { POST } = await import('@/app/api/auth/resend-confirmation/route');
    // first call (per client) passes, the per-address call blocks
    enforceGlobalRateLimit.mockImplementationOnce(async () => null);
    await expectBlocked(await POST(post('/api/auth/resend-confirmation', { email: '  Someone@Example.test ' })));
    expect(scopesCalled()).toEqual(['resend-confirmation', 'resend-confirmation-email']);
    expect(enforceGlobalRateLimit.mock.calls[1][3]).toBe('someone@example.test');
    expect(enforceGlobalRateLimit.mock.calls[1][2]).toEqual({ limit: 3, windowSeconds: 600 });
  });

  it('certificates/ocr-gemini: per-minute then daily, keyed by user id, after the authorization checks', async () => {
    getServerUserWithRole.mockResolvedValue({ user: { id: 'wired-user-1' }, role: 'student', approvalStatus: 'approved', organizationId: 'org-1' });
    const { POST } = await import('@/app/api/certificates/ocr-gemini/route');
    enforceGlobalRateLimit.mockImplementationOnce(async () => null);
    await expectBlocked(await POST(post('/api/certificates/ocr-gemini') as never));
    expect(scopesCalled()).toEqual(['ocr-gemini', 'ocr-gemini-daily']);
    expect(enforceGlobalRateLimit.mock.calls[0][2]).toEqual({ limit: 6, windowSeconds: 60 });
    expect(enforceGlobalRateLimit.mock.calls[1][2]).toEqual({ limit: 50, windowSeconds: 86400 });
    expect(enforceGlobalRateLimit.mock.calls[1][3]).toBe('wired-user-1');
  });

  it('ocr-gemini: a user who is not an approved student never reaches the limiter', async () => {
    getServerUserWithRole.mockResolvedValue({ user: { id: 'wired-user-1' }, role: 'recruiter', approvalStatus: 'approved', organizationId: null });
    const { POST } = await import('@/app/api/certificates/ocr-gemini/route');
    const res = await POST(post('/api/certificates/ocr-gemini') as never);
    expect(res.status).toBe(403);
    expect(enforceGlobalRateLimit).not.toHaveBeenCalled();
  });

  it('vcs/verify', async () => {
    const { GET } = await import('@/app/api/vcs/verify/route');
    await expectBlocked(await GET(new NextRequest('http://localhost/api/vcs/verify?vcId=x', { headers: { 'x-forwarded-for': ip() } })));
    expect(enforceGlobalRateLimit).toHaveBeenCalledWith(expect.anything(), 'vcs-verify', { limit: 30, windowSeconds: 60 });
  });

  it('public/portfolio/[userId]', async () => {
    const { GET } = await import('@/app/api/public/portfolio/[userId]/route');
    const id = '55555555-5555-4555-8555-555555555555';
    const res = await GET(new NextRequest(`http://localhost/api/public/portfolio/${id}`, { headers: { 'x-forwarded-for': ip() } }), {
      params: Promise.resolve({ userId: id }),
    });
    await expectBlocked(res);
    expect(enforceGlobalRateLimit).toHaveBeenCalledWith(expect.anything(), 'public-portfolio', { limit: 30, windowSeconds: 60 });
  });

  it('credentials/sd/issue (keyed by user id) and credentials/sd/verify (by client)', async () => {
    process.env.SD_JWT_ENABLED = 'true';
    try {
      const issue = await import('@/app/api/credentials/sd/issue/route');
      const verify = await import('@/app/api/credentials/sd/verify/route');
      await expectBlocked(await issue.POST(post('/api/credentials/sd/issue', { certificateId: 'x' })));
      await expectBlocked(await verify.POST(post('/api/credentials/sd/verify', { presentation: 'x' })));
      expect(scopesCalled()).toEqual(['sd-issue', 'sd-verify']);
      expect(enforceGlobalRateLimit.mock.calls[0][3]).toBe('wired-user-1');
      expect(enforceGlobalRateLimit.mock.calls[1][3]).toBeUndefined();
    } finally {
      delete process.env.SD_JWT_ENABLED;
    }
  });

  it('sd routes stay disabled (404) before the limiter when the feature flag is off', async () => {
    delete process.env.SD_JWT_ENABLED;
    const verify = await import('@/app/api/credentials/sd/verify/route');
    expect((await verify.POST(post('/api/credentials/sd/verify'))).status).toBe(404);
    expect(enforceGlobalRateLimit).not.toHaveBeenCalled();
  });

  it('a route proceeds normally when the global limiter allows the request', async () => {
    enforceGlobalRateLimit.mockImplementation(async () => null);
    const { GET } = await import('@/app/api/vcs/verify/route');
    const res = await GET(new NextRequest('http://localhost/api/vcs/verify', { headers: { 'x-forwarded-for': ip() } }));
    expect(res.status).toBe(400); // reached its own validation (missing vcId)
  });
});
