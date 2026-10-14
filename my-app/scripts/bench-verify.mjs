// Micro-benchmark of OFFLINE credential verification (verifier/src/verify.mjs).
//
//   node scripts/bench-verify.mjs [--n 1000]
//
// Signs N credentials in memory with a fresh Ed25519 key, then verifies each one with
// verifyCredentialOffline() and reports latency percentiles and throughput. No network, no database.
//
// This measures ONE machine, single-threaded, warm JIT, with the public key already imported
// (the verifier caches imported keys). It is not a statement about any other hardware or about
// end-to-end latency, which is dominated by fetching the issuer keys / status list when those
// are not already cached. Results are only comparable between runs on the same machine.
//
// It imports the app's byte-identical copy of the verifier (src/lib/offlineVerify, enforced by
// tests/verifier/vendoredCopy.test.ts) so that `jose` resolves from my-app/node_modules.
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { generateKeyPair, exportJWK, calculateJwkThumbprint, SignJWT } from 'jose';
import { verifyCredentialOffline } from '../src/lib/offlineVerify/verify.mjs';

const args = process.argv.slice(2);
const nIdx = args.indexOf('--n');
const N = nIdx >= 0 ? Number(args[nIdx + 1]) : 1000;
if (!Number.isInteger(N) || N < 10 || N > 20000) {
	console.error('--n must be an integer between 10 and 20000');
	process.exit(2);
}

const ISSUER = 'did:web:bench.example';
const LIST_URL = 'https://bench.example/api/status/revocation/rev-1';
const nowSec = Math.floor(Date.now() / 1000);

const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true, crv: 'Ed25519' });
const pub = await exportJWK(publicKey);
const kid = await calculateJwkThumbprint(pub);
const jwks = { keys: [{ ...pub, kid, alg: 'EdDSA', use: 'sig' }] };

const sign = (vc, extra = (b) => b) =>
	extra(new SignJWT({ vc }).setProtectedHeader({ alg: 'EdDSA', kid }).setIssuer(ISSUER).setIssuedAt(nowSec).setNotBefore(nowSec).setExpirationTime(nowSec + 86400 * 365)).sign(privateKey);

const makeVc = (i, withStatus) => {
	const id = `urn:uuid:${crypto.randomUUID()}`;
	return {
		'@context': ['https://www.w3.org/2018/credentials/v1'],
		type: ['VerifiableCredential', 'AchievementCredential'],
		issuer: ISSUER,
		id,
		issuanceDate: new Date().toISOString(),
		credentialSubject: { id: `student-${i}`, certificateId: `cert-${i}`, title: 'Intro to Testing', institution: 'Bench University', dateIssued: '2025-01-01' },
		...(withStatus
			? { credentialStatus: { id: `${LIST_URL}#${i}`, type: 'BitstringStatusListEntry', statusPurpose: 'revocation', statusListIndex: String(i), statusListCredential: LIST_URL } }
			: {}),
	};
};

async function signAll(withStatus) {
	const out = [];
	for (let i = 0; i < N; i++) {
		const vc = makeVc(i, withStatus);
		out.push(await sign(vc, (b) => b.setJti(vc.id).setSubject(vc.credentialSubject.id)));
	}
	return out;
}

// 16 KiB list with ~1% of the bits set, signed once and served from memory (no network).
const bits = new Uint8Array(16384);
for (let i = 0; i < 131072; i += 97) bits[i >> 3] |= 1 << (7 - (i & 7));
const listJws = await new SignJWT({
	vc: {
		id: LIST_URL,
		type: ['VerifiableCredential', 'BitstringStatusListCredential'],
		issuer: ISSUER,
		credentialSubject: { id: `${LIST_URL}#list`, type: 'BitstringStatusList', statusPurpose: 'revocation', encodedList: 'u' + gzipSync(bits).toString('base64url') },
	},
})
	.setProtectedHeader({ alg: 'EdDSA', kid })
	.setIssuer(ISSUER)
	.setIssuedAt(nowSec)
	.setNotBefore(nowSec)
	.sign(privateKey);
const statusListFetch = async () => listJws;

function pct(sorted, p) {
	return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function measure(label, tokens, opts) {
	// warm-up (JIT, key import cache)
	for (let i = 0; i < Math.min(50, tokens.length); i++) await verifyCredentialOffline(tokens[i], opts);
	const lat = new Array(tokens.length);
	let ok = 0;
	let revoked = 0;
	const t0 = performance.now();
	for (let i = 0; i < tokens.length; i++) {
		const s = performance.now();
		const r = await verifyCredentialOffline(tokens[i], opts);
		lat[i] = performance.now() - s;
		if (r.valid) ok++;
		else if (r.reason === 'revoked') revoked++;
		else throw new Error(`unexpected failure ${r.reason}`);
	}
	const total = performance.now() - t0;
	lat.sort((a, b) => a - b);
	return { label, n: tokens.length, ok, revoked, p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat[lat.length - 1], opsPerSec: (tokens.length / total) * 1000 };
}

const plain = await signAll(false);
const withStatus = await signAll(true);

const rows = [
	await measure('signature + claims (no status entry)', plain, { jwks }),
	await measure('signature + claims + status list', withStatus, { jwks, statusListFetch }),
];

const f = (x) => x.toFixed(3).padStart(9);
console.log(`CampusSync offline verification benchmark, N=${N} credentials per row`);
console.log(`Node ${process.version} | ${os.cpus()[0]?.model?.trim()} x${os.cpus().length} | ${os.platform()} ${os.arch()} ${os.release()}`);
console.log('Single-threaded, warm, in-memory keys and status list (no network, no database).\n');
console.log(['scenario'.padEnd(38), 'valid'.padStart(6), 'revoked'.padStart(8), 'p50 ms'.padStart(9), 'p95 ms'.padStart(9), 'p99 ms'.padStart(9), 'max ms'.padStart(9), 'ops/sec'.padStart(10)].join(' '));
for (const r of rows) {
	console.log([r.label.padEnd(38), String(r.ok).padStart(6), String(r.revoked).padStart(8), f(r.p50), f(r.p95), f(r.p99), f(r.max), r.opsPerSec.toFixed(0).padStart(10)].join(' '));
}
console.log('\nNote: a measurement of this machine only; the status-list row includes a gzip decode of a 16 KiB list per credential.');
