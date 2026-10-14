// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPair, exportJWK, type JWK } from 'jose';
import { FakeDb } from './fakeDb';
import { __resetRateLimitStore } from '@/lib/rateLimit';
import { __resetTlogCaches, appendEvent, hashStudentId, type TlogEvent } from '@/lib/transparencyLog';
import { verifyInclusionProofResponse, verifyConsistencyProofResponse, type Jwks } from '@/lib/tlogVerify';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabaseServer', () => ({ createSupabaseAdminClient: vi.fn() }));
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

import { GET as getSth } from '@/app/api/transparency/sth/route';
import { GET as getInclusion } from '@/app/api/transparency/proof/inclusion/route';
import { GET as getConsistency } from '@/app/api/transparency/proof/consistency/route';
import { GET as getEntries } from '@/app/api/transparency/entries/route';

let jwks: Jwks;
beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  process.env.VC_ISSUER_JWK = JSON.stringify({ ...(await exportJWK(privateKey)), alg: 'ES256', use: 'sig', kid: 'route-key' });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  jwks = { keys: [{ ...(await exportJWK(publicKey)), alg: 'ES256', use: 'sig', kid: 'route-key' } as JWK] };
});

beforeEach(() => {
  __resetTlogCaches();
  __resetRateLimitStore();
  vi.stubEnv('TRANSPARENCY_LOG_SALT', 'route-test-salt-0123456789abcdef');
  vi.stubEnv('TRANSPARENCY_LOG_ID', 'route-log');
});
afterEach(() => vi.unstubAllEnvs());

const ev = (i: number): TlogEvent => ({
  type: 'credential.issued',
  credentialId: `cred-${i}`,
  studentHash: hashStudentId(`s-${i}`),
  at: new Date(Date.UTC(2026, 9, 14, 9, 0, i)).toISOString(),
});

async function setup(entries: number, enabled = true) {
  if (enabled) vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
  const db = new FakeDb();
  for (let i = 0; i < entries; i++) await appendEvent(db as unknown as SupabaseClient, ev(i));
  vi.mocked(createSupabaseAdminClient).mockResolvedValue(db as never);
  return db;
}
const req = (path: string, ip = '203.0.113.7') => new Request(`http://localhost${path}`, { headers: { 'x-real-ip': ip } });

describe('feature flag', () => {
  it('every endpoint answers 404 and never touches the database when TRANSPARENCY_LOG_ENABLED is not "true"', async () => {
    const db = await setup(3, false);
    for (const [handler, path] of [
      [getSth, '/api/transparency/sth'],
      [getInclusion, '/api/transparency/proof/inclusion?index=0'],
      [getConsistency, '/api/transparency/proof/consistency?first=1&second=2'],
      [getEntries, '/api/transparency/entries'],
    ] as const) {
      const res = await handler(req(path));
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', '1');
    expect((await getSth(req('/api/transparency/sth'))).status).toBe(404);
    void db;
  });

  it('answers 503 (not 500) when the tables are missing, without leaking details', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(createSupabaseAdminClient).mockResolvedValue(new FakeDb({ failWith: '42P01' }) as never);
    const res = await getSth(req('/api/transparency/sth'));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/42P01|tlog_|relation/);
  });

  it('answers 503 when the admin client cannot be created', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createSupabaseAdminClient).mockRejectedValue(new Error('missing env'));
    expect((await getEntries(req('/api/transparency/entries'))).status).toBe(503);
  });
});

describe('GET /api/transparency/sth', () => {
  it('returns the latest signed tree head with cache headers; empty log is 404', async () => {
    await setup(0);
    expect((await getSth(req('/api/transparency/sth'))).status).toBe(404);
    await setup(5);
    const res = await getSth(req('/api/transparency/sth'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/public.*max-age=\d+/);
    const body = await res.json();
    expect(body).toMatchObject({ treeSize: 5, logId: 'route-log' });
    expect(body.rootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof body.jws).toBe('string');
  });
});

describe('GET /api/transparency/proof/inclusion', () => {
  it('returns entry + proof + head that verify offline, and immutable caching for an explicit size', async () => {
    await setup(11);
    const res = await getInclusion(req('/api/transparency/proof/inclusion?index=6&treeSize=11'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
    const body = await res.json();
    expect(body).toMatchObject({ index: 6, treeSize: 11, entry: { credentialId: 'cred-6' } });
    expect((await verifyInclusionProofResponse(body, { jwks, expectedCredentialId: 'cred-6' })).ok).toBe(true);

    const latest = await getInclusion(req('/api/transparency/proof/inclusion?index=0'));
    expect(latest.status).toBe(200);
    expect(latest.headers.get('cache-control')).not.toContain('immutable');
    expect((await verifyInclusionProofResponse(await latest.json(), { jwks })).ok).toBe(true);
  });

  it.each([
    'index=-1',
    'index=1.5',
    'index=1e3',
    'index=%201',
    'index=abc',
    'index=',
    'index=007',
    'index=99999999999999999999',
    '',
    'index=3&treeSize=3',
    'index=0&treeSize=0',
    'index=0&treeSize=-4',
    'index=0&treeSize=x',
    'index=5',
  ])('rejects bad input (%s) with 400', async (qs) => {
    await setup(5);
    const res = await getInclusion(req(`/api/transparency/proof/inclusion?${qs}`));
    expect(res.status).toBe(400);
  });

  it('404 when no head exists for the requested size', async () => {
    await setup(5);
    expect((await getInclusion(req('/api/transparency/proof/inclusion?index=0&treeSize=999'))).status).toBe(404);
  });
});

describe('GET /api/transparency/proof/consistency', () => {
  it('returns a verifiable proof', async () => {
    await setup(12);
    const res = await getConsistency(req('/api/transparency/proof/consistency?first=5&second=12'));
    expect(res.status).toBe(200);
    expect((await verifyConsistencyProofResponse(await res.json(), { jwks })).ok).toBe(true);
  });

  it.each(['first=0&second=3', 'first=4&second=3', 'first=a&second=3', 'first=1', 'second=3', 'first=1&second=1.0'])(
    'rejects bad input (%s) with 400',
    async (qs) => {
      await setup(5);
      expect((await getConsistency(req(`/api/transparency/proof/consistency?${qs}`))).status).toBe(400);
    }
  );

  it('404 when a head for one of the sizes does not exist', async () => {
    await setup(5);
    expect((await getConsistency(req('/api/transparency/proof/consistency?first=2&second=50'))).status).toBe(404);
  });
});

describe('GET /api/transparency/entries', () => {
  it('pages with from/limit (default 50, max 100) and exposes only pseudonymous fields', async () => {
    await setup(7);
    const res = await getEntries(req('/api/transparency/entries?from=2&limit=3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.map((e: { index: number }) => e.index)).toEqual([2, 3, 4]);
    expect(body.nextFrom).toBe(5);
    expect(JSON.stringify(body)).not.toMatch(/@|s-\d/);
    const all = await (await getEntries(req('/api/transparency/entries'))).json();
    expect(all.entries).toHaveLength(7);
  });

  it('finds events by credentialId', async () => {
    await setup(4);
    const body = await (await getEntries(req('/api/transparency/entries?credentialId=cred-2'))).json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].entry.credentialId).toBe('cred-2');
    expect((await getEntries(req('/api/transparency/entries?credentialId=a%20b'))).status).toBe(400);
  });

  it.each(['limit=101', 'limit=0', 'limit=-1', 'limit=x', 'from=-1', 'from=1.5', 'from=abc'])('rejects %s with 400', async (qs) => {
    await setup(3);
    expect((await getEntries(req(`/api/transparency/entries?${qs}`))).status).toBe(400);
  });
});

describe('rate limiting', () => {
  it('returns 429 with Retry-After once a client exceeds the limit, per endpoint and per client', async () => {
    await setup(2);
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) last = await getSth(req('/api/transparency/sth', '198.51.100.9'));
    expect(last?.status).toBe(429);
    expect(last?.headers.get('retry-after')).toBeTruthy();
    // another client and another endpoint are unaffected
    expect((await getSth(req('/api/transparency/sth', '198.51.100.10'))).status).toBe(200);
    expect((await getEntries(req('/api/transparency/entries', '198.51.100.9'))).status).toBe(200);
  });
});
