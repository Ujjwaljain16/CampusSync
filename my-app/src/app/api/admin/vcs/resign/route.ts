import { NextRequest } from 'next/server';
import { withSuperAdmin, success, error as errorResponse, apiError, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { getCurrentSigner, resignAll, type ResignDb } from '@/lib/vcResign';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

interface ResignBody {
  dryRun?: unknown;
  limit?: unknown;
}

/**
 * POST /api/admin/vcs/resign   (super admin only)
 *
 * Key rotation step: re-sign every ACTIVE stored credential that was signed by a key other than
 * the current issuer key, so the old public key can be removed from VC_ISSUER_PREVIOUS_PUBLIC_JWKS.
 * Body: { dryRun?: boolean, limit?: number }. Repeat until `limitReached` is false.
 * Procedure: docs/KEY-ROTATION.md.
 */
export const POST = withSuperAdmin(async (req: NextRequest, { user }) => {
  const limited = enforceRateLimit(req, 'vc-resign', RateLimitPresets.strict, user.id);
  if (limited) return limited;

  const raw = await req.text();
  let body: ResignBody = {};
  if (raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as ResignBody;
    } catch {
      return apiError.badRequest('Body must be a JSON object');
    }
  }
  if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
    return apiError.badRequest('dryRun must be a boolean');
  }
  let limit = DEFAULT_LIMIT;
  if (body.limit !== undefined) {
    if (typeof body.limit !== 'number' || !Number.isInteger(body.limit) || body.limit < 1 || body.limit > MAX_LIMIT) {
      return apiError.badRequest(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    }
    limit = body.limit;
  }
  const dryRun = body.dryRun === true;

  // The current key must be configured, usable and have a kid before anything is re-signed.
  let signer;
  try {
    signer = await getCurrentSigner();
  } catch {
    return errorResponse(
      'The current issuer signing key is missing or unusable (VC_ISSUER_JWK). Configure the new key and redeploy before re-signing.',
      409
    );
  }

  const admin = (await createSupabaseAdminClient()) as unknown as ResignDb;
  const result = await resignAll(admin, { dryRun, limit, signer });

  // Counts only: never key material, never credential contents.
  await writeAudit(null, {
    actorId: user.id,
    organizationId: null,
    action: 'vc_resign',
    targetType: 'system',
    details: {
      dryRun,
      limit,
      scanned: result.scanned,
      resigned: result.resigned,
      skipped: result.skipped,
      failed: result.failed.length,
      limitReached: result.limitReached,
    },
  });

  return success(result);
});
