/**
 * Recruiter -> organization access requests.
 *
 * Single source of truth: a per-organization `user_roles` row
 * (role='recruiter', organization_id=<org>, approval_status pending/approved/denied).
 * Both /api/recruiter/access-requests and /api/recruiter/request-access use this.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccessRequestOutcome {
  status: number;
  body: Record<string, unknown>;
}

export async function createRecruiterAccessRequest(
  admin: Pick<SupabaseClient, 'from'>,
  userId: string,
  organizationId: string,
  notes?: string | null
): Promise<AccessRequestOutcome> {
  // 1. Platform-level approval first
  const { data: platformRows, error: platformError } = await admin
    .from('user_roles')
    .select('approval_status')
    .eq('user_id', userId)
    .eq('role', 'recruiter')
    .is('organization_id', null)
    .limit(1);
  if (platformError) {
    console.error('[recruiter-access] platform lookup failed:', platformError);
    return { status: 500, body: { error: 'Failed to create access request' } };
  }
  const platform = (platformRows ?? [])[0] as { approval_status?: string } | undefined;
  if (!platform) return { status: 403, body: { error: 'Recruiter role required' } };
  if (platform.approval_status !== 'approved') {
    return { status: 403, body: { error: 'Your platform access is not yet approved' } };
  }

  // 2. Organization must exist and be active
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id, name, is_active')
    .eq('id', organizationId)
    .maybeSingle();
  if (orgError || !org) return { status: 404, body: { error: 'Organization not found' } };
  if (!org.is_active) return { status: 400, body: { error: 'Organization is not active' } };

  // 3. Existing row for (user, org)? (one row per user per organization)
  const { data: existingRows } = await admin
    .from('user_roles')
    .select('role, approval_status')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .limit(1);
  const existing = (existingRows ?? [])[0] as { role: string; approval_status: string } | undefined;
  const now = new Date().toISOString();

  if (existing) {
    if (existing.role !== 'recruiter') {
      return { status: 409, body: { error: 'You already have a different role in this organization' } };
    }
    if (existing.approval_status === 'approved') {
      return { status: 400, body: { error: 'You already have access to this organization' } };
    }
    if (existing.approval_status === 'pending') {
      return { status: 400, body: { error: 'Your access request is already pending' } };
    }
    // denied / revoked: re-open the same row as pending
    const { error: reopenError } = await admin
      .from('user_roles')
      .update({
        approval_status: 'pending',
        approved_by: null,
        approved_at: null,
        approval_notes: notes ?? null,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('role', 'recruiter')
      .eq('approval_status', 'denied');
    if (reopenError) {
      console.error('[recruiter-access] reopen failed:', reopenError);
      return { status: 500, body: { error: 'Failed to create access request' } };
    }
  } else {
    const { error: insertError } = await admin.from('user_roles').insert({
      user_id: userId,
      role: 'recruiter',
      organization_id: organizationId,
      approval_status: 'pending',
      approval_notes: notes ?? null,
      created_at: now,
      updated_at: now,
    });
    if (insertError) {
      if (insertError.code === '23505') {
        return { status: 400, body: { error: 'Your access request is already pending' } };
      }
      console.error('[recruiter-access] insert failed:', insertError);
      return { status: 500, body: { error: 'Failed to create access request' } };
    }
  }

  return {
    status: 201,
    body: {
      success: true,
      status: 'pending',
      organization_id: organizationId,
      requested_at: now,
      message: `Access request sent to ${org.name}. You'll be notified when it's reviewed.`,
    },
  };
}
