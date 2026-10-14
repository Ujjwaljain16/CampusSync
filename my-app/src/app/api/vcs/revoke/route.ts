import { NextRequest } from 'next/server';
import {
  withRole,
  success,
  apiError,
  parseAndValidateBody,
  isValidUUID,
  getOrganizationContext,
  getTargetOrganizationIds,
  writeAudit,
} from '@/lib/api';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';
import { credentialIdCandidates, isInvalidInputSyntax } from '@/lib/vcId';
import { markCredentialsRevoked } from '@/lib/statusList';

interface RevokeBody {
  credentialId: string;
  reason?: string;
}

const MAX_REASON_LENGTH = 500;

/**
 * Revoke a verifiable credential.
 *
 * Source of truth is `verifiable_credentials.status` (+ revoked_at / revoked_reason),
 * which is what every verification endpoint checks. There is no separate revocation table.
 */
export const POST = withRole(['admin', 'faculty', 'org_admin', 'super_admin'], async (req: NextRequest, { user, role }) => {
  const result = await parseAndValidateBody<RevokeBody>(req, ['credentialId']);
  if (result.error) return result.error;

  const body = result.data;

  const candidates = credentialIdCandidates(body.credentialId);
  if (candidates.length === 0) {
    return apiError.badRequest('credentialId must be a credential id (urn:uuid:<uuid> or a UUID)');
  }
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string') return apiError.badRequest('reason must be a string');
    if (body.reason.length > MAX_REASON_LENGTH) {
      return apiError.badRequest(`reason must be at most ${MAX_REASON_LENGTH} characters`);
    }
  }
  const reason = body.reason?.trim() ? body.reason.trim() : null;

  const supabase = await createSupabaseServerClient();

  // Load the credential so we can scope the caller to the right organization.
  // The id is stored as issued (urn:uuid:<uuid>); accept the bare UUID too.
  type VcRow = {
    id: string;
    status: string;
    credential: unknown;
    certificate_id: string | null;
    organization_id: string | null;
  };
  let vcRow: VcRow | null = null;
  for (const candidate of candidates) {
    const { data, error: vcErr } = await supabase
      .from('verifiable_credentials')
      .select('id, status, credential, certificate_id, organization_id')
      .eq('id', candidate)
      .maybeSingle();
    if (vcErr) {
      if (isInvalidInputSyntax(vcErr)) continue; // uuid-typed column: try the bare spelling
      console.error('[vcs/revoke] credential lookup failed:', vcErr.code);
      return apiError.internal('Failed to revoke credential');
    }
    if (data) {
      vcRow = data as VcRow;
      break;
    }
  }
  if (!vcRow) return apiError.notFound('Credential not found');
  const credentialId = vcRow.id; // exactly as stored

  // Organization scoping: the credential's own organization_id first; rows without one fall back to
  // the organization of their certificate (certificate_id column).
  let credentialOrgId: string | null = vcRow.organization_id ?? null;
  if (role !== 'super_admin') {
    const orgContext = await getOrganizationContext(user);
    if (!orgContext.isSuperAdmin) {
      if (!credentialOrgId) {
        const certificateId = vcRow.certificate_id;
        if (typeof certificateId !== 'string' || !isValidUUID(certificateId)) {
          return apiError.forbidden('Credential is outside your organization');
        }
        const { data: cert } = await supabase
          .from('certificates')
          .select('organization_id')
          .eq('id', certificateId)
          .maybeSingle();
        credentialOrgId = cert?.organization_id ?? null;
      }
      if (!credentialOrgId || !getTargetOrganizationIds(orgContext).includes(credentialOrgId)) {
        return apiError.forbidden('Credential is outside your organization');
      }
    }
  }

  // Idempotent: already revoked
  if (vcRow.status === 'revoked') {
    return success({ status: 'revoked', credentialId, alreadyRevoked: true });
  }

  // Authorized. Credential rows are written by the backend only: update with the service role.
  const admin = await createSupabaseAdminClient();
  const now = new Date().toISOString();
  let { data: updated, error: updateError } = await admin
    .from('verifiable_credentials')
    .update({ status: 'revoked', revoked_at: now, revoked_reason: reason })
    .eq('id', credentialId)
    .select('id');

  // revoked_at / revoked_reason may not exist in every deployment: fall back to status only
  if (updateError && (updateError.code === '42703' || updateError.code === 'PGRST204')) {
    console.warn('[vcs/revoke] revoked_at/revoked_reason columns missing; updating status only');
    ({ data: updated, error: updateError } = await admin
      .from('verifiable_credentials')
      .update({ status: 'revoked' })
      .eq('id', credentialId)
      .select('id'));
  }

  if (updateError) {
    console.error('[vcs/revoke] update failed:', updateError.code);
    return apiError.internal('Failed to revoke credential');
  }
  if (!updated || updated.length === 0) {
    return apiError.notFound('Credential not found');
  }

  // Best effort: flip the credential's bit in the public revocation status list (only when it has
  // a credentialStatus entry). Never fails the revocation; the status column stays authoritative.
  await markCredentialsRevoked([{ id: credentialId, credential: vcRow.credential }]);

  // Audit log (canonical shape, written with the service role by writeAudit)
  await writeAudit(admin, {
    actorId: user.id,
    organizationId: credentialOrgId,
    action: 'revoke_vc',
    targetType: 'credential',
    targetId: credentialId,
    details: { reason },
  });

  // --- transparency log (best-effort, no-op unless TRANSPARENCY_LOG_ENABLED=true) ---
  if (process.env.TRANSPARENCY_LOG_ENABLED === 'true') {
    try {
      const { appendEventSafely } = await import('@/lib/transparencyLog');
      await appendEventSafely({ type: 'credential.revoked', credentialId });
    } catch { /* logging must never affect revocation */ }
  }
  // --- end transparency log ---

  return success({ status: 'revoked', credentialId });
});
