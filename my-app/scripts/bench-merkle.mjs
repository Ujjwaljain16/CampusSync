#!/usr/bin/env node
/**
 * Micro-benchmark for src/lib/merkle.ts (the same code the server and the browser verifier use).
 *
 *   node scripts/bench-merkle.mjs            # N = 100000 leaves
 *   node scripts/bench-merkle.mjs 250000     # custom size
 *
 * Numbers are MACHINE-SPECIFIC single-process wall-clock timings of synthetic data in memory:
 * no database, no network, no signing. They say nothing about end-to-end API latency.
 * The script loads the TypeScript source directly (Node >= 22.18 strips types natively; on older
 * Node it transpiles with the project's `typescript` dev dependency).
 */
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = fileURLToPath(new URL('../src/lib/merkle.ts', import.meta.url));

async function loadMerkle() {
  try {
    return await import(pathToFileURL(SRC).href);
  } catch {
    const ts = (await import('typescript')).default;
    const js = ts.transpileModule(readFileSync(SRC, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  }
}

const m = await loadMerkle();
const { MerkleTree, CompactRange, leafHash, nodeHash, inclusionProofWith, verifyInclusion, verifyConsistency, sha256, toHex } = m;

const N = Number(process.argv[2] ?? 100_000);
if (!Number.isSafeInteger(N) || N < 2) throw new Error('N must be an integer >= 2');
const SAMPLES = 1000;

// deterministic PRNG (xorshift32) so runs are comparable
let seed = 0x9e3779b9;
const rnd = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 2 ** 32;
};

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const fmtMs = (ms) => (ms >= 100 ? ms.toFixed(0) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(4)) + ' ms';
const fmtUs = (ms) => (ms * 1000).toFixed(1) + ' us';
const time = (fn) => {
  const t = performance.now();
  const r = fn();
  return [performance.now() - t, r];
};

// --- raw hashing throughput (context: the library uses a pure-JS SHA-256 so it runs in browsers) ---
const block = new Uint8Array(65).fill(7);
const HASHES = 100_000;
let [tJs] = time(() => { for (let i = 0; i < HASHES; i++) sha256(block); });
let [tNode] = time(() => { for (let i = 0; i < HASHES; i++) createHash('sha256').update(block).digest(); });

// --- build ---
const heapBefore = (global.gc?.(), process.memoryUsage().heapUsed);
const entries = Array.from({ length: N }, (_, i) =>
  `{"at":"2026-10-14T12:00:00.000Z","credentialId":"urn:uuid:${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000","studentHash":"${'ab'.repeat(32)}","type":"credential.issued"}`
);
const [tLeaves, leaves] = time(() => entries.map((e) => leafHash(e)));
const tree = new MerkleTree();
const [tBuild] = time(() => { for (const l of leaves) tree.append(l); });
const [tRoot, root] = time(() => tree.root());
const [tStreamRoot, streamRoot] = time(() => { const r = new CompactRange(); for (const l of leaves) r.append(l); return r.root(); });
if (toHex(root) !== toHex(streamRoot)) throw new Error('root mismatch between MerkleTree and CompactRange');
const heapAfter = (global.gc?.(), process.memoryUsage().heapUsed);

// --- inclusion proofs (warm tree) ---
const idx = Array.from({ length: SAMPLES }, () => Math.floor(rnd() * N));
const proofs = [];
const genTimes = idx.map((i) => { const [t, p] = time(() => tree.inclusionProof(i, N)); proofs.push(p); return t; }).sort((a, b) => a - b);
const verTimes = idx.map((i, k) => {
  const [t, ok] = time(() => verifyInclusion(leaves[i], i, N, proofs[k], root));
  if (!ok) throw new Error('verification failed for index ' + i);
  return t;
}).sort((a, b) => a - b);

// --- consistency proof (second half appended) ---
const first = Math.floor(N / 2);
const firstRoot = tree.root(first);
const [tCons, cons] = time(() => tree.consistencyProof(first, N));
const [tConsVer, consOk] = time(() => verifyConsistency(first, N, firstRoot, root, cons));
if (!consOk) throw new Error('consistency verification failed');

// --- baseline: the same proof WITHOUT cached subtree hashes (re-hash the tree for every proof) ---
const naiveMth = (s, e) => {
  if (e - s === 1) return leaves[s];
  let k = 1; while (k * 2 < e - s) k *= 2;
  return nodeHash(naiveMth(s, s + k), naiveMth(s + k, e));
};
const NAIVE = 5;
const naiveTimes = Array.from({ length: NAIVE }, () => time(() => inclusionProofWith(Math.floor(rnd() * N), N, naiveMth))[0]).sort((a, b) => a - b);

const cpu = cpus();
const rows = [
  ['Leaves (N)', N.toLocaleString('en-US')],
  ['Hash all leaves (SHA-256 0x00||entry)', fmtMs(tLeaves)],
  ['Build tree incrementally (append x N)', fmtMs(tBuild)],
  ['Tree root, cached tree', fmtUs(tRoot)],
  ['Tree root, streaming CompactRange from leaf hashes', fmtMs(tStreamRoot)],
  [`Inclusion proof generation p50 / p95 (${SAMPLES} random idx)`, `${fmtUs(pct(genTimes, 50))} / ${fmtUs(pct(genTimes, 95))}`],
  ['  baseline w/o subtree cache (median of ' + NAIVE + ')', fmtMs(naiveTimes[Math.floor(NAIVE / 2)])],
  ['Inclusion proof size', `${proofs[0].length} hashes = ${proofs[0].length * 32} bytes (max over samples: ${Math.max(...proofs.map((p) => p.length))} hashes)`],
  [`Inclusion verification p50 / p95 (${SAMPLES} proofs)`, `${fmtUs(pct(verTimes, 50))} / ${fmtUs(pct(verTimes, 95))}`],
  [`Consistency proof ${first} -> ${N}: generate / verify`, `${fmtUs(tCons)} / ${fmtUs(tConsVer)}  (${cons.length} hashes)`],
  ['Tree heap (leaf hashes + cached subtree hashes)', `${((heapAfter - heapBefore) / 2 ** 20).toFixed(1)} MiB (incl. ${N.toLocaleString('en-US')} entry strings; ${global.gc ? 'GC forced before/after' : 'run with --expose-gc for a stable figure'})`],
  ['Pure-JS SHA-256 (65-byte input)', `${Math.round(HASHES / (tJs / 1000)).toLocaleString('en-US')} hashes/s`],
  ['Node crypto SHA-256 (65-byte input, for comparison)', `${Math.round(HASHES / (tNode / 1000)).toLocaleString('en-US')} hashes/s`],
];

const w = Math.max(...rows.map((r) => r[0].length));
console.log('CampusSync transparency log - Merkle benchmark (src/lib/merkle.ts)');
console.log(`Node ${process.version} | ${process.platform} ${process.arch} | ${cpu[0].model.trim()} x${cpu.length} | RAM ${(totalmem() / 2 ** 30).toFixed(1)} GiB`);
console.log('-'.repeat(w + 4 + 60));
for (const [k, v] of rows) console.log(`${k.padEnd(w)}  ${v}`);
console.log('-'.repeat(w + 4 + 60));
console.log('Single process, synthetic in-memory data; excludes DB, network and signing. Machine-specific.');
