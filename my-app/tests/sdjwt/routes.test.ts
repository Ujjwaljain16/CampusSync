// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { generateKeyPair, exportJWK, base64url } from 'jose';
import type { JWK } from 'jose';
import { present, parseSdJwt, verifyPresentation, generateHolderKey } from '@/lib/sdjwt';

// ---- module mocks (factories create fresh fns; behaviour is set inside tests) ----
const state: {
  user: { id: string } | null;
  tables: Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }>;
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  fromCalls: string[];
  adminThrows: boolean;
  issuerJwk: JWK | null;
  orgIds: string[];
  /** every filter applied to a query: ['verifiable_credentials', 'eq', 'certificate_id', value] */
  filters: Array<[string, string, string, unknown]>;
  audits: Array<Record<string, unknown>>;
} = { user: null, tables: {}, inserts: [], fromCalls: [], adminThrows: false, issuerJwk: null, orgIds: [], filters: [], audits: [] };

function builder(table: string) {
  const result = () => ({ data: state.tables[table]?.data ?? null, error: state.tables[table]?.error ?? null });
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'in']) b[m] = () => b;
  for (const m of ['eq', 'contains']) {
    b[m] = (col: string, val: unknown) => {
      state.filters.push([table, m, col, val]);
      return b;
    };
  }
  const one = async () => {
    const r = result();
    return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
  };
  b.single = one;
  b.maybeSingle = one;
  b.insert = async (row: Record<string, unknown>) => {
    state.inserts.push({ table, row });
    return { error: state.tables[`${table}:insert`]?.error ?? null };
  };
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
  return b;
}

function fakeClient() {
  return {
    auth: { getUser: async () => (state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: 'no' } }) },
    from: (table: string) => {
      state.fromCalls.push(table);
      return builder(table);
    },
  };
}

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => fakeClient(),
  createSupabaseAdminClient: async () => {
    if (state.adminThrows) throw new Error('admin client unavailable');
    return fakeClient();
  },
  requireRole: async () => ({ authorized: false }),
}));

vi.mock('@/lib/api/utils/audit', () => ({
  writeAudit: async (_client: unknown, entry: Record<string, unknown>) => {
    state.audits.push(entry);
    return true;
  },
}));

vi.mock('@/lib/api/utils/organization', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  getOrganizationContext: async () => ({}),
  getTargetOrganizationIds: () => state.orgIds,
}));

vi.mock('@/lib/vc', () => ({
  getIssuerJwk: async () => state.issuerJwk,
  getIssuerVerificationKeys: undefined,
  getIssuerPublicJwk: undefined,
}));

import { POST as issuePOST } from '@/app/api/credentials/sd/issue/route';
import { POST as verifyPOST } from '@/app/api/credentials/sd/verify/route';

const CERT_ID = '3f6c1f0e-8b0a-4c7f-9a34-0123456789ab';
const STUDENT_ID = '9d2a7a7e-1111-4222-8333-444455556666';
const ORG_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VC_ID = 'urn:uuid:12345678-1234-4234-8234-123456789abc';

let issuerPub: JWK;
let ipCounter = 0;
const uniqueIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { extractable: true });
  state.issuerJwk = { ...(await exportJWK(privateKey)), alg: 'EdDSA', kid: 'route-key' } as JWK;
  issuerPub = { ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: 'route-key' } as JWK;
});

let uidCounter = 0;
const nextUser = () => ({ id: `${STUDENT_ID}-${++uidCounter}` });

const cert = (over: Record<string, unknown> = {}) => ({
  id: CERT_ID,
  student_id: STUDENT_ID,
  organization_id: ORG_ID,
  verification_status: 'verified',
  title: 'BSc Computer Science',
  institution: 'Northfield University',
  date_issued: '2024-06-17',
  description: null,
  // PII that must never make it into the token:
  student_name: 'Alice Example',
  email: 'alice@example.test',
  phone: '+1-555-0100',
  ...over,
});

function arrangeIssue(over: { cert?: Record<string, unknown> | null; vc?: unknown; user?: { id: string } | null; orgIds?: string[] } = {}) {
  // Each arrangement uses a fresh user id so the (real) per-user rate limiter never interferes.
  state.user = over.user === undefined ? nextUser() : over.user;
  state.orgIds = over.orgIds ?? [ORG_ID];
  state.tables = {
    certificates: { data: over.cert === undefined ? cert({ student_id: state.user?.id ?? STUDENT_ID }) : over.cert },
    verifiable_credentials: { data: over.vc === undefined ? [{ id: VC_ID, status: 'active', organization_id: ORG_ID }] : over.vc },
  };
  state.filters = [];
  state.audits = [];
}

function issueReq(body: unknown) {
  return new NextRequest('http://localhost/api/credentials/sd/issue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function verifyReq(body: unknown, ip = uniqueIp()) {
  return new NextRequest('http://localhost/api/credentials/sd/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const payloadOf = (sdJwt: string) => JSON.parse(new TextDecoder().decode(base64url.decode(parseSdJwt(sdJwt).jws.split('.')[1])));

beforeEach(() => {
  process.env.SD_JWT_ENABLED = 'true';
  delete process.env.NEXT_PUBLIC_ISSUER_DID;
  state.inserts = [];
  state.fromCalls = [];
  state.adminThrows = false;
});
afterEach(() => {
  delete process.env.SD_JWT_ENABLED;
});

describe('POST /api/credentials/sd/issue', () => {
  it('is disabled unless SD_JWT_ENABLED=true', async () => {
    delete process.env.SD_JWT_ENABLED;
    arrangeIssue({ user: { id: 'u-flag-off' } });
    const res = await issuePOST(issueReq({ certificateId: CERT_ID }));
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    arrangeIssue({ user: null });
    expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(401);
  });

  it('issues a verifiable SD-JWT with PII-free claims, opaque subject and no stored disclosures', async () => {
    arrangeIssue();
    const res = await issuePOST(issueReq({ certificateId: CERT_ID }));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const json = await res.json();
    const { sdJwt } = json.data;

    const parsed = parseSdJwt(sdJwt);
    expect(parsed.disclosures.map((d) => d.name).sort()).toEqual(['certificate_id', 'date_issued', 'institution', 'title']);
    const payload = payloadOf(sdJwt);
    expect(payload.credential_ref).toBe(VC_ID);
    expect(payload.sub).toMatch(/^urn:uuid:/);
    expect(payload.sub).not.toContain(state.user!.id);
    expect(payload.title).toBeUndefined();

    // nothing PII-like anywhere in the token or its disclosures
    const all = JSON.stringify([payload, parsed.disclosures]);
    for (const pii of ['Alice', 'alice@example.test', '+1-555-0100', state.user!.id]) expect(all).not.toContain(pii);

    // full disclosure verifies against the issuer public key
    const r = await verifyPresentation(await present(sdJwt, { reveal: ['title', 'institution', 'date_issued', 'certificate_id'] }), { issuerPublicJwk: issuerPub, expectedIssuer: 'did:web:example.org' });
    expect(r.valid).toBe(true);
    expect(r.claims).toMatchObject({ title: 'BSc Computer Science', institution: 'Northfield University', date_issued: '2024-06-17', certificate_id: CERT_ID });

    // accounting row: digests only, never disclosures
    const acc = state.inserts.find((i) => i.table === 'sd_issuances');
    expect(acc).toBeTruthy();
    expect(Object.keys(acc!.row).sort()).toEqual(['created_at', 'credential_id', 'digest_list_hash', 'sd_jti']);
    for (const d of parsed.disclosures) expect(JSON.stringify(state.inserts)).not.toContain(d.encoded);
    expect(JSON.stringify(state.inserts)).not.toContain(sdJwt);
  });

  it('includes degree_level / description only when present', async () => {
    arrangeIssue({ cert: cert({ description: 'With distinction', degree_level: 'Bachelor' }) }); state.tables.certificates.data = cert({ student_id: state.user!.id, description: 'With distinction', degree_level: 'Bachelor' });
    const { data } = await (await issuePOST(issueReq({ certificateId: CERT_ID }))).json();
    expect(parseSdJwt(data.sdJwt).disclosures.map((d) => d.name).sort()).toEqual(['certificate_id', 'date_issued', 'degree_level', 'description', 'institution', 'title']);
    arrangeIssue(); state.tables.certificates.data = cert({ student_id: state.user!.id, description: '   ' });
    const { data: d2 } = await (await issuePOST(issueReq({ certificateId: CERT_ID }))).json();
    expect(parseSdJwt(d2.sdJwt).disclosures.map((d) => d.name)).not.toContain('description');
  });

  it('binds the token to a supplied holder public key and rejects private/unsupported keys', async () => {
    arrangeIssue();
    const holder = await generateHolderKey();
    const ok = await issuePOST(issueReq({ certificateId: CERT_ID, holderPublicJwk: holder.publicJwk }));
    expect(ok.status).toBe(201);
    const { data } = await ok.json();
    expect(payloadOf(data.sdJwt).cnf.jwk).toMatchObject({ kty: 'EC', crv: 'P-256' });

    arrangeIssue();
    const withD = await issuePOST(issueReq({ certificateId: CERT_ID, holderPublicJwk: { ...holder.publicJwk, d: 'secret' } }));
    expect(withD.status).toBe(400);
    arrangeIssue();
    expect((await issuePOST(issueReq({ certificateId: CERT_ID, holderPublicJwk: { kty: 'oct', k: 'AAAA' } }))).status).toBe(400);
  });

  it('rejects invalid bodies', async () => {
    arrangeIssue();
    expect((await issuePOST(issueReq('not json'))).status).toBe(400);
    expect((await issuePOST(issueReq({ certificateId: 'nope' }))).status).toBe(400);
    expect((await issuePOST(issueReq({}))).status).toBe(400);
    expect((await issuePOST(issueReq({ certificateId: CERT_ID, expiresInSeconds: 'x' }))).status).toBe(400);
  });

  it('clamps the requested lifetime', async () => {
    arrangeIssue();
    const { data } = await (await issuePOST(issueReq({ certificateId: CERT_ID, expiresInSeconds: 10 * 365 * 24 * 3600 }))).json();
    const p = payloadOf(data.sdJwt);
    expect(p.exp - p.iat).toBe(90 * 24 * 3600);
  });

  it('404 for a certificate owned by someone else (no existence leak)', async () => {
    arrangeIssue({ cert: cert({ student_id: 'someone-else' }) });
    expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(404);
  });

  it('403 for a certificate that is not verified', async () => {
    for (const status of ['pending', 'rejected']) {
      arrangeIssue();
      state.tables.certificates.data = cert({ student_id: state.user!.id, verification_status: status });
      expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(403);
    }
  });

  it('403 when the certificate is outside the caller organisations', async () => {
    arrangeIssue({ orgIds: ['other-org'] });
    expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(403);
  });

  it('looks the credential up by certificate_id (+ active, owner), not by JSON containment', async () => {
    arrangeIssue();
    expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(201);
    const vcFilters = state.filters.filter(([t]) => t === 'verifiable_credentials');
    expect(vcFilters).toContainEqual(['verifiable_credentials', 'eq', 'certificate_id', CERT_ID]);
    expect(vcFilters).toContainEqual(['verifiable_credentials', 'eq', 'status', 'active']);
    expect(vcFilters.some(([, method]) => method === 'contains')).toBe(false);
  });

  it('audits through writeAudit with the canonical credential target', async () => {
    arrangeIssue();
    const res = await issuePOST(issueReq({ certificateId: CERT_ID }));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(state.audits).toEqual([
      {
        actorId: state.user!.id,
        organizationId: ORG_ID,
        action: 'issue_sd_jwt',
        targetType: 'credential',
        targetId: VC_ID,
        details: { sd_jti: data.jti, certificateId: CERT_ID },
      },
    ]);
    // no hand-rolled audit_logs insert with entity_type / entity_id
    expect(state.inserts.filter((i) => i.table === 'audit_logs')).toEqual([]);
  });

  it('404 when there is no ACTIVE credential (e.g. revoked), 500 on lookup error', async () => {
    arrangeIssue({ vc: [] });
    expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(404);
    arrangeIssue();
    state.tables.verifiable_credentials = { data: null, error: { message: 'boom' } };
    expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(500);
  });

  it('still succeeds when the optional sd_issuances table is missing (42P01 / PGRST205)', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      arrangeIssue();
      state.tables['sd_issuances:insert'] = { error: { code } };
      expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(201);
    }
  });

  it('refuses to sign with the development placeholder key', async () => {
    arrangeIssue();
    const saved = state.issuerJwk;
    state.issuerJwk = { kty: 'RSA', n: 'placeholder-n-value-for-development', e: 'AQAB', alg: 'RS256' } as JWK;
    try {
      expect((await issuePOST(issueReq({ certificateId: CERT_ID }))).status).toBe(503);
    } finally {
      state.issuerJwk = saved;
    }
  });

  it('is rate limited per user', async () => {
    arrangeIssue({ user: { id: 'rate-limited-user' } });
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await issuePOST(issueReq({ certificateId: 'bad' }))).status;
    expect(last).toBe(429);
  });
});

describe('POST /api/credentials/sd/verify', () => {
  async function makePresentation(reveal: string[], opts: { holder?: boolean; audience?: string; nonce?: string; claimsOverride?: (c: Record<string, unknown>) => Record<string, unknown> } = {}) {
    // Obtain a real token through the real issue route
    arrangeIssue();
    const holder = opts.holder ? await generateHolderKey() : null;
    const res = await issuePOST(issueReq({ certificateId: CERT_ID, ...(holder ? { holderPublicJwk: holder.publicJwk } : {}) }));
    const { data } = await res.json();
    return present(data.sdJwt, { reveal, holderKey: holder?.privateKey, audience: opts.audience, nonce: opts.nonce });
  }

  function arrangeVc(vc: { data?: unknown; error?: { code?: string; message?: string } | null }) {
    state.tables = { verifiable_credentials: vc };
    state.fromCalls = [];
  }

  it('is disabled unless SD_JWT_ENABLED=true', async () => {
    delete process.env.SD_JWT_ENABLED;
    expect((await verifyPOST(verifyReq({ presentation: 'x~' }))).status).toBe(404);
  });

  it('is public: needs no authenticated user', async () => {
    const p = await makePresentation(['title']);
    state.user = null;
    arrangeVc({ data: { id: VC_ID, status: 'active' } });
    const res = await verifyPOST(verifyReq({ presentation: p }));
    expect(res.status).toBe(200);
  });

  it('returns only disclosed claims and names of the undisclosed ones', async () => {
    const p = await makePresentation(['title', 'institution']);
    arrangeVc({ data: { id: VC_ID, status: 'active' } });
    const res = await verifyPOST(verifyReq({ presentation: p }));
    const { data } = await res.json();
    expect(data).toMatchObject({ valid: true, reason: 'ok', keyBound: false, credentialStatus: 'active', issuer: 'did:web:example.org' });
    expect(data.claims.title).toBe('BSc Computer Science');
    expect(data.claims.institution).toBe('Northfield University');
    expect(data.claims.date_issued).toBeUndefined();
    expect(data.claims.certificate_id).toBeUndefined();
    expect(data.claims.cnf).toBeUndefined();
    expect([...data.disclosed].sort()).toEqual(['institution', 'title']);
    expect([...data.notDisclosed].sort()).toEqual(['certificate_id', 'date_issued']);
    expect(JSON.stringify(data)).not.toContain('2024-06-17');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects a revoked credential (no claims returned)', async () => {
    const p = await makePresentation(['title']);
    arrangeVc({ data: { id: VC_ID, status: 'revoked' } });
    const { data } = await (await verifyPOST(verifyReq({ presentation: p }))).json();
    expect(data).toMatchObject({ valid: false, reason: 'credential_revoked', credentialStatus: 'revoked', claims: {} });
  });

  it('treats suspended/expired credentials as not valid', async () => {
    const p = await makePresentation(['title']);
    arrangeVc({ data: { id: VC_ID, status: 'suspended' } });
    const { data } = await (await verifyPOST(verifyReq({ presentation: p }))).json();
    expect(data).toMatchObject({ valid: false, reason: 'credential_inactive' });
  });

  it('fails closed when the revocation lookup errors, throws or finds nothing', async () => {
    const p = await makePresentation(['title']);
    arrangeVc({ data: null, error: { message: 'db down' } });
    let { data } = await (await verifyPOST(verifyReq({ presentation: p }))).json();
    expect(data).toMatchObject({ valid: false, reason: 'revocation_check_failed', claims: {} });

    arrangeVc({ data: null });
    ({ data } = await (await verifyPOST(verifyReq({ presentation: p }))).json());
    expect(data).toMatchObject({ valid: false, reason: 'credential_not_found' });

    arrangeVc({ data: { id: VC_ID, status: 'active' } });
    state.adminThrows = true;
    ({ data } = await (await verifyPOST(verifyReq({ presentation: p }))).json());
    expect(data).toMatchObject({ valid: false, reason: 'revocation_check_failed', claims: {} });
  });

  it('does not touch the database when the signature check already failed', async () => {
    const p = await makePresentation(['title']);
    arrangeVc({ data: { id: VC_ID, status: 'active' } });
    const tampered = p.replace(/^(.{20})./, (_m, a) => a + (p[20] === 'A' ? 'B' : 'A'));
    const { data } = await (await verifyPOST(verifyReq({ presentation: tampered }))).json();
    expect(data.valid).toBe(false);
    expect(['bad_signature', 'malformed_jws', 'unsupported_alg']).toContain(data.reason);
    expect(state.fromCalls).toEqual([]);
  });

  it('rejects an unknown disclosure', async () => {
    const p = await makePresentation(['title']);
    arrangeVc({ data: { id: VC_ID, status: 'active' } });
    const fake = base64url.encode(new TextEncoder().encode(JSON.stringify(['c2FsdHNhbHRzYWx0c2FsdA', 'role', 'admin'])));
    const { data } = await (await verifyPOST(verifyReq({ presentation: p + fake + '~' }))).json();
    expect(data).toMatchObject({ valid: false, reason: 'unknown_disclosure_digest' });
  });

  it('checks audience and nonce when the verifier supplies them', async () => {
    const p = await makePresentation(['title'], { holder: true, audience: 'recruiter.example', nonce: 'abc' });
    arrangeVc({ data: { id: VC_ID, status: 'active' } });
    let { data } = await (await verifyPOST(verifyReq({ presentation: p, audience: 'recruiter.example', nonce: 'abc' }))).json();
    expect(data).toMatchObject({ valid: true, keyBound: true });
    expect(data.keyBinding).toMatchObject({ audience: 'recruiter.example', nonce: 'abc' });

    ({ data } = await (await verifyPOST(verifyReq({ presentation: p, audience: 'other.example' }))).json());
    expect(data).toMatchObject({ valid: false, reason: 'kb_audience_mismatch' });
    ({ data } = await (await verifyPOST(verifyReq({ presentation: p, nonce: 'zzz' }))).json());
    expect(data).toMatchObject({ valid: false, reason: 'kb_nonce_mismatch' });

    const unbound = await makePresentation(['title']);
    ({ data } = await (await verifyPOST(verifyReq({ presentation: unbound, audience: 'recruiter.example' }))).json());
    expect(data).toMatchObject({ valid: false, reason: 'key_binding_required' });
  });

  it('rejects bad request bodies', async () => {
    expect((await verifyPOST(verifyReq('nope'))).status).toBe(400);
    expect((await verifyPOST(verifyReq({}))).status).toBe(400);
    expect((await verifyPOST(verifyReq({ presentation: 42 }))).status).toBe(400);
    expect((await verifyPOST(verifyReq({ presentation: 'x'.repeat(16 * 1024 + 1) }))).status).toBe(400);
    expect((await verifyPOST(verifyReq({ presentation: 'a~', audience: 5 }))).status).toBe(400);
    expect((await verifyPOST(verifyReq({ presentation: 'a~', nonce: '' }))).status).toBe(400);
  });

  it('garbage presentations are reported as invalid, not as server errors', async () => {
    arrangeVc({ data: { id: VC_ID, status: 'active' } });
    const res = await verifyPOST(verifyReq({ presentation: 'garbage' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ valid: false, reason: 'malformed_presentation' });
  });

  it('accepts keys from getIssuerVerificationKeys() when the vc module provides it', async () => {
    const p = await makePresentation(['title']);
    arrangeVc({ data: { id: VC_ID, status: 'active' } });
    vi.resetModules();
    vi.doMock('@/lib/vc', () => ({
      getIssuerJwk: async () => state.issuerJwk,
      getIssuerVerificationKeys: async () => [issuerPub],
    }));
    const { POST } = await import('@/app/api/credentials/sd/verify/route');
    const { data } = await (await POST(verifyReq({ presentation: p }))).json();
    expect(data.valid).toBe(true);
    vi.doUnmock('@/lib/vc');
  });

  it('is rate limited per client IP', async () => {
    arrangeVc({ data: null });
    const ip = uniqueIp();
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await verifyPOST(verifyReq({ presentation: 'garbage' }, ip))).status;
    expect(last).toBe(429);
  });
});
