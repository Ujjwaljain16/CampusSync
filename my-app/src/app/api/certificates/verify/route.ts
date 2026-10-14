import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { verifyCredential, toPublicResult } from '@/lib/vcVerify';

interface VerifyBody {
  jws?: unknown;
  vc?: {
    proof?: {
      jws?: string;
    };
  };
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'cert-verify', RateLimitPresets.relaxed);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as VerifyBody | null;
  if (!body || typeof body !== 'object') return apiError.badRequest('Invalid JSON');

  const jws = typeof body.jws === 'string' && body.jws ? body.jws : body.vc?.proof?.jws;
  if (typeof jws !== 'string' || !jws) return apiError.badRequest('Missing jws or vc.proof.jws');

  // Signature + expiry + revocation (fail-closed); response fields come from the signed payload.
  const result = await verifyCredential({ jws });
  return success(
    toPublicResult(result),
    result.valid ? 'Credential verified successfully' : 'Credential verification failed'
  );
}
