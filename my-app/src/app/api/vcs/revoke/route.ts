import { NextRequest } from 'next/server';
import {
  withRole,
  success,
  apiError,
  parseAndValidateBody,
  isValidUUID,
  getOrganizationContext,
  getTargetOrganizationIds,
} from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { credentialIdCandidates, isInvalidInputSyntax } from '@/lib/vcId';

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
  let vcRow: { id: string; status: string; credential: unknown } | null = null;
  for (const candidate of candidates) {
    const { data, error: vcErr } = await supabase
      .from('verifiable_credentials')
      .select('id, status, credential')
      .eq('id', candidate)
      .maybeSingle();
    if (vcErr) {
      if (isInvalidInputSyntax(vcErr)) continue; // uuid-typed column: try the bare spelling
      console.error('[vcs/revoke] credential lookup failed:', vcErr.code);
      return apiError.internal('Failed to revoke credential');
    }
    if (data) {
      vcRow = data as typeof vcRow;
      break;
    }
  }
  if (!vcRow) return apiError.notFound('Credential not found');
  const credentialId = vcRow.id; // exactly as stored

  // Organization scoping (credentials have no organization column; use the certificate's)
  if (role !== 'super_admin') {
    const orgContext = await getOrganizationContext(user);
    if (!orgContext.isSuperAdmin) {
      const certificateId = (vcRow.credential as { credentialSubject?: { certificateId?: unknown } } | null)
        ?.credentialSubject?.certificateId;
      if (typeof certificateId !== 'string' || !isValidUUID(certificateId)) {
        return apiError.forbidden('Credential is outside your organization');
      }
      const { data: cert } = await supabase
        .from('certificates')
        .select('organization_id')
        .eq('id', certificateId)
        .maybeSingle();
      if (!cert || !getTargetOrganizationIds(orgContext).includes(cert.organization_id)) {
        return apiError.forbidden('Credential is outside your organization');
      }
    }
  }

  // Idempotent: already revoked
  if (vcRow.status === 'revoked') {
    return success({ status: 'revoked', credentialId, alreadyRevoked: true });
  }

  const now = new Date().toISOString();
  let { data: updated, error: updateError } = await supabase
    .from('verifiable_credentials')
    .update({ status: 'revoked', revoked_at: now, revoked_reason: reason })
    .eq('id', credentialId)
    .select('id');

  // revoked_at / revoked_reason may not exist in every deployment: fall back to status only
  if (updateError && (updateError.code === '42703' || updateError.code === 'PGRST204')) {
    console.warn('[vcs/revoke] revoked_at/revoked_reason columns missing; updating status only');
    ({ data: updated, error: updateError } = await supabase
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

  // Audit log (same columns as the other audit inserts, e.g. certificates/issue)
  try {
    const { error: auditError } = await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'revoke_vc',
      entity_type: 'verifiable_credential',
      entity_id: credentialId,
      details: { reason },
      created_at: now,
    });
    if (auditError) console.error('[vcs/revoke] audit log insert failed:', auditError.code, auditError.message);
  } catch (auditError) {
    console.error('[vcs/revoke] audit log error:', auditError);
  }

  return success({ status: 'revoked', credentialId });
});
