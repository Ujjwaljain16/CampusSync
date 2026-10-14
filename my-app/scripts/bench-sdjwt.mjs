#!/usr/bin/env node
/**
 * In-memory benchmark of the SD-JWT helpers (no network, no database).
 *
 *   node scripts/bench-sdjwt.mjs [iterations]
 *
 * Requires Node >= 22.18 (runs src/lib/sdjwt.ts directly via built-in type
 * stripping). Numbers are machine-specific: they only describe the machine
 * that ran them. A fresh Ed25519 key is generated for every run; no key
 * material is printed.
 */
import { generateKeyPair, exportJWK } from 'jose';
import { issueSdJwt, present, verifyPresentation } from '../src/lib/sdjwt.ts';
import os from 'node:os';

const N = Number(process.argv[2] ?? 1000);

const { privateKey, publicKey } = await generateKeyPair('EdDSA', { extractable: true });
const issuerKey = { ...(await exportJWK(privateKey)), alg: 'EdDSA', kid: 'bench' };
const issuerPub = { ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: 'bench' };

const claims = {
  credential_ref: 'urn:uuid:0f0f0f0f-aaaa-bbbb-cccc-1234567890ab',
  title: 'BSc Computer Science',
  institution: 'Northfield University of Technology',
  date_issued: '2024-06-17',
  certificate_id: 'c7d1f2a0-1b2c-4d3e-8f90-123456789abc',
};
const disclosable = ['title', 'institution', 'date_issued', 'certificate_id'];

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}
function stats(label, samples) {
  const s = [...samples].sort((a, b) => a - b);
  console.log(
    `${label.padEnd(26)} p50=${pct(s, 50).toFixed(3)} ms  p95=${pct(s, 95).toFixed(3)} ms  p99=${pct(s, 99).toFixed(3)} ms`
  );
}

const tIssue = [];
const tPresent = [];
const tVerify = [];
let sizeOne = 0;
let sizeAll = 0;
const opts = { issuerPublicJwk: issuerPub };

// warm-up (JIT, WebCrypto init) is excluded from the measurements
for (let i = 0; i < 50; i++) {
  const { sdJwt } = await issueSdJwt({ claims, disclosable, issuerKey, issuer: 'did:web:bench', subject: 'urn:uuid:x', vct: 'urn:bench', expiresInSeconds: 3600 });
  await verifyPresentation(await present(sdJwt, { reveal: ['title'] }), opts);
}

for (let i = 0; i < N; i++) {
  let t = performance.now();
  const { sdJwt } = await issueSdJwt({ claims, disclosable, issuerKey, issuer: 'did:web:bench', subject: 'urn:uuid:x', vct: 'urn:bench', expiresInSeconds: 3600 });
  tIssue.push(performance.now() - t);

  t = performance.now();
  const one = await present(sdJwt, { reveal: ['title'] });
  tPresent.push(performance.now() - t);

  t = performance.now();
  const r = await verifyPresentation(one, opts);
  tVerify.push(performance.now() - t);
  if (!r.valid) throw new Error(`verification failed: ${r.reason}`);

  if (i === 0) {
    sizeOne = Buffer.byteLength(one, 'utf8');
    sizeAll = Buffer.byteLength(await present(sdJwt, { reveal: disclosable }), 'utf8');
  }
}

console.log(`SD-JWT benchmark: N=${N}, Ed25519 issuer, 4 selectively-disclosable claims, 2 decoys, reveal 1 of 4`);
console.log(`node ${process.version}, ${os.cpus()[0]?.model ?? 'unknown cpu'} x${os.cpus().length}, ${os.platform()} ${os.arch()}`);
stats('issue (sign)', tIssue);
stats('present (reveal 1 of 4)', tPresent);
stats('verify (1 disclosed)', tVerify);
console.log(`presentation size, 1 of 4 revealed: ${sizeOne} bytes`);
console.log(`presentation size, all 4 revealed:  ${sizeAll} bytes`);
