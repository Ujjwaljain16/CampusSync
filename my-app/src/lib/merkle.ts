/**
 * Merkle tree primitives for the CampusSync transparency log.
 *
 * Modelled on RFC 6962 section 2 (Certificate Transparency) and the proof
 * verification algorithms of RFC 9162 section 2.1. What is implemented here and
 * covered by tests/transparency/merkle.test.ts:
 *
 *   - leaf hash     SHA-256(0x00 || entry)
 *   - node hash     SHA-256(0x01 || left || right)
 *   - empty tree    SHA-256("")
 *   - tree split    k = largest power of two strictly smaller than n
 *   - audit (inclusion) proofs and consistency proofs, and their verifiers
 *
 * This is NOT a claim of full RFC 6962/9162 compliance (no TLS-encoded
 * structures, no SCTs, no wire formats): it is the hash tree and proof algebra.
 *
 * The module is dependency-free and isomorphic (browser and Node) on purpose:
 * SHA-256 is implemented here in plain JS so that the exact same code verifies
 * proofs in the browser. It is validated against Node's crypto in the tests.
 *
 * Complexity (N = tree size):
 *   MerkleTree.append             O(1) amortised (one hash per completed pair)
 *   MerkleTree.root / proofs      O(log N) hashes + O(log N) cache lookups,
 *                                 because every full, aligned power-of-two
 *                                 subtree hash is stored when it is completed
 *                                 and ragged right-edge subtrees are memoised.
 *   CompactRange.append / root    O(log N), O(log N) memory (frontier only).
 *   verifyInclusion / Consistency O(log N) hashes, no tree needed.
 */

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4), synchronous, dependency-free
// ---------------------------------------------------------------------------

// prettier-ignore
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const W = new Uint32Array(64);

/** SHA-256 of `data`. Returns a fresh 32-byte Uint8Array. */
export function sha256(data: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const len = data.length;
  const total = (Math.floor((len + 9 + 63) / 64)) * 64;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  // 64-bit big-endian bit length (len is far below 2^32 bytes in practice)
  view.setUint32(total - 8, Math.floor(len / 0x20000000), false);
  view.setUint32(total - 4, (len << 3) >>> 0, false);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15];
      const w2 = W[i - 2];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0, false); ov.setUint32(4, h1, false); ov.setUint32(8, h2, false); ov.setUint32(12, h3, false);
  ov.setUint32(16, h4, false); ov.setUint32(20, h5, false); ov.setUint32(24, h6, false); ov.setUint32(28, h7, false);
  return out;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

export type Hash = Uint8Array;
/** A hash given as raw bytes or as a lowercase/uppercase hex string. */
export type HashLike = Uint8Array | string;

const HASH_LEN = 32;
const HEX64 = /^[0-9a-fA-F]{64}$/;

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/** Parse a 64-char hex string into a 32-byte hash. Throws on malformed input. */
export function fromHex(hex: string): Hash {
  if (typeof hex !== 'string' || !HEX64.test(hex)) throw new TypeError('Expected a 64-character hex SHA-256 hash');
  const out = new Uint8Array(HASH_LEN);
  for (let i = 0; i < HASH_LEN; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Normalise a HashLike to bytes, or null when it is not a valid 32-byte hash. */
export function parseHash(x: unknown): Hash | null {
  if (typeof x === 'string') return HEX64.test(x) ? fromHex(x) : null;
  if (x instanceof Uint8Array && x.length === HASH_LEN) return x;
  return null;
}

export function hashesEqual(a: Hash, b: Hash): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const utf8 = new TextEncoder();

function toBytes(entry: Uint8Array | string): Uint8Array {
  return typeof entry === 'string' ? utf8.encode(entry) : entry;
}

// ---------------------------------------------------------------------------
// RFC 6962 hashing
// ---------------------------------------------------------------------------

/** SHA-256(0x00 || entry) */
export function leafHash(entry: Uint8Array | string): Hash {
  const bytes = toBytes(entry);
  const buf = new Uint8Array(bytes.length + 1);
  buf[0] = 0x00;
  buf.set(bytes, 1);
  return sha256(buf);
}

/** SHA-256(0x01 || left || right) */
export function nodeHash(left: Hash, right: Hash): Hash {
  const buf = new Uint8Array(1 + left.length + right.length);
  buf[0] = 0x01;
  buf.set(left, 1);
  buf.set(right, 1 + left.length);
  return sha256(buf);
}

/** MTH({}) = SHA-256("") */
export function emptyTreeHash(): Hash {
  return sha256(new Uint8Array(0));
}

/** Largest power of two strictly smaller than n (n >= 2). */
function largestPowerOfTwoBelow(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function isPowerOfTwo(n: number): boolean {
  while (n > 1) {
    if (n % 2 !== 0) return false;
    n /= 2;
  }
  return n === 1;
}

function popcount(n: number): number {
  let c = 0;
  while (n > 0) {
    if (n % 2 === 1) c++;
    n = Math.floor(n / 2);
  }
  return c;
}

function isSize(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

// ---------------------------------------------------------------------------
// In-memory tree with cached subtree hashes
// ---------------------------------------------------------------------------

/** MTH(D[start:end]) provider used by the proof generators. */
export type SubtreeHashFn = (start: number, end: number) => Hash;

/**
 * Append-only Merkle tree over leaf hashes.
 *
 * `levels[k][j]` holds the hash of the full subtree of 2^k leaves starting at
 * leaf j*2^k. It is filled as soon as the subtree is complete, so the left
 * subtrees that RFC 6962's split produces (always full, aligned powers of two)
 * are O(1) lookups. Only the ragged right edge needs hashing, and its results
 * are memoised (an append-only tree never changes the hash of D[a:b]).
 */
export class MerkleTree {
  private readonly levels: Hash[][] = [[]];
  private readonly ragged = new Map<string, Hash>();
  private static readonly RAGGED_CACHE_LIMIT = 200_000;

  constructor(leafHashes: Iterable<Hash> = []) {
    for (const h of leafHashes) this.append(h);
  }

  get size(): number {
    return this.levels[0].length;
  }

  /** Append a leaf hash (already SHA-256(0x00||entry)); returns its index. */
  append(leaf: Hash): number {
    if (leaf.length !== HASH_LEN) throw new TypeError('Leaf hash must be 32 bytes');
    this.levels[0].push(leaf);
    let k = 0;
    while (this.levels[k].length % 2 === 0) {
      const lv = this.levels[k];
      if (!this.levels[k + 1]) this.levels.push([]);
      this.levels[k + 1].push(nodeHash(lv[lv.length - 2], lv[lv.length - 1]));
      k++;
    }
    return this.levels[0].length - 1;
  }

  leafHashAt(index: number): Hash {
    if (!isSize(index) || index >= this.size) throw new RangeError('Leaf index out of range');
    return this.levels[0][index];
  }

  /** MTH(D[start:end]) */
  mth = (start: number, end: number): Hash => {
    if (!isSize(start) || !isSize(end) || start > end || end > this.size) {
      throw new RangeError('Subtree range out of bounds');
    }
    const n = end - start;
    if (n === 0) return emptyTreeHash();
    if (isPowerOfTwo(n) && start % n === 0) return this.levels[Math.log2(n)][start / n];
    const key = `${start}:${end}`;
    const cached = this.ragged.get(key);
    if (cached) return cached;
    const k = largestPowerOfTwoBelow(n);
    const h = nodeHash(this.mth(start, start + k), this.mth(start + k, end));
    if (this.ragged.size >= MerkleTree.RAGGED_CACHE_LIMIT) this.ragged.clear();
    this.ragged.set(key, h);
    return h;
  };

  /** Root hash of the first `treeSize` leaves (default: whole tree). */
  root(treeSize: number = this.size): Hash {
    if (!isSize(treeSize) || treeSize > this.size) throw new RangeError('treeSize out of range');
    return this.mth(0, treeSize);
  }

  inclusionProof(index: number, treeSize: number = this.size): Hash[] {
    if (!isSize(treeSize) || treeSize > this.size) throw new RangeError('treeSize out of range');
    return inclusionProofWith(index, treeSize, this.mth);
  }

  consistencyProof(first: number, second: number = this.size): Hash[] {
    if (!isSize(second) || second > this.size) throw new RangeError('second tree size out of range');
    return consistencyProofWith(first, second, this.mth);
  }
}

// ---------------------------------------------------------------------------
// Proof generation (RFC 6962 section 2.1.1 PATH and 2.1.2 PROOF/SUBPROOF)
// ---------------------------------------------------------------------------

/**
 * PATH(m, D[n]) using any MTH(D[a:b]) provider. Returns the audit path ordered
 * from the leaf level upwards.
 */
export function inclusionProofWith(index: number, treeSize: number, mth: SubtreeHashFn): Hash[] {
  if (!isSize(index) || !isSize(treeSize) || index >= treeSize) {
    throw new RangeError('index must satisfy 0 <= index < treeSize');
  }
  const path: Hash[] = [];
  let start = 0;
  let end = treeSize;
  let m = index;
  while (end - start > 1) {
    const k = largestPowerOfTwoBelow(end - start);
    if (m < k) {
      path.push(mth(start + k, end));
      end = start + k;
    } else {
      path.push(mth(start, start + k));
      start += k;
      m -= k;
    }
  }
  return path.reverse();
}

/**
 * PROOF(m, D[n]) using any MTH(D[a:b]) provider. Empty when first is 0 or
 * first === second (nothing to prove).
 */
export function consistencyProofWith(first: number, second: number, mth: SubtreeHashFn): Hash[] {
  if (!isSize(first) || !isSize(second) || first > second) {
    throw new RangeError('sizes must satisfy 0 <= first <= second');
  }
  if (first === 0 || first === second) return [];
  const proof: Hash[] = [];
  let start = 0;
  let end = second;
  let m = first;
  let b = true;
  for (;;) {
    const n = end - start;
    if (m === n) {
      if (!b) proof.push(mth(start, end));
      break;
    }
    const k = largestPowerOfTwoBelow(n);
    if (m <= k) {
      proof.push(mth(start + k, end));
      end = start + k;
    } else {
      proof.push(mth(start, start + k));
      start += k;
      m -= k;
      b = false;
    }
  }
  return proof.reverse();
}

/** Leaf hashes (SHA-256(0x00 || entry)) of a tree, in index order. */
export type LeafHashSource = readonly Hash[];

/** MTH(D[n]) over raw entries (each hashed with the 0x00 leaf prefix). O(N) time, O(log N) memory. */
export function merkleTreeHash(entries: ReadonlyArray<Uint8Array | string>): Hash {
  const range = new CompactRange();
  for (const e of entries) range.append(leafHash(e));
  return range.root();
}

/**
 * One-shot audit path for leaf `index` in the first `treeSize` of `leaves`
 * (leaf hashes, not raw entries). Builds the cached tree first, so call
 * `new MerkleTree(leaves)` yourself when generating many proofs.
 */
export function inclusionProof(index: number, treeSize: number, leaves: LeafHashSource | SubtreeHashFn): Hash[] {
  if (typeof leaves === 'function') return inclusionProofWith(index, treeSize, leaves);
  if (!isSize(treeSize) || treeSize > leaves.length) throw new RangeError('treeSize out of range');
  return new MerkleTree(leaves.slice(0, treeSize)).inclusionProof(index, treeSize);
}

/** One-shot consistency proof between the first `first` and first `second` leaves. */
export function consistencyProof(first: number, second: number, leaves: LeafHashSource | SubtreeHashFn): Hash[] {
  if (typeof leaves === 'function') return consistencyProofWith(first, second, leaves);
  if (!isSize(second) || second > leaves.length) throw new RangeError('treeSize out of range');
  return new MerkleTree(leaves.slice(0, second)).consistencyProof(first, second);
}

// ---------------------------------------------------------------------------
// Frontier ("compact range"): O(log N) state sufficient to append and get roots
// ---------------------------------------------------------------------------

/**
 * The hashes of the maximal perfect subtrees of a tree of `size` leaves, largest
 * first (one per set bit of `size`). Appending a leaf and recomputing the root
 * are O(log N) and need no other leaves, which is how the log operator extends
 * the previous signed tree head without re-reading every entry.
 */
export class CompactRange {
  private _size: number;
  private readonly hashes: Hash[];

  constructor(size = 0, hashes: Hash[] = []) {
    if (!isSize(size)) throw new RangeError('Invalid size');
    if (hashes.length !== popcount(size)) throw new RangeError('Frontier does not match size');
    this._size = size;
    this.hashes = hashes.slice();
  }

  static fromHex(size: number, hex: string[]): CompactRange {
    return new CompactRange(size, hex.map(fromHex));
  }

  get size(): number {
    return this._size;
  }

  append(leaf: Hash): void {
    let h = leaf;
    let s = this._size;
    while (s % 2 === 1) {
      h = nodeHash(this.hashes.pop() as Hash, h);
      s = Math.floor(s / 2);
    }
    this.hashes.push(h);
    this._size++;
  }

  /** MTH over all appended leaves: fold the perfect subtrees right-to-left. */
  root(): Hash {
    if (this.hashes.length === 0) return emptyTreeHash();
    let r = this.hashes[this.hashes.length - 1];
    for (let i = this.hashes.length - 2; i >= 0; i--) r = nodeHash(this.hashes[i], r);
    return r;
  }

  toHex(): string[] {
    return this.hashes.map(toHex);
  }
}

// ---------------------------------------------------------------------------
// Verification (RFC 9162 section 2.1.3.2 and 2.1.4.2)
// ---------------------------------------------------------------------------

/**
 * Verify that `leaf` (a leaf hash) is entry `index` of the tree of `treeSize`
 * leaves with root `rootHash`, given the audit `proof`. Never throws: any
 * malformed input yields false.
 */
export function verifyInclusion(
  leaf: HashLike,
  index: number,
  treeSize: number,
  proof: readonly HashLike[],
  rootHash: HashLike
): boolean {
  if (!isSize(index) || !isSize(treeSize) || index >= treeSize) return false;
  if (!Array.isArray(proof)) return false;
  const root = parseHash(rootHash);
  let r = parseHash(leaf);
  if (!r || !root) return false;

  let fn = index;
  let sn = treeSize - 1;
  for (const raw of proof) {
    const p = parseHash(raw);
    if (!p) return false;
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && hashesEqual(r, root);
}

/**
 * Verify that the tree of `secondSize` leaves (root `secondRoot`) extends the
 * tree of `firstSize` leaves (root `firstRoot`), i.e. the log only appended.
 * An empty first tree is trivially a prefix of anything, so firstSize 0
 * accepts only the empty proof (and checks nothing about the roots).
 */
export function verifyConsistency(
  firstSize: number,
  secondSize: number,
  firstRoot: HashLike,
  secondRoot: HashLike,
  proof: readonly HashLike[]
): boolean {
  if (!isSize(firstSize) || !isSize(secondSize) || firstSize > secondSize) return false;
  if (!Array.isArray(proof)) return false;
  const h1 = parseHash(firstRoot);
  const h2 = parseHash(secondRoot);
  if (!h1 || !h2) return false;
  const path: Hash[] = [];
  for (const raw of proof) {
    const p = parseHash(raw);
    if (!p) return false;
    path.push(p);
  }

  if (firstSize === 0) return path.length === 0;
  if (firstSize === secondSize) return path.length === 0 && hashesEqual(h1, h2);

  // firstSize < secondSize from here on
  if (isPowerOfTwo(firstSize)) path.unshift(h1);
  if (path.length === 0) return false;

  let fn = firstSize - 1;
  let sn = secondSize - 1;
  while (fn % 2 === 1) {
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  let fr = path[0];
  let sr = path[0];
  for (let i = 1; i < path.length; i++) {
    const c = path[i];
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      fr = nodeHash(c, fr);
      sr = nodeHash(c, sr);
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      sr = nodeHash(sr, c);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && hashesEqual(fr, h1) && hashesEqual(sr, h2);
}
