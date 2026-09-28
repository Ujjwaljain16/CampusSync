import { NextRequest } from 'next/server';
import { getIssuerJwk, verifyCredentialJws } from '@/lib/vc';
import { success, apiError } from '@/lib/api';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';

interface VerifyBody {
  jws?: string;
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
  if (!body) throw apiError.badRequest('Invalid JSON');

  const jws = body.jws || body.vc?.proof?.jws;
  if (!jws) throw apiError.badRequest('Missing jws or vc.proof.jws');

  try {
    const jwk = await getIssuerJwk();
    const { payload, protectedHeader } = await verifyCredentialJws(jws, jwk);
    return success({ valid: true, payload, protectedHeader }, 'Credential verified successfully');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return success({ valid: false, error: message }, 'Credential verification failed', 200);
  }
}


