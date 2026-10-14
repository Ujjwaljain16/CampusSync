/**
 * Server-only helpers shared by the SD-JWT routes. Not a route file.
 */
import * as vcModule from '@/lib/vc';
import { getIssuerJwk } from '@/lib/vc';
import { toPublicJwkSafe, type JWK } from '@/lib/sdjwt';

/** Feature flag: selective disclosure is OFF unless SD_JWT_ENABLED=true. */
export function sdEnabled(): boolean {
  return process.env.SD_JWT_ENABLED === 'true';
}

export const SD_VCT = 'urn:campussync:credential:certificate:1';

/** Selectively disclosable claims that exist on every certificate credential. */
export const SD_STANDARD_CLAIMS = ['title', 'institution', 'date_issued', 'certificate_id'] as const;
/** Claims that only exist when the certificate carries them. */
export const SD_OPTIONAL_CLAIMS = ['degree_level', 'description'] as const;

export function getIssuerDid(): string {
  return process.env.NEXT_PUBLIC_ISSUER_DID || 'did:web:example.org';
}

/** True for the placeholder development key (cannot sign real tokens). */
export function isPlaceholderJwk(jwk: JWK): boolean {
  return jwk.n === 'placeholder-n-value-for-development';
}

function asJwkArray(value: unknown): JWK[] {
  if (Array.isArray(value)) return value as JWK[];
  if (value && typeof value === 'object') {
    const keys = (value as { keys?: unknown }).keys;
    if (Array.isArray(keys)) return keys as JWK[];
    return [value as JWK];
  }
  return [];
}

/**
 * Public keys accepted for issuer signatures. Uses the shared helpers from
 * `@/lib/vc` when present (`getIssuerVerificationKeys` -> `getIssuerPublicJwk`)
 * and otherwise derives the public half of the current issuer key.
 */
export async function getSdVerificationKeys(): Promise<JWK[]> {
  const mod = vcModule as unknown as Record<string, unknown>;
  const call = async (name: string): Promise<JWK[] | null> => {
    let fn: unknown;
    try {
      fn = mod[name];
    } catch {
      fn = undefined; // strict module namespaces may throw on missing exports
    }
    if (typeof fn !== 'function') return null;
    return asJwkArray(await (fn as () => unknown)());
  };
  const keys = (await call('getIssuerVerificationKeys')) ?? (await call('getIssuerPublicJwk')) ?? [toPublicJwkSafe(await getIssuerJwk())];
  return keys.map(toPublicJwkSafe);
}

/** Postgres / PostgREST codes for "relation does not exist". */
export function isUndefinedTableError(err: { code?: string } | null | undefined): boolean {
  return err?.code === '42P01' || err?.code === 'PGRST205';
}

/**
 * Validate a client-supplied holder public key. Returns a clean public JWK or
 * null. Private members are rejected outright (not silently dropped) so a
 * client never ships its private key to the server by mistake.
 */
export function sanitizeHolderPublicJwk(input: unknown): JWK | null {
  if (!input || typeof input !== 'object') return null;
  const j = input as Record<string, unknown>;
  for (const m of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k']) if (m in j) return null;
  if (j.kty === 'EC' && j.crv === 'P-256' && typeof j.x === 'string' && typeof j.y === 'string') {
    return { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, alg: 'ES256' };
  }
  if (j.kty === 'OKP' && j.crv === 'Ed25519' && typeof j.x === 'string') {
    return { kty: 'OKP', crv: 'Ed25519', x: j.x, alg: 'EdDSA' };
  }
  return null;
}
