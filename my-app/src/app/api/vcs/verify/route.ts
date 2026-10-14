import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { enforceGlobalRateLimit } from '@/lib/rateLimitGlobal';
import { verifyCredential, toPublicResult } from '@/lib/vcVerify';

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, 'vcs-verify', RateLimitPresets.relaxed);
  if (limited) return limited;
  const globalLimited = await enforceGlobalRateLimit(req, 'vcs-verify', { limit: 30, windowSeconds: 60 });
  if (globalLimited) return globalLimited;

  const { searchParams } = new URL(req.url);
  const vcId = searchParams.get('vcId');
  if (!vcId || vcId.length > 200) {
    return apiError.badRequest('Missing vcId');
  }

  const result = await verifyCredential({ vcId });
  return success(toPublicResult(result));
}
