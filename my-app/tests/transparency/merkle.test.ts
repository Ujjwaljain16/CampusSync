// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import {
  sha256,
  leafHash,
  nodeHash,
  emptyTreeHash,
  merkleTreeHash,
  MerkleTree,
  CompactRange,
  inclusionProof,
  inclusionProofWith,
  consistencyProof,
  verifyInclusion,
  verifyConsistency,
  toHex,
  fromHex,
  type Hash,
} from '@/lib/merkle';

const nodeSha = (b: Uint8Array) => new Uint8Array(createHash('sha256').update(b).digest());
const hex = toHex;

// ---------------------------------------------------------------------------
// Brute-force reference: the naive recursive definitions from RFC 6962 s2.1,
// written independently of src/lib/merkle.ts and using Node's crypto.
// ---------------------------------------------------------------------------
const refLeaf = (d: Uint8Array) => nodeSha(Buffer.concat([Buffer.from([0]), d]));
const refNode = (l: Uint8Array, r: Uint8Array) => nodeSha(Buffer.concat([Buffer.from([1]), l, r]));
const refK = (n: number) => {
  let k = 1;
  while (k < n) k <<= 1;
  return k >> 1; // largest power of two strictly less than n (n >= 2)
};
/** MTH over RAW entries */
function refMth(d: Uint8Array[]): Uint8Array {
  if (d.length === 0) return nodeSha(new Uint8Array(0));
  if (d.length === 1) return refLeaf(d[0]);
  const k = refK(d.length);
  return refNode(refMth(d.slice(0, k)), refMth(d.slice(k)));
}
/** PATH(m, D[n]) */
function refPath(m: number, d: Uint8Array[]): Uint8Array[] {
  if (d.length === 1) return [];
  const k = refK(d.length);
  return m < k ? [...refPath(m, d.slice(0, k)), refMth(d.slice(k))] : [...refPath(m - k, d.slice(k)), refMth(d.slice(0, k))];
}
/** SUBPROOF(m, D[n], b) */
function refSubproof(m: number, d: Uint8Array[], b: boolean): Uint8Array[] {
  const n = d.length;
  if (m === n) return b ? [] : [refMth(d)];
  const k = refK(n);
  return m <= k
    ? [...refSubproof(m, d.slice(0, k), b), refMth(d.slice(k))]
    : [...refSubproof(m - k, d.slice(k), false), refMth(d.slice(0, k))];
}
const refProof = (m: number, d: Uint8Array[]) => refSubproof(m, d, true);

const entry = (i: number) => new TextEncoder().encode(`entry-${i}`);
const entries = (n: number) => Array.from({ length: n }, (_, i) => entry(i));
const flipBit = (h: Hash, byte: number, bit: number) => {
  const c = new Uint8Array(h);
  c[byte] ^= 1 << bit;
  return c;
};

describe('sha256 (pure JS) against Node crypto', () => {
  it('matches the FIPS 180-4 example vectors', () => {
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(hex(sha256(new Uint8Array(0)))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });

  it('matches Node for every length 0..300 (block-boundary padding) and random content', () => {
    for (let len = 0; len <= 300; len++) {
      const data = new Uint8Array(randomBytes(len));
      expect(hex(sha256(data))).toBe(hex(nodeSha(data)));
    }
    const big = new Uint8Array(randomBytes(100_000));
    expect(hex(sha256(big))).toBe(hex(nodeSha(big)));
  });
});

describe('RFC 6962 hashing and known answers', () => {
  it('domain-separates leaves from interior nodes and defines the empty root', () => {
    expect(hex(emptyTreeHash())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const a = leafHash('a');
    const b = leafHash('b');
    expect(hex(a)).toBe(hex(refLeaf(new TextEncoder().encode('a'))));
    expect(hex(nodeHash(a, b))).toBe(hex(refNode(a, b)));
    // A leaf over the concatenation of two child hashes must differ from the interior node
    const forged = leafHash(Buffer.concat([a, b]));
    expect(hex(forged)).not.toBe(hex(nodeHash(a, b)));
  });

  // The eight leaves and the roots of their prefixes below are the widely used
  // Certificate Transparency reference test data (the roots are also reproduced
  // by the naive reference above, which is the actual cross-check).
  const CT_LEAVES = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'].map(
    (h) => new Uint8Array(Buffer.from(h, 'hex'))
  );
  const CT_ROOTS = [
    '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
    'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
    'aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77',
    'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
    '4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4',
    '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
    'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
    '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
  ];

  it('reproduces the CT reference roots for tree sizes 1..8 (and the brute-force reference agrees)', () => {
    for (let n = 1; n <= 8; n++) {
      const slice = CT_LEAVES.slice(0, n);
      expect(hex(merkleTreeHash(slice))).toBe(CT_ROOTS[n - 1]);
      expect(hex(refMth(slice))).toBe(CT_ROOTS[n - 1]);
      expect(hex(new MerkleTree(slice.map(leafHash)).root())).toBe(CT_ROOTS[n - 1]);
    }
  });

  it('derived known-answer inclusion proof: leaf 0 of the 3-leaf tree is [H(leaf1), ...]', () => {
    const l = CT_LEAVES.slice(0, 3).map(leafHash);
    // MTH(3): split k=2 => node(node(l0,l1), l2). Path for index 0: [l1, l2]
    const proof = new MerkleTree(l).inclusionProof(0, 3);
    expect(proof.map(hex)).toEqual([hex(l[1]), hex(l[2])]);
    expect(verifyInclusion(l[0], 0, 3, proof, CT_ROOTS[2])).toBe(true);
    // index 2 sits directly under the root: path is [node(l0,l1)]
    const p2 = new MerkleTree(l).inclusionProof(2, 3);
    expect(p2.map(hex)).toEqual([hex(nodeHash(l[0], l[1]))]);
    expect(verifyInclusion(l[2], 2, 3, p2, CT_ROOTS[2])).toBe(true);
  });

  it('derived known-answer consistency proof: 1 -> 3 and 2 -> 3 and 3 -> 7', () => {
    const l = entries(7).map(leafHash);
    const t = new MerkleTree(l);
    // 1 -> 3: [l1, l2]; 2 -> 3: [l2]
    expect(t.consistencyProof(1, 3).map(hex)).toEqual([hex(l[1]), hex(l[2])]);
    expect(t.consistencyProof(2, 3).map(hex)).toEqual([hex(l[2])]);
    // 3 -> 7 (RFC 6962 example shape): [l2, l3, MTH(0..2), MTH(4..7)]
    expect(t.consistencyProof(3, 7).map(hex)).toEqual([
      hex(l[2]),
      hex(l[3]),
      hex(nodeHash(l[0], l[1])),
      hex(new MerkleTree(l.slice(4, 7)).root()),
    ]);
    expect(verifyConsistency(3, 7, t.root(3), t.root(7), t.consistencyProof(3, 7))).toBe(true);
  });
});

describe('exhaustive cross-check against the brute-force reference', () => {
  const MAX = 64;
  const raw = entries(MAX);
  const leaves: Hash[] = raw.map((e) => new Uint8Array(refLeaf(e)));
  const tree = new MerkleTree(leaves);

  it('roots, for every tree size 1..64 (and 0)', () => {
    expect(hex(tree.root(0))).toBe(hex(refMth([])));
    for (let n = 1; n <= MAX; n++) {
      const expected = hex(refMth(raw.slice(0, n)));
      expect(hex(tree.root(n))).toBe(expected);
      expect(hex(merkleTreeHash(raw.slice(0, n)))).toBe(expected);
    }
  });

  it('inclusion proofs: identical to reference and verify, for ALL sizes 1..64 and ALL indices (2080 proofs)', () => {
    let count = 0;
    for (let n = 1; n <= MAX; n++) {
      const slice = raw.slice(0, n);
      const root = refMth(slice);
      for (let i = 0; i < n; i++) {
        const expected = refPath(i, slice).map(hex);
        const got = tree.inclusionProof(i, n);
        expect(got.map(hex)).toEqual(expected);
        expect(verifyInclusion(leaves[i], i, n, got, root)).toBe(true);
        // one-shot helpers agree
        expect(inclusionProof(i, n, leaves).map(hex)).toEqual(expected);
        count++;
      }
    }
    expect(count).toBe((MAX * (MAX + 1)) / 2);
  });

  it('consistency proofs: identical to reference and verify, for ALL 0 <= first <= second <= 64 (2144 pairs)', () => {
    let count = 0;
    for (let second = 1; second <= MAX; second++) {
      const slice2 = raw.slice(0, second);
      const root2 = refMth(slice2);
      for (let first = 1; first <= second; first++) {
        const root1 = refMth(raw.slice(0, first));
        const expected = first === second ? [] : refProof(first, slice2).map(hex);
        const got = tree.consistencyProof(first, second);
        expect(got.map(hex)).toEqual(expected);
        expect(verifyConsistency(first, second, root1, root2, got)).toBe(true);
        expect(consistencyProof(first, second, leaves).map(hex)).toEqual(expected);
        count++;
      }
      // first = 0: empty proof, trivially a prefix
      expect(tree.consistencyProof(0, second)).toEqual([]);
      expect(verifyConsistency(0, second, emptyTreeHash(), root2, [])).toBe(true);
      count++;
    }
    expect(count).toBe(((MAX + 1) * (MAX + 2)) / 2 - 1);
  });

  it('CompactRange (frontier) gives the same roots for every size 0..130 and round-trips through hex', () => {
    const range = new CompactRange();
    const all = entries(130).map(leafHash);
    expect(hex(range.root())).toBe(hex(emptyTreeHash()));
    for (let n = 1; n <= 130; n++) {
      range.append(all[n - 1]);
      expect(range.size).toBe(n);
      expect(hex(range.root())).toBe(hex(refMth(entries(n))));
      const restored = CompactRange.fromHex(range.size, range.toHex());
      restored.append(leafHash('next'));
      const copy = CompactRange.fromHex(range.size, range.toHex());
      copy.append(leafHash('next'));
      expect(hex(restored.root())).toBe(hex(copy.root()));
    }
    expect(() => new CompactRange(5, [])).toThrow();
  });
});

describe('tamper detection', () => {
  const N = 33;
  const raw = entries(N);
  const leaves: Hash[] = raw.map((e) => new Uint8Array(refLeaf(e)));
  const tree = new MerkleTree(leaves);

  it('inclusion: any single-bit flip in proof/root/leaf, or wrong index/size/proof length, fails (all sizes <= 33, all indices)', () => {
    for (let n = 1; n <= N; n++) {
      const root = tree.root(n);
      for (let i = 0; i < n; i++) {
        const proof = tree.inclusionProof(i, n);
        expect(verifyInclusion(leaves[i], i, n, proof, root)).toBe(true);
        // flip a bit in each proof element
        proof.forEach((_, j) => {
          for (const [byte, bit] of [[0, 0], [31, 7], [13, 3]] as const) {
            const bad = proof.map((p, k) => (k === j ? flipBit(p, byte, bit) : p));
            expect(verifyInclusion(leaves[i], i, n, bad, root)).toBe(false);
          }
        });
        expect(verifyInclusion(leaves[i], i, n, proof, flipBit(root, 5, 2))).toBe(false);
        expect(verifyInclusion(flipBit(leaves[i], 0, 0), i, n, proof, root)).toBe(false);
        if (i + 1 < n) expect(verifyInclusion(leaves[i], i + 1, n, proof, root)).toBe(false);
        if (i > 0) expect(verifyInclusion(leaves[i], i - 1, n, proof, root)).toBe(false);
        // Wrong tree size. NOTE: an audit path alone does not pin the size (a path that is
        // structurally valid for two sizes recomputes the same hash); the size is bound by the
        // signed tree head. So the meaningful check is: claiming another size together with
        // that size's REAL root, using this proof, must fail.
        if (n < N) expect(verifyInclusion(leaves[i], i, n + 1, proof, tree.root(n + 1))).toBe(false);
        if (n > 1 && i < n - 1) expect(verifyInclusion(leaves[i], i, n - 1, proof, tree.root(n - 1))).toBe(false);
        // truncated / extended proofs
        if (proof.length > 0) expect(verifyInclusion(leaves[i], i, n, proof.slice(1), root)).toBe(false);
        expect(verifyInclusion(leaves[i], i, n, [...proof, new Uint8Array(32)], root)).toBe(false);
        // a different leaf with the same proof
        expect(verifyInclusion(leaves[(i + 1) % N], i, n, proof, root)).toBe(false);
      }
    }
  });

  it('inclusion: rejects malformed input instead of throwing', () => {
    const proof = tree.inclusionProof(3, 10);
    const root = tree.root(10);
    expect(verifyInclusion('zz', 3, 10, proof, root)).toBe(false);
    expect(verifyInclusion(leaves[3], 3, 10, proof, 'abcd')).toBe(false);
    expect(verifyInclusion(leaves[3], -1, 10, proof, root)).toBe(false);
    expect(verifyInclusion(leaves[3], 3.5, 10, proof, root)).toBe(false);
    expect(verifyInclusion(leaves[3], 3, 3, proof, root)).toBe(false);
    expect(verifyInclusion(leaves[3], 10, 10, proof, root)).toBe(false);
    expect(verifyInclusion(leaves[3], 3, 10, [new Uint8Array(5)], root)).toBe(false);
    expect(verifyInclusion(leaves[3], 3, 10, null as unknown as Hash[], root)).toBe(false);
    expect(verifyInclusion(leaves[3], NaN, 10, proof, root)).toBe(false);
    // hex input is accepted and equivalent to bytes
    expect(verifyInclusion(hex(leaves[3]), 3, 10, proof.map(hex), hex(root))).toBe(true);
  });

  it('consistency: bit flips in proof/roots and wrong sizes fail (all pairs <= 33)', () => {
    for (let second = 2; second <= N; second++) {
      const root2 = tree.root(second);
      for (let first = 1; first < second; first++) {
        const root1 = tree.root(first);
        const proof = tree.consistencyProof(first, second);
        expect(verifyConsistency(first, second, root1, root2, proof)).toBe(true);
        proof.forEach((_, j) => {
          const bad = proof.map((p, k) => (k === j ? flipBit(p, 0, 0) : p));
          expect(verifyConsistency(first, second, root1, root2, bad)).toBe(false);
        });
        expect(verifyConsistency(first, second, flipBit(root1, 1, 1), root2, proof)).toBe(false);
        expect(verifyConsistency(first, second, root1, flipBit(root2, 1, 1), proof)).toBe(false);
        // roots swapped
        expect(verifyConsistency(first, second, root2, root1, proof)).toBe(false);
        // wrong sizes with the same proof
        // (as for inclusion, sizes are bound by the signed heads: pair each claimed size with its real root)
        if (second < N) expect(verifyConsistency(first, second + 1, root1, tree.root(second + 1), proof)).toBe(false);
        if (first + 1 < second) expect(verifyConsistency(first + 1, second, tree.root(first + 1), root2, proof)).toBe(false);
        if (first > 1) expect(verifyConsistency(first - 1, second, tree.root(first - 1), root2, proof)).toBe(false);
        // truncated / extended
        expect(verifyConsistency(first, second, root1, root2, proof.slice(0, -1))).toBe(false);
        expect(verifyConsistency(first, second, root1, root2, [...proof, new Uint8Array(32)])).toBe(false);
        // reversed sizes are never valid
        expect(verifyConsistency(second, first, root2, root1, proof)).toBe(false);
      }
    }
  });

  it('consistency: a rewritten history is detected (same size prefix, one different early leaf)', () => {
    const forkedLeaves = leaves.slice();
    forkedLeaves[2] = leafHash('rewritten');
    const forked = new MerkleTree(forkedLeaves);
    const honestOld = tree.root(10);
    // The operator shows a client the honest 10-leaf head, then a 30-leaf head from the forked history.
    const proof = forked.consistencyProof(10, 30);
    expect(verifyConsistency(10, 30, honestOld, forked.root(30), proof)).toBe(false);
    // And it cannot reuse an honest proof either.
    expect(verifyConsistency(10, 30, honestOld, forked.root(30), tree.consistencyProof(10, 30))).toBe(false);
    // A forked history that keeps the prefix is, correctly, consistent (append-only is all this proves).
    const ok = new MerkleTree(leaves.slice(0, 10).concat(Array.from({ length: 20 }, (_, i) => leafHash(`x${i}`))));
    expect(verifyConsistency(10, 30, honestOld, ok.root(30), ok.consistencyProof(10, 30))).toBe(true);
  });

  it('consistency: equal sizes need equal roots and an empty proof', () => {
    const r = tree.root(5);
    expect(verifyConsistency(5, 5, r, r, [])).toBe(true);
    expect(verifyConsistency(5, 5, r, tree.root(6), [])).toBe(false);
    expect(verifyConsistency(5, 5, r, r, [new Uint8Array(32)])).toBe(false);
    expect(verifyConsistency(0, 5, emptyTreeHash(), r, [new Uint8Array(32)])).toBe(false);
  });
});

describe('edge cases', () => {
  it('empty tree', () => {
    const t = new MerkleTree();
    expect(t.size).toBe(0);
    expect(hex(t.root())).toBe(hex(emptyTreeHash()));
    expect(hex(merkleTreeHash([]))).toBe(hex(emptyTreeHash()));
    expect(() => t.inclusionProof(0, 0)).toThrow(RangeError);
    expect(verifyInclusion(leafHash('a'), 0, 0, [], emptyTreeHash())).toBe(false);
    expect(t.consistencyProof(0, 0)).toEqual([]);
    expect(() => t.root(1)).toThrow(RangeError);
  });

  it('size 1: root is the leaf hash, proof is empty', () => {
    const l = leafHash('only');
    const t = new MerkleTree([l]);
    expect(hex(t.root())).toBe(hex(l));
    expect(t.inclusionProof(0, 1)).toEqual([]);
    expect(verifyInclusion(l, 0, 1, [], l)).toBe(true);
    expect(verifyInclusion(l, 0, 1, [], leafHash('other'))).toBe(false);
    expect(verifyInclusion(l, 0, 1, [leafHash('x')], l)).toBe(false);
    expect(verifyInclusion(l, 1, 1, [], l)).toBe(false);
    expect(verifyConsistency(1, 1, l, l, [])).toBe(true);
  });

  it('proof generators reject out-of-range arguments', () => {
    const t = new MerkleTree(entries(5).map(leafHash));
    expect(() => t.inclusionProof(5, 5)).toThrow(RangeError);
    expect(() => t.inclusionProof(0, 6)).toThrow(RangeError);
    expect(() => t.inclusionProof(-1, 5)).toThrow(RangeError);
    expect(() => t.consistencyProof(4, 3)).toThrow(RangeError);
    expect(() => t.consistencyProof(1, 6)).toThrow(RangeError);
    expect(() => t.append(new Uint8Array(3))).toThrow(TypeError);
    expect(() => fromHex('nothex')).toThrow(TypeError);
  });

  it('tree built incrementally equals a tree built at once, and old proofs stay valid after appends', () => {
    const all = entries(100).map(leafHash);
    const incremental = new MerkleTree();
    const oldProofs: Array<{ i: number; n: number; proof: Hash[]; root: Hash }> = [];
    for (let n = 1; n <= 100; n++) {
      incremental.append(all[n - 1]);
      if (n % 7 === 0) {
        const i = Math.floor(n / 2);
        oldProofs.push({ i, n, proof: incremental.inclusionProof(i, n), root: incremental.root(n) });
      }
    }
    const once = new MerkleTree(all);
    expect(hex(incremental.root())).toBe(hex(once.root()));
    for (const p of oldProofs) {
      expect(hex(once.root(p.n))).toBe(hex(p.root));
      expect(once.inclusionProof(p.i, p.n).map(hex)).toEqual(p.proof.map(hex));
      expect(verifyInclusion(all[p.i], p.i, p.n, p.proof, once.root(p.n))).toBe(true);
    }
  });
});

describe('efficiency: proofs do not rehash the tree', () => {
  it('N=100,000: each proof needs O(log N) subtree lookups; proofs verify', () => {
    const N = 100_000;
    const t = new MerkleTree();
    for (let i = 0; i < N; i++) t.append(leafHash(`leaf-${i}`));
    expect(t.size).toBe(N);

    let calls = 0;
    const counting = (s: number, e: number) => {
      calls++;
      return t.mth(s, e);
    };
    const root = t.root();
    for (const i of [0, 1, 99_999, 65_535, 65_536, 31_337, 77_777]) {
      calls = 0;
      const proof = inclusionProofWith(i, N, counting);
      // one provider call per tree level
      expect(calls).toBe(proof.length);
      expect(proof.length).toBeLessThanOrEqual(17);
      expect(verifyInclusion(t.leafHashAt(i), i, N, proof, root)).toBe(true);
    }
    // consistency across a large gap, verified
    const old = 54_321;
    const cp = t.consistencyProof(old, N);
    expect(cp.length).toBeLessThanOrEqual(2 * 17);
    expect(verifyConsistency(old, N, t.root(old), root, cp)).toBe(true);
  }, 30_000);
});
