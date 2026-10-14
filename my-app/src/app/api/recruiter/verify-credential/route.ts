/**
 * Verifiable Credential (VC) Verification Endpoint
 *
 * Purpose: Cryptographically verifies W3C Verifiable Credentials using JWS signatures
 * and checks their revocation status.
 *
 * Supports 3 verification methods (all go through the shared `verifyCredential` service):
 * 1. JWS Direct - Verify raw JWS string
 * 2. VC Object - Verify the JWS embedded in a VC (the VC's own fields are NOT trusted;
 *    results are taken from the signed payload)
 * 3. Credential ID - Look the VC up in the database and verify it
 *
 * Revocation is always checked against `verifiable_credentials.status`, and the check
 * fails closed (unknown credential / lookup failure => valid:false).
 */
import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { verifyCredential, toPublicResult, type VerifyInput } from '@/lib/vcVerify';

type Method = 'jws_direct' | 'vc_object' | 'credential_id';

async function run(input: VerifyInput, method: Method) {
  const result = await verifyCredential(input);
  return success({ ...toPublicResult(result), verification_method: method });
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'verify-credential', RateLimitPresets.relaxed);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    jws?: unknown;
    vc?: { proof?: { jws?: string } };
    credentialId?: unknown;
  } | null;
  if (!body || typeof body !== 'object') return apiError.badRequest('Invalid JSON');

  if (typeof body.jws === 'string' && body.jws) return run({ jws: body.jws }, 'jws_direct');
  if (typeof body.vc?.proof?.jws === 'string' && body.vc.proof.jws) {
    return run({ jws: body.vc.proof.jws }, 'vc_object');
  }
  if (typeof body.credentialId === 'string' && body.credentialId && body.credentialId.length <= 200) {
    return run({ vcId: body.credentialId }, 'credential_id');
  }

  return apiError.badRequest('Missing verification data. Provide jws, vc, or credentialId');
}

// GET endpoint for public credential verification (no auth required)
export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, 'verify-credential', RateLimitPresets.relaxed);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get('id');
  const jws = searchParams.get('jws');

  if (jws) return run({ jws }, 'jws_direct');
  if (credentialId && credentialId.length <= 200) return run({ vcId: credentialId }, 'credential_id');

  return apiError.badRequest('Missing credential ID or JWS');
}
