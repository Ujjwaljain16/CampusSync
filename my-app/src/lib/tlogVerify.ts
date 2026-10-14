/**
 * Client-usable verifier for the CampusSync transparency log.
 *
 * NO server imports: this file runs in the browser (the /transparency page) and
 * in Node (the server, tests, third-party monitors). It depends only on
 * `@/lib/merkle` (pure JS) and `jose` (WebCrypto based).
 *
 * What a passing result establishes (modelled on RFC 6962/9162 audit proofs):
 *   1. the displayed entry hashes to the claimed leaf hash,
 *   2. that leaf is at `index` of a Merkle tree of `treeSize` leaves with the
 *      claimed root,
 *   3. the root/size are covered by a tree-head signature that verifies against
 *      the supplied issuer public key.
 * It does NOT establish that the event is true, nor that the operator shows the
 * same log to everybody (see docs/TRANSPARENCY-LOG.md).
 */
import { compactVerify, decodeProtectedHeader, importJWK, type JWK } from 'jose';
import { leafHash, toHex, verifyConsistency, verifyInclusion } from '@/lib/merkle';

/** JWS `typ` of signed tree heads (distinguishes them from credentials signed with the same key). */
export const TREE_HEAD_JWS_TYP = 'application/tlog-sth+json';

/** Algorithms accepted for tree-head signatures (same set the credential verifier allows). */
export const TREE_HEAD_ALGS = ['EdDSA', 'ES256', 'RS256'] as const;

export interface TreeHeadPayload {
  treeSize: number;
  rootHash: string;
  timestamp: string;
  logId: string;
}

export interface SignedTreeHead extends TreeHeadPayload {
  jws: string;
}

export interface InclusionProofResponse {
  logId: string;
  index: number;
  treeSize: number;
  entry: Record<string, unknown>;
  leafHash: string;
  proof: string[];
  sth: SignedTreeHead;
}

export interface ConsistencyProofResponse {
  logId: string;
  first: SignedTreeHead;
  second: SignedTreeHead;
  proof: string[];
}

export type CheckStatus = 'pass' | 'fail' | 'skip';
export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}
export interface VerificationReport {
  ok: boolean;
  checks: CheckResult[];
}

export interface Jwks {
  keys: JWK[];
}

// ---------------------------------------------------------------------------
// Canonical JSON (sorted keys, no whitespace) - the leaf entry encoding
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON: object keys sorted by code point, no whitespace,
 * `undefined` members omitted. Only JSON values are allowed.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Non-finite number is not canonicalisable');
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`Cannot canonicalise a value of type ${typeof value}`);
  }
}

/** Hex leaf hash of a log entry: SHA-256(0x00 || canonicalJson(entry)). */
export function entryLeafHashHex(entry: unknown): string {
  return toHex(leafHash(canonicalJson(entry)));
}

// ---------------------------------------------------------------------------
// JWS helpers
// ---------------------------------------------------------------------------

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decode (WITHOUT verifying) the payload of a compact JWS. Returns null when malformed. */
export function decodeJwsPayload(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split('.');
    if (parts.length !== 3) return null;
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

function isSignedTreeHead(x: unknown): x is SignedTreeHead {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    Number.isSafeInteger(o.treeSize) &&
    (o.treeSize as number) >= 0 &&
    typeof o.rootHash === 'string' &&
    HEX64.test(o.rootHash) &&
    typeof o.timestamp === 'string' &&
    typeof o.logId === 'string' &&
    typeof o.jws === 'string'
  );
}

/**
 * Verify a tree-head signature against a JWKS (issuer public keys) and check
 * that the signed payload equals the head's displayed fields.
 */
export async function verifyTreeHeadSignature(sth: SignedTreeHead, jwks: Jwks): Promise<CheckResult> {
  const base = { id: 'sth-signature', label: 'Tree head signature' };
  try {
    if (!isSignedTreeHead(sth)) return { ...base, status: 'fail', detail: 'Malformed signed tree head.' };
    const header = decodeProtectedHeader(sth.jws);
    const alg = header.alg;
    if (typeof alg !== 'string' || !(TREE_HEAD_ALGS as readonly string[]).includes(alg)) {
      return { ...base, status: 'fail', detail: `Unsupported or missing signature algorithm (${String(alg)}).` };
    }
    if (header.typ !== TREE_HEAD_JWS_TYP) {
      return { ...base, status: 'fail', detail: 'Signature is not a tree-head signature (wrong typ).' };
    }
    const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
    const candidates = keys.filter((k) => (header.kid ? k.kid === header.kid : true) && (!k.alg || k.alg === alg));
    if (candidates.length === 0) {
      return { ...base, status: 'fail', detail: 'No matching key in the issuer key set (kid/alg).' };
    }
    let payloadBytes: Uint8Array | null = null;
    for (const jwk of candidates) {
      try {
        const key = await importJWK(jwk, alg);
        const res = await compactVerify(sth.jws, key, { algorithms: [alg] });
        payloadBytes = res.payload;
        break;
      } catch {
        // try the next candidate key
      }
    }
    if (!payloadBytes) return { ...base, status: 'fail', detail: 'Signature does not verify against the issuer key.' };

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<TreeHeadPayload>;
    if (
      payload.treeSize !== sth.treeSize ||
      payload.rootHash !== sth.rootHash ||
      payload.timestamp !== sth.timestamp ||
      payload.logId !== sth.logId
    ) {
      return { ...base, status: 'fail', detail: 'Signed payload differs from the displayed tree head.' };
    }
    return { ...base, status: 'pass', detail: `Signed by the issuer key${header.kid ? ` (kid ${header.kid})` : ''}.` };
  } catch (e) {
    return { ...base, status: 'fail', detail: `Could not verify signature: ${e instanceof Error ? e.message : 'error'}` };
  }
}

// ---------------------------------------------------------------------------
// Whole-response verification
// ---------------------------------------------------------------------------

export interface VerifyInclusionOptions {
  /** Issuer public keys. When omitted the signature check is reported as skipped (never as passed). */
  jwks?: Jwks;
  /** When set, the entry must be about this credential. */
  expectedCredentialId?: string;
}

/**
 * Verify an `/api/transparency/proof/inclusion` response without trusting the
 * server: recompute the leaf hash from the entry, check the audit path against
 * the root, and check the signature over (treeSize, rootHash).
 */
export async function verifyInclusionProofResponse(
  resp: InclusionProofResponse,
  opts: VerifyInclusionOptions = {}
): Promise<VerificationReport> {
  const checks: CheckResult[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) =>
    checks.push({ id, label, status: ok ? 'pass' : 'fail', detail });

  const shapeOk =
    !!resp &&
    typeof resp === 'object' &&
    Number.isSafeInteger(resp.index) &&
    Number.isSafeInteger(resp.treeSize) &&
    typeof resp.leafHash === 'string' &&
    Array.isArray(resp.proof) &&
    !!resp.entry &&
    typeof resp.entry === 'object' &&
    isSignedTreeHead(resp.sth);
  if (!shapeOk) {
    add('shape', 'Response format', false, 'The response is not a well-formed inclusion proof.');
    return { ok: false, checks };
  }

  if (opts.expectedCredentialId !== undefined) {
    add(
      'subject',
      'Entry is about the requested credential',
      resp.entry.credentialId === opts.expectedCredentialId,
      resp.entry.credentialId === opts.expectedCredentialId
        ? 'Entry credentialId matches.'
        : 'Entry credentialId does not match the requested credential.'
    );
  }

  let recomputed = '';
  try {
    recomputed = entryLeafHashHex(resp.entry);
  } catch {
    // reported below
  }
  add(
    'leaf-hash',
    'Entry hashes to the leaf hash',
    recomputed !== '' && recomputed === resp.leafHash,
    recomputed === resp.leafHash
      ? 'SHA-256(0x00 || canonical JSON) matches the claimed leaf hash.'
      : 'The entry does not hash to the claimed leaf hash.'
  );

  add(
    'sth-matches',
    'Tree head covers this proof',
    resp.sth.treeSize === resp.treeSize,
    resp.sth.treeSize === resp.treeSize
      ? `Tree head and proof are both for tree size ${resp.treeSize}.`
      : 'Tree head size differs from the proof tree size.'
  );

  const inclusionOk = verifyInclusion(resp.leafHash, resp.index, resp.treeSize, resp.proof, resp.sth.rootHash);
  add(
    'inclusion',
    'Merkle inclusion proof',
    inclusionOk,
    inclusionOk
      ? `Leaf ${resp.index} is included in the tree of ${resp.treeSize} entries with the signed root.`
      : 'The audit path does not lead to the tree head root.'
  );

  if (opts.jwks) {
    checks.push(await verifyTreeHeadSignature(resp.sth, opts.jwks));
  } else {
    checks.push({
      id: 'sth-signature',
      label: 'Tree head signature',
      status: 'skip',
      detail: 'No issuer key set supplied; signature not checked.',
    });
  }

  const ok = checks.every((c) => c.status === 'pass');
  return { ok, checks };
}

/**
 * Verify an `/api/transparency/proof/consistency` response: both heads are
 * signed, and the larger tree is an append-only extension of the smaller one.
 */
export async function verifyConsistencyProofResponse(
  resp: ConsistencyProofResponse,
  opts: { jwks?: Jwks } = {}
): Promise<VerificationReport> {
  const checks: CheckResult[] = [];
  if (!resp || !isSignedTreeHead(resp.first) || !isSignedTreeHead(resp.second) || !Array.isArray(resp.proof)) {
    return {
      ok: false,
      checks: [{ id: 'shape', label: 'Response format', status: 'fail', detail: 'Malformed consistency proof.' }],
    };
  }
  const ok = verifyConsistency(resp.first.treeSize, resp.second.treeSize, resp.first.rootHash, resp.second.rootHash, resp.proof);
  checks.push({
    id: 'consistency',
    label: 'Merkle consistency proof',
    status: ok ? 'pass' : 'fail',
    detail: ok
      ? `The tree of ${resp.second.treeSize} entries extends the tree of ${resp.first.treeSize} entries (append-only).`
      : 'The later tree does not extend the earlier tree.',
  });
  if (opts.jwks) {
    const [a, b] = await Promise.all([verifyTreeHeadSignature(resp.first, opts.jwks), verifyTreeHeadSignature(resp.second, opts.jwks)]);
    checks.push({ ...a, id: 'sth-first-signature', label: 'First tree head signature' });
    checks.push({ ...b, id: 'sth-second-signature', label: 'Second tree head signature' });
  } else {
    checks.push({ id: 'sth-signature', label: 'Tree head signatures', status: 'skip', detail: 'No issuer key set supplied.' });
  }
  return { ok: checks.every((c) => c.status === 'pass'), checks };
}
