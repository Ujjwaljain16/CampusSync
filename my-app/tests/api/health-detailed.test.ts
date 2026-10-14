// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  // pass-through: authorisation itself is covered by the withRole tests
  withRole: (_roles: string[], handler: (...a: unknown[]) => unknown) => (req: unknown) => handler(req, { user: { id: 'u' }, role: 'super_admin' }),
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => {
        const result = { error: null };
        return { limit: () => Object.assign(Promise.resolve(result), { single: async () => result }) };
      },
    }),
  }),
}));

vi.mock('@/lib/vc', () => ({
  getIssuerPublicJwk: vi.fn(),
}));

import { getIssuerPublicJwk } from '@/lib/vc';
import { GET } from '@/app/api/health/detailed/route';

const ENV_KEYS = ['NODE_ENV', 'ALERT_WEBHOOK_URL', 'GEMINI_API_KEY', 'VC_ISSUER_JWK'] as const;
const saved: Record<string, string | undefined> = {};
const env = process.env as Record<string, string | undefined>;

const SECRETS = {
  ALERT_WEBHOOK_URL: 'https://hooks.example.test/services/WEBHOOKSECRET',
  GEMINI_API_KEY: 'GEMINISECRET123',
  VC_ISSUER_JWK: '{"kty":"OKP","crv":"Ed25519","d":"PRIVATESECRET","x":"pub","kid":"key-2026"}',
};

function req() {
  return new Request('https://campus.test/api/health/detailed') as never;
}

describe('GET /api/health/detailed', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = env[k];
    env.NODE_ENV = 'development';
    vi.mocked(getIssuerPublicJwk).mockResolvedValue({ kid: 'key-2026' } as never);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete env[k];
      else env[k] = saved[k];
    }
  });

  it('reports configured integrations as booleans only, plus the issuer key id', async () => {
    Object.assign(env, SECRETS);
    const res = await GET(req());
    const text = await res.text();
    const body = JSON.parse(text);

    expect(body.checks.configuration).toEqual({
      status: 'healthy',
      alertWebhookConfigured: true,
      geminiApiKeyConfigured: true,
      vcIssuerJwkConfigured: true,
      issuerKeyId: 'key-2026',
    });
    for (const secret of ['WEBHOOKSECRET', 'GEMINISECRET123', 'PRIVATESECRET', 'hooks.example.test']) {
      expect(text).not.toContain(secret);
    }
  });

  it('reports false and a null key id when nothing is configured', async () => {
    delete env.ALERT_WEBHOOK_URL;
    delete env.GEMINI_API_KEY;
    delete env.VC_ISSUER_JWK;
    vi.mocked(getIssuerPublicJwk).mockRejectedValue(new Error('VC_ISSUER_JWK missing PRIVATEDETAIL'));
    const res = await GET(req());
    const text = await res.text();
    const cfg = JSON.parse(text).checks.configuration;
    expect(cfg).toEqual({
      status: 'healthy',
      alertWebhookConfigured: false,
      geminiApiKeyConfigured: false,
      vcIssuerJwkConfigured: false,
      issuerKeyId: null,
    });
    expect(text).not.toContain('PRIVATEDETAIL');
  });

  it('stays unavailable in production', async () => {
    env.NODE_ENV = 'production';
    const res = await GET(req());
    expect(res.status).toBe(404);
  });
});
