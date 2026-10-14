/**
 * Generic JWS signing with the issuer key (server only).
 *
 * Built on the public exports of `@/lib/vc` so the key handling (parsing the
 * configured JWK, rejecting the development placeholder, pinning the algorithm
 * allow-list) stays in one place. The private key never leaves this process and
 * is never logged.
 */
import { CompactSign, compactVerify, importJWK } from 'jose';
import { ALLOWED_VC_ALGS, getIssuerJwk, getIssuerPublicJwk, isPlaceholderJwk } from '@/lib/vc';
import { canonicalJson } from '@/lib/tlogVerify';

/**
 * Sign `payload` (canonical JSON) as a compact JWS with the issuer key.
 * `typ` goes into the protected header so a signature made for one purpose
 * (e.g. a tree head) cannot be mistaken for another (e.g. a credential).
 */
export async function signPayload(payload: Record<string, unknown>, opts: { typ: string }): Promise<string> {
  const jwk = await getIssuerJwk();
  if (isPlaceholderJwk(jwk)) throw new Error('Issuer key is a development placeholder; refusing to sign');
  const alg = jwk.alg;
  if (typeof alg !== 'string' || !(ALLOWED_VC_ALGS as readonly string[]).includes(alg)) {
    throw new Error('Issuer key must declare alg EdDSA, ES256 or RS256');
  }
  const key = await importJWK(jwk, alg);
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  return new CompactSign(bytes)
    .setProtectedHeader({ alg, typ: opts.typ, ...(jwk.kid ? { kid: jwk.kid } : {}) })
    .sign(key);
}

/** Verify a JWS made by {@link signPayload} against the issuer PUBLIC key; returns the payload. */
export async function verifySignedPayload(jws: string, opts: { typ: string }): Promise<Record<string, unknown>> {
  const pub = await getIssuerPublicJwk();
  const key = await importJWK(pub, pub.alg);
  const { payload, protectedHeader } = await compactVerify(jws, key, { algorithms: [pub.alg] });
  if (protectedHeader.typ !== opts.typ) throw new Error('Unexpected JWS typ');
  return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
}
