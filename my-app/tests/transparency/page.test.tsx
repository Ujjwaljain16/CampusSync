// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// vitest's jsdom environment replaces the global Uint8Array with jsdom's realm, so typed arrays
// produced by Node (Buffer, WebCrypto, TextEncoder) fail `instanceof Uint8Array` inside jose.
// Real browsers have a single realm; restore Node's Uint8Array for this test only.
vi.hoisted(() => {
  const NodeUint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
  Object.assign(globalThis, { Uint8Array: NodeUint8Array });
});
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { generateKeyPair, exportJWK, type JWK } from 'jose';
import { FakeDb } from './fakeDb';
import { __resetRateLimitStore } from '@/lib/rateLimit';
import { __resetTlogCaches, appendEvent, hashStudentId } from '@/lib/transparencyLog';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabaseServer', () => ({ createSupabaseAdminClient: vi.fn() }));
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

import { GET as getSth } from '@/app/api/transparency/sth/route';
import { GET as getInclusion } from '@/app/api/transparency/proof/inclusion/route';
import { GET as getConsistency } from '@/app/api/transparency/proof/consistency/route';
import { GET as getEntries } from '@/app/api/transparency/entries/route';
import TransparencyPage from '@/app/transparency/page';

let jwks: { keys: JWK[] };
beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  process.env.VC_ISSUER_JWK = JSON.stringify({ ...(await exportJWK(privateKey)), alg: 'ES256', use: 'sig', kid: 'page-key' });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  jwks = { keys: [{ ...(await exportJWK(publicKey)), alg: 'ES256', use: 'sig', kid: 'page-key' } as JWK] };
});

let db: FakeDb;
beforeEach(async () => {
  __resetTlogCaches();
  __resetRateLimitStore();
  window.localStorage.clear();
  vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'true');
  vi.stubEnv('TRANSPARENCY_LOG_SALT', 'page-test-salt-0123456789abcdef');
  db = new FakeDb();
  vi.mocked(createSupabaseAdminClient).mockResolvedValue(db as never);
  for (let i = 0; i < 6; i++) {
    await appendEvent(db as unknown as SupabaseClient, {
      type: i === 5 ? 'credential.revoked' : 'credential.issued',
      credentialId: i === 5 ? 'cred-1' : `cred-${i}`,
      studentHash: hashStudentId(`s-${i}`),
      at: new Date(Date.UTC(2026, 9, 14, 8, 0, i)).toISOString(),
    });
  }
  // Route the page's fetch() calls to the real route handlers + the JWKS document.
  vi.stubGlobal('fetch', async (input: string) => {
    const req = new Request(`http://localhost${input}`, { headers: { 'x-real-ip': '192.0.2.1' } });
    const path = input.split('?')[0];
    if (path === '/.well-known/jwks.json') return Response.json(jwks);
    if (path === '/api/transparency/sth') return getSth(req);
    if (path === '/api/transparency/entries') return getEntries(req);
    if (path === '/api/transparency/proof/inclusion') return getInclusion(req);
    if (path === '/api/transparency/proof/consistency') return getConsistency(req);
    return new Response('{}', { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('/transparency page', () => {
  it('shows the verified latest tree head and verifies a credential inclusion proof in the browser', async () => {
    render(<TransparencyPage />);
    await waitFor(() => expect(screen.getByText('Tree head signature.')).toBeTruthy());
    expect(screen.getAllByText('PASS').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('FAIL')).toBeNull();

    fireEvent.change(screen.getByLabelText('Credential id'), { target: { value: 'cred-1' } });
    fireEvent.click(screen.getByRole('button', { name: /fetch and verify/i }));
    // cred-1 has two events: issued (#1) and revoked (#5)
    await waitFor(() => expect(screen.getByText('credential.revoked')).toBeTruthy());
    expect(screen.getByText('credential.issued')).toBeTruthy();
    expect(screen.queryByText('FAIL')).toBeNull();
    expect(screen.getAllByText('Merkle inclusion proof.').length).toBe(2);
  });

  it('rejects malformed input locally and reports unknown credentials', async () => {
    render(<TransparencyPage />);
    await waitFor(() => expect(screen.getByText('Tree head signature.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Credential id'), { target: { value: 'bad id!' } });
    fireEvent.click(screen.getByRole('button', { name: /fetch and verify/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Enter a credential id/));
    fireEvent.change(screen.getByLabelText('Credential id'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /fetch and verify/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/No events/));
  });

  it('flags a FAIL when the log returns a tampered proof', async () => {
    render(<TransparencyPage />);
    await waitFor(() => expect(screen.getByText('Tree head signature.')).toBeTruthy());
    const honest = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: string) => {
      const res = await honest(input);
      if (!input.startsWith('/api/transparency/proof/inclusion')) return res;
      const body = await res.json();
      body.entry.type = 'credential.revoked'; // lie about what was logged
      return Response.json(body);
    });
    fireEvent.change(screen.getByLabelText('Credential id'), { target: { value: 'cred-2' } });
    fireEvent.click(screen.getByRole('button', { name: /fetch and verify/i }));
    await waitFor(() => expect(screen.getAllByText('FAIL').length).toBeGreaterThan(0));
  });

  it('asks for an append-only proof on a repeat visit and shows it passing', async () => {
    const first = render(<TransparencyPage />);
    await waitFor(() => expect(screen.getByText('Tree head signature.')).toBeTruthy());
    expect(window.localStorage.length).toBe(1);
    first.unmount();

    await appendEvent(db as unknown as SupabaseClient, {
      type: 'credential.issued',
      credentialId: 'cred-new',
      studentHash: hashStudentId('s-new'),
      at: new Date(Date.UTC(2026, 9, 14, 9, 0, 0)).toISOString(),
    });
    render(<TransparencyPage />);
    await waitFor(() => expect(screen.getByText(/Verified: the log grew from 6 to 7 entries/)).toBeTruthy());
  });

  it('flags a log that no longer extends the head this browser saw (rewritten history)', async () => {
    render(<TransparencyPage />);
    await waitFor(() => expect(screen.getByText('Tree head signature.')).toBeTruthy());
    cleanup();
    // Pretend we previously saw a different 4-entry head: its root does not match what the log can prove.
    const stored = JSON.parse(window.localStorage.getItem(window.localStorage.key(0) as string) as string);
    const fake = { ...stored, treeSize: 4, rootHash: 'd'.repeat(64) };
    window.localStorage.setItem(window.localStorage.key(0) as string, JSON.stringify(fake));
    render(<TransparencyPage />);
    await waitFor(() => expect(screen.getByText(/does not prove it is an append-only extension/)).toBeTruthy());
    // a failed append-only check must not overwrite what we remembered
    expect(JSON.parse(window.localStorage.getItem(window.localStorage.key(0) as string) as string).rootHash).toBe('d'.repeat(64));
  });

  it('explains clearly when the log is disabled', async () => {
    vi.stubEnv('TRANSPARENCY_LOG_ENABLED', 'false');
    render(<TransparencyPage />);
    await waitFor(() => expect(screen.getByText(/not enabled on this deployment/)).toBeTruthy());
    expect(screen.getByText(/does not prove/i)).toBeTruthy();
  });
});
