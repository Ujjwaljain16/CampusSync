// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { main, parseArgs } from '../../../verifier/src/cli.mjs';
import { ISSUER, LIST_URL, NOW, bitstring, credentialStatus, fakeFetch, jwksOf, makeKey, signCred, signList } from './helpers';

function run(argv: string[], files: Record<string, string> = {}, extra: { fetch?: typeof fetch } = {}) {
  let out = '';
  let err = '';
  const code = main(argv, {
    stdout: s => (out += s),
    stderr: s => (err += s),
    readFile: async p => {
      if (!(p in files)) throw new Error('ENOENT');
      return files[p];
    },
    now: NOW,
    fetch: extra.fetch,
  });
  return code.then(c => ({ code: c, out, err }));
}

describe('campussync-verify CLI', () => {
  it('prints a human summary and exits 0 for a valid credential', async () => {
    const key = await makeKey();
    const { jws, id } = await signCred(key);
    const r = await run([jws, '--jwks', 'keys.json'], { 'keys.json': JSON.stringify(jwksOf(key)) });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^VALID/);
    expect(r.out).toContain(id);
    expect(r.out).toContain('[ok] signature');
    expect(r.out).toContain(`key id:     ${key.kid}`);
    expect(r.out).toMatch(/not pinned/);
  });

  it('exits 1 with the reason code for an invalid credential', async () => {
    const key = await makeKey();
    const other = await makeKey();
    const { jws } = await signCred(other, { kid: key.kid });
    const r = await run([jws, '--jwks', 'keys.json'], { 'keys.json': JSON.stringify(jwksOf(key)) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('INVALID (invalid_signature)');
    expect(r.out).toContain('[FAIL] signature');
  });

  it('reads the credential from a file (JSON with proof.jws) and --issuer pins the issuer', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const files = { 'cred.json': JSON.stringify({ proof: { jws } }), 'keys.json': JSON.stringify(jwksOf(key)) };
    expect((await run(['cred.json', '--jwks', 'keys.json', '--issuer', ISSUER], files)).code).toBe(0);
    const bad = await run(['cred.json', '--jwks', 'keys.json', '--issuer', 'did:web:other.test'], files);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('issuer_mismatch');
  });

  it('--json prints the full result; --no-status skips revocation; revoked credentials exit 1', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key, { status: credentialStatus(3) });
    const list = await signList(key, bitstring(131072, [3]));
    const f = fakeFetch({ [LIST_URL]: list });
    const files = { 'keys.json': JSON.stringify(jwksOf(key)) };

    const revoked = await run([jws, '--jwks', 'keys.json', '--json'], files, { fetch: f.f });
    expect(revoked.code).toBe(1);
    expect(JSON.parse(revoked.out)).toMatchObject({ valid: false, reason: 'revoked', revoked: true });

    const skipped = await run([jws, '--jwks', 'keys.json', '--no-status', '--json'], files, { fetch: f.f });
    expect(skipped.code).toBe(0);
    expect(JSON.parse(skipped.out)).toMatchObject({ valid: true, revoked: null });
  });

  it('--jwks with an https URL is fetched', async () => {
    const key = await makeKey();
    const { jws } = await signCred(key);
    const f = fakeFetch({ 'https://keys.example/jwks.json': jwksOf(key) });
    const r = await run([jws, '--jwks', 'https://keys.example/jwks.json'], {}, { fetch: f.f });
    expect(r.code).toBe(0);
    expect(f.calls).toHaveLength(1);
  });

  it('usage and input errors exit 2', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['--bogus', 'x'])).code).toBe(2);
    expect((await run(['a', 'b'])).code).toBe(2);
    expect((await run(['--jwks'])).code).toBe(2);
    const missing = await run(['nope.jws']);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain('Cannot read');
    const key = await makeKey();
    const { jws } = await signCred(key);
    expect((await run([jws, '--jwks', 'missing.json'])).code).toBe(2);
    const help = await run(['--help']);
    expect(help.code).toBe(0);
    expect(help.out).toContain('Usage: campussync-verify');
  });

  it('parseArgs validates --max-status-age', () => {
    expect(parseArgs(['x', '--max-status-age', '60']).opts.maxStatusAge).toBe(60);
    expect(() => parseArgs(['x', '--max-status-age', '-1'])).toThrow();
  });
});
