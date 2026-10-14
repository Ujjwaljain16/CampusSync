// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { calculateJwkThumbprint, decodeProtectedHeader } from 'jose';

vi.mock('@/lib/envServer', () => ({ getIssuerJwkJson: vi.fn() }));

import { getIssuerJwkJson } from '@/lib/envServer';
import { signCredential } from '@/lib/vc';

const script = fileURLToPath(new URL('../../scripts/generate-issuer-key.mjs', import.meta.url));

describe('scripts/generate-issuer-key.mjs', () => {
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });

  it('prints a VC_ISSUER_JWK line with a private Ed25519 key and a matching public key; warns on stderr', () => {
    expect(run.status).toBe(0);
    const lines = run.stdout.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('VC_ISSUER_JWK=')).toBe(true);

    const priv = JSON.parse(lines[0].slice('VC_ISSUER_JWK='.length));
    const pub = JSON.parse(lines[1]);
    expect(priv).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });
    expect(typeof priv.d).toBe('string');
    expect(pub).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', x: priv.x, kid: priv.kid });
    expect(pub).not.toHaveProperty('d');
    expect(run.stdout).not.toContain('WARNING'); // the warning goes to stderr so stdout stays machine-readable
    expect(run.stderr).toMatch(/PRIVATE KEY/);
    expect(run.stderr).not.toContain(priv.d); // the private scalar is printed exactly once, on stdout
  });

  it('kid is the RFC 7638 thumbprint, and the key works for signing', async () => {
    const priv = JSON.parse(run.stdout.trim().split('\n')[0].slice('VC_ISSUER_JWK='.length));
    expect(priv.kid).toBe(await calculateJwkThumbprint({ kty: priv.kty, crv: priv.crv, x: priv.x }, 'sha256'));
    vi.mocked(getIssuerJwkJson).mockReturnValue(JSON.stringify(priv));
    const vc = await signCredential({
      issuerDid: 'did:web:campussync.test',
      credential: { credentialSubject: { id: 's', certificateId: 'c', title: 't', institution: 'i', dateIssued: '2025-01-01' } },
    });
    expect(decodeProtectedHeader(vc.proof.jws)).toMatchObject({ alg: 'EdDSA', kid: priv.kid });
  });

  it('generates a different key on every run', () => {
    const again = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(again.stdout).not.toBe(run.stdout);
  });
});
