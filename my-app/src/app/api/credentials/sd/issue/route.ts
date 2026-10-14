import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';
import {
  withAuth,
  success,
  error as apiErrorResponse,
  apiError,
  isValidUUID,
  getOrganizationContext,
  getTargetOrganizationIds,
  writeAudit,
} from '@/lib/api';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { enforceGlobalRateLimit } from '@/lib/rateLimitGlobal';
import { getIssuerJwk } from '@/lib/vc';
import { issueSdJwt } from '@/lib/sdjwt';
import {
  sdEnabled,
  getIssuerDid,
  isPlaceholderJwk,
  isUndefinedTableError,
  sanitizeHolderPublicJwk,
  SD_VCT,
  SD_OPTIONAL_CLAIMS,
  SD_STANDARD_CLAIMS,
} from '../_shared';

const DEFAULT_LIFETIME_SECONDS = 30 * 24 * 3600;
const MIN_LIFETIME_SECONDS = 3600;
const MAX_LIFETIME_SECONDS = 90 * 24 * 3600;

interface IssueBody {
  certificateId?: unknown;
  holderPublicJwk?: unknown;
  expiresInSeconds?: unknown;
}

/**
 * POST /api/credentials/sd/issue
 *
 * Mints an SD-JWT VC for the caller's own VERIFIED certificate, provided an
 * ACTIVE issued credential exists for it (so revoking the credential also
 * kills sharing). The SD-JWT with ALL disclosures is returned to the owner
 * only; disclosures are never stored server-side.
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  if (!sdEnabled()) return apiError.notFound('Selective disclosure is not enabled');

  const limited = enforceRateLimit(req, 'sd-issue', RateLimitPresets.standard, user.id);
  if (limited) return limited;
  const globalLimited = await enforceGlobalRateLimit(req, 'sd-issue', { limit: 10, windowSeconds: 60 }, user.id);
  if (globalLimited) return globalLimited;

  const body = (await req.json().catch(() => null)) as IssueBody | null;
  if (!body || typeof body !== 'object') return apiError.badRequest('Invalid JSON');

  const certificateId = body.certificateId;
  if (typeof certificateId !== 'string' || !isValidUUID(certificateId)) {
    return apiError.badRequest('A valid certificateId is required');
  }

  let holderPublicJwk;
  if (body.holderPublicJwk !== undefined) {
    holderPublicJwk = sanitizeHolderPublicJwk(body.holderPublicJwk) ?? undefined;
    if (!holderPublicJwk) {
      return apiError.badRequest('holderPublicJwk must be a public EC P-256 or Ed25519 JWK without private members');
    }
  }

  let lifetime = DEFAULT_LIFETIME_SECONDS;
  if (body.expiresInSeconds !== undefined) {
    if (typeof body.expiresInSeconds !== 'number' || !Number.isFinite(body.expiresInSeconds)) {
      return apiError.badRequest('expiresInSeconds must be a number');
    }
    lifetime = Math.min(MAX_LIFETIME_SECONDS, Math.max(MIN_LIFETIME_SECONDS, Math.floor(body.expiresInSeconds)));
  }

  const supabase = await createSupabaseServerClient();
  const { data: cert, error: certErr } = await supabase.from('certificates').select('*').eq('id', certificateId).single();
  if (certErr || !cert) return apiError.notFound('Certificate not found');

  // Owner only. Do not reveal whether somebody else's certificate exists.
  if (cert.student_id !== user.id) return apiError.notFound('Certificate not found');

  if (cert.verification_status !== 'verified') {
    return apiError.forbidden('Only verified certificates can be shared');
  }

  const orgContext = await getOrganizationContext(user);
  if (!getTargetOrganizationIds(orgContext).includes(cert.organization_id)) {
    return apiError.forbidden('Certificate is outside your organization');
  }

  // An ACTIVE issued credential must exist: revocation then disables sharing.
  const admin = await createSupabaseAdminClient();
  const { data: vcRows, error: vcErr } = await admin
    .from('verifiable_credentials')
    .select('id, status, organization_id')
    .eq('certificate_id', cert.id)
    .eq('student_id', user.id)
    .eq('status', 'active')
    .order('issuance_date', { ascending: false })
    .limit(1);
  if (vcErr) {
    console.error('[SD issue] credential lookup failed');
    return apiError.internal('Failed to look up credential');
  }
  const vcRow = Array.isArray(vcRows) ? vcRows[0] : vcRows;
  if (!vcRow) {
    return apiError.notFound('No active credential exists for this certificate');
  }

  const issuerJwk = await getIssuerJwk();
  if (isPlaceholderJwk(issuerJwk)) {
    return apiErrorResponse('Issuer key is not configured for signing', 503);
  }

  // Claims: only certificate facts. Never name / email / phone / student id.
  const claims: Record<string, unknown> = {
    credential_ref: vcRow.id, // NON-selective: enables revocation checks (and correlation, see docs)
    title: cert.title,
    institution: cert.institution,
    date_issued: cert.date_issued,
    certificate_id: cert.id,
  };
  const disclosable: string[] = [...SD_STANDARD_CLAIMS];
  for (const name of SD_OPTIONAL_CLAIMS) {
    const value = (cert as Record<string, unknown>)[name];
    if (typeof value === 'string' && value.trim() !== '') {
      claims[name] = value;
      disclosable.push(name);
    }
  }

  const issued = await issueSdJwt({
    claims,
    disclosable,
    issuerKey: issuerJwk,
    issuer: getIssuerDid(),
    subject: `urn:uuid:${globalThis.crypto.randomUUID()}`, // opaque, NOT the student id
    vct: SD_VCT,
    expiresInSeconds: lifetime,
    holderPublicJwk,
  });

  const now = new Date().toISOString();

  // Optional accounting: no disclosures, no claim values. Tolerates a missing table.
  try {
    const digestListHash = createHash('sha256').update(issued.digests.join(',')).digest('hex');
    const { error: accErr } = await admin.from('sd_issuances').insert({
      credential_id: vcRow.id,
      sd_jti: issued.jti,
      digest_list_hash: digestListHash,
      created_at: now,
    });
    if (accErr && !isUndefinedTableError(accErr)) console.error('[SD issue] accounting insert failed');
  } catch {
    /* accounting is best-effort */
  }

  await writeAudit(admin, {
    actorId: user.id,
    organizationId: vcRow.organization_id ?? cert.organization_id ?? null,
    action: 'issue_sd_jwt',
    targetType: 'credential',
    targetId: vcRow.id,
    details: { sd_jti: issued.jti, certificateId: cert.id },
  });

  const res = success(
    {
      sdJwt: issued.sdJwt,
      jti: issued.jti,
      credentialRef: vcRow.id,
      disclosable,
      expiresAt: new Date((Math.floor(Date.now() / 1000) + lifetime) * 1000).toISOString(),
    },
    'SD-JWT credential issued',
    201
  );
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
