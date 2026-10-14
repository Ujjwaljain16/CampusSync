// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

describe('vendored verifier copy used by the /verify page', () => {
  it.each(['verify.mjs', 'verify.d.mts'])('src/lib/offlineVerify/%s is identical to verifier/src/%s', file => {
    expect(
      read(`../../src/lib/offlineVerify/${file}`) === read(`../../../verifier/src/${file}`),
      'The app copy drifted from the canonical verifier. Run: node scripts/sync-verifier.mjs (from my-app/)'
    ).toBe(true);
  });

  it('the shared module has no Node-only imports (it must run in browsers)', () => {
    const src = read('../../../verifier/src/verify.mjs');
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
    expect(imports).toEqual(['jose']);
    expect(src).not.toMatch(/\brequire\(|\bprocess\.|\bBuffer\b/);
  });
});
