import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { enforceGlobalRateLimit } from '@/lib/rateLimitGlobal';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { verifyPresentation, type SdReason } from '@/lib/sdjwt';
import { sdEnabled, getIssuerDid, getSdVerificationKeys, SD_STANDARD_CLAIMS } from '../_shared';

const MAX_PRESENTATION_CHARS = 16 * 1024;
const MAX_LABEL_CHARS = 256;
const VC_ID_RE = /^urn:uuid:[0-9a-fA-F-]{36}$/;

type VerifyReason = SdReason | 'credential_ref_missing' | 'credential_not_found' | 'credential_revoked' | 'credential_inactive' | 'revocation_check_failed' | 'verifier_not_configured';

interface VerifyBody {
  presentation?: unknown;
  audience?: unknown;
  nonce?: unknown;
}

function respond(payload: Record<string, unknown>) {
  const res = success(payload);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function invalid(reason: VerifyReason, extra: Record<string, unknown> = {}) {
  return respond({ valid: false, reason, claims: {}, disclosed: [], notDisclosed: [], keyBound: false, issuer: null, expiresAt: null, credentialStatus: 'unknown', ...extra });
}

/**
 * POST /api/credentials/sd/verify  (PUBLIC, rate limited)
 *
 * Verifies an SD-JWT presentation: issuer signature over exactly the
 * disclosed claims, expiry, optional key binding, and the status of the
 * underlying credential (fails closed if the status cannot be determined).
 * Returns only disclosed claims; the presentation is never logged or stored.
 */
export async function POST(req: NextRequest) {
  if (!sdEnabled()) return apiError.notFound('Selective disclosure is not enabled');

  const limited = enforceRateLimit(req, 'sd-verify', RateLimitPresets.relaxed);
  if (limited) return limited;
  const globalLimited = await enforceGlobalRateLimit(req, 'sd-verify', { limit: 30, windowSeconds: 60 });
  if (globalLimited) return globalLimited;

  const body = (await req.json().catch(() => null)) as VerifyBody | null;
  if (!body || typeof body !== 'object') return apiError.badRequest('Invalid JSON');

  const { presentation, audience, nonce } = body;
  if (typeof presentation !== 'string' || presentation.length === 0 || presentation.length > MAX_PRESENTATION_CHARS) {
    return apiError.badRequest('presentation must be a string of at most 16384 characters');
  }
  for (const [name, v] of [['audience', audience], ['nonce', nonce]] as const) {
    if (v !== undefined && (typeof v !== 'string' || v.length === 0 || v.length > MAX_LABEL_CHARS)) {
      return apiError.badRequest(`${name} must be a non-empty string of at most ${MAX_LABEL_CHARS} characters`);
    }
  }

  let keys;
  try {
    keys = await getSdVerificationKeys();
  } catch {
    console.error('[SD verify] issuer keys unavailable');
    return invalid('verifier_not_configured');
  }

  const result = await verifyPresentation(presentation, {
    issuerJwks: keys,
    expectedIssuer: getIssuerDid(),
    expectedAudience: typeof audience === 'string' ? audience : undefined,
    expectedNonce: typeof nonce === 'string' ? nonce : undefined,
  });
  if (!result.valid) return invalid(result.reason);

  // Revocation: fail closed on ANY problem determining the credential status.
  const ref = result.claims.credential_ref;
  if (typeof ref !== 'string' || !VC_ID_RE.test(ref)) return invalid('credential_ref_missing');

  let status: string;
  try {
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin.from('verifiable_credentials').select('id, status').eq('id', ref).maybeSingle();
    if (error) return invalid('revocation_check_failed');
    if (!data) return invalid('credential_not_found');
    status = String(data.status);
  } catch {
    return invalid('revocation_check_failed');
  }
  if (status === 'revoked') return invalid('credential_revoked', { credentialStatus: 'revoked' });
  if (status !== 'active') return invalid('credential_inactive', { credentialStatus: status });

  // Never echo the holder's confirmation key; the credential reference is shown separately.
  const claims = { ...result.claims };
  delete claims.cnf;

  const notDisclosed = SD_STANDARD_CLAIMS.filter((n) => !result.disclosed.includes(n));
  return respond({
    valid: true,
    reason: 'ok',
    claims,
    disclosed: result.disclosed,
    notDisclosed,
    keyBound: result.keyBound,
    keyBinding: result.keyBinding ?? null,
    issuer: result.issuer,
    expiresAt: result.expiresAt,
    credentialStatus: 'active',
  });
}
