/**
 * Super-admin operations on an organization's admins (used by the v2 routes).
 *
 * user_roles facts (live DB): UNIQUE(user_id, organization_id) NULLS NOT
 * DISTINCT, and `is_primary_admin = true` requires role = 'org_admin'.
 * There are no multi-statement transactions through PostgREST, so every
 * multi-step change below is ordered so that a failure at any step leaves
 * the organization WITH a primary admin (the new one is written first, the
 * old flag is only cleared once the new row is known-good, and failures
 * restore the previous state).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserByEmail } from './authUsers';
import { isValidEmail } from './validation';
import { getTargetRoleRow } from './roleIntegrity';
import { applyRoleChange } from './roleMutations';

type Db = SupabaseClient;

export interface Outcome<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  body: T | { error: string; [k: string]: unknown };
}

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Outcome => ({
  ok: false,
  status,
  body: { error, ...extra },
});

export interface PrimaryChange {
  previousPrimaryId: string | null;
}

/**
 * Make `newUserId` the primary admin of `orgId`.
 * The target must hold an approved `org_admin` row in the org.
 */
export async function promotePrimaryAdmin(
  admin: Db,
  orgId: string,
  newUserId: string,
  actorId?: string
): Promise<{ ok: true; change: PrimaryChange } | { ok: false; status: number; error: string }> {
  const target = await getTargetRoleRow(admin, newUserId, orgId);
  if (!target || target.approval_status !== 'approved' || target.role !== 'org_admin') {
    return { ok: false, status: 422, error: 'The new primary admin must be an approved org_admin of this organization' };
  }

  const { data: currentRows, error: currentError } = await admin
    .from('user_roles')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('is_primary_admin', true);
  if (currentError) {
    console.error('[primary-admin] lookup failed:', currentError);
    return { ok: false, status: 500, error: 'Failed to change primary admin' };
  }
  const previous = ((currentRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  if (previous.length === 1 && previous[0] === newUserId) {
    return { ok: true, change: { previousPrimaryId: newUserId } };
  }

  // Preferred path: the fixed transfer_primary_admin() SQL function (atomic, and the
  // only path the integrity trigger allows once 20261014_authz_03 is applied).
  // Falls back to the ordered app-level sequence below when the function is not
  // (yet) available in the database.
  if (previous.length === 1) {
    const { error: rpcError } = await admin.rpc('transfer_primary_admin', {
      from_user_id: previous[0],
      to_user_id: newUserId,
      org_id: orgId,
      p_actor: actorId ?? null,
    });
    if (!rpcError) {
      return { ok: true, change: { previousPrimaryId: previous[0] } };
    }
    const missing = rpcError.code === '42883' || rpcError.code === 'PGRST202';
    if (!missing) {
      console.error('[primary-admin] transfer_primary_admin failed:', rpcError);
      return { ok: false, status: 500, error: 'Failed to change primary admin' };
    }
  }

  // 1. clear the old flag(s) (the unique "one primary per org" rule forbids two)
  const toClear = previous.filter((id) => id !== newUserId);
  for (const oldId of toClear) {
    const { error } = await admin
      .from('user_roles')
      .update({ is_primary_admin: false, updated_at: new Date().toISOString() })
      .eq('user_id', oldId)
      .eq('organization_id', orgId);
    if (error) {
      console.error('[primary-admin] clearing old primary failed:', error);
      await restorePrimary(admin, orgId, toClear.filter((id) => id !== oldId));
      return { ok: false, status: 500, error: 'Failed to change primary admin' };
    }
  }

  // 2. set the new flag; on failure put the old primary back
  const { data: set, error: setError } = await admin
    .from('user_roles')
    .update({ is_primary_admin: true, updated_at: new Date().toISOString() })
    .eq('user_id', newUserId)
    .eq('organization_id', orgId)
    .eq('role', 'org_admin')
    .select('user_id');
  if (setError || !set || set.length === 0) {
    console.error('[primary-admin] setting new primary failed:', setError);
    await restorePrimary(admin, orgId, toClear);
    return { ok: false, status: 500, error: 'Failed to change primary admin' };
  }

  // 3. denormalized pointer (best effort)
  const { error: orgError } = await admin
    .from('organizations')
    .update({ primary_admin_id: newUserId, updated_at: new Date().toISOString() })
    .eq('id', orgId);
  if (orgError) console.warn('[primary-admin] could not update organizations.primary_admin_id:', orgError);

  return { ok: true, change: { previousPrimaryId: previous[0] ?? null } };
}

async function restorePrimary(admin: Db, orgId: string, userIds: string[]) {
  for (const id of userIds) {
    const { error } = await admin
      .from('user_roles')
      .update({ is_primary_admin: true })
      .eq('user_id', id)
      .eq('organization_id', orgId);
    if (error) console.error('[primary-admin] CRITICAL: could not restore primary admin', id, error);
  }
}

export interface AddOrgAdminParams {
  actorId: string;
  orgId: string;
  email: string;
  fullName: string;
  password?: string;
  role?: string;
  makePrimary?: boolean;
}

/**
 * Add (or upgrade) an admin of an organization. Caller must already be
 * verified as super_admin.
 */
export async function addOrgAdmin(admin: Db, p: AddOrgAdminParams): Promise<Outcome> {
  const role = p.role ?? 'org_admin';
  const email = (p.email ?? '').trim().toLowerCase();

  if (!['org_admin', 'admin'].includes(role)) return fail(400, 'Invalid role. Must be org_admin or admin');
  if (!email || !isValidEmail(email)) return fail(400, 'A valid email is required');
  if (typeof p.fullName !== 'string' || !p.fullName.trim() || p.fullName.length > 200) {
    return fail(400, 'full_name is required');
  }
  if (p.makePrimary && role !== 'org_admin') {
    return fail(422, 'Only an org_admin can be the primary admin');
  }

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id, name, primary_admin_id')
    .eq('id', p.orgId)
    .maybeSingle();
  if (orgError) {
    console.error('[add-admin] org lookup failed:', orgError);
    return fail(500, 'Failed to add admin');
  }
  if (!org) return fail(404, 'Organization not found');

  let existing;
  try {
    existing = await findAuthUserByEmail(admin, email);
  } catch (err) {
    console.error('[add-admin] user lookup failed:', err);
    return fail(500, 'Failed to add admin');
  }

  let userId: string;
  let isNewUser = false;
  let upgradedFrom: string | null = null;

  if (existing) {
    userId = existing.id;
    const row = await getTargetRoleRow(admin, userId, p.orgId);
    if (row) {
      if (row.role !== 'student') {
        return fail(409, `User already has role '${row.role}' in this organization`);
      }
      upgradedFrom = 'student';
    }
  } else {
    if (!p.password || p.password.length < 8) {
      return fail(400, 'Password (min 8 characters) is required to create a new admin user');
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: p.password,
      email_confirm: true,
      user_metadata: { full_name: p.fullName, organization_id: p.orgId },
    });
    if (createError || !created?.user) {
      console.error('[add-admin] createUser failed:', createError);
      return fail(500, 'Failed to create user');
    }
    userId = created.user.id;
    isNewUser = true;
  }

  const rollbackNewUser = async () => {
    if (!isNewUser) return;
    await admin.from('profiles').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
  };

  if (isNewUser) {
    // No role on the profile: profiles has no role column, the role lives in user_roles
    const { error: profileError } = await admin.from('profiles').upsert(
      { id: userId, email, full_name: p.fullName, organization_id: p.orgId },
      { onConflict: 'id' }
    );
    if (profileError) {
      console.error('[add-admin] profile creation failed:', profileError);
      await rollbackNewUser();
      return fail(500, 'Failed to create admin profile');
    }
  }

  const change = await applyRoleChange(admin, {
    actorId: p.actorId,
    actorRole: 'super_admin',
    orgId: p.orgId,
    targetUserId: userId,
    newRole: role,
  });
  if (!change.ok) {
    await rollbackNewUser();
    const text = await change.response.clone().json().catch(() => ({ error: 'Failed to assign role' }));
    return fail(change.response.status, (text as { error?: string }).error ?? 'Failed to assign role');
  }

  const wantPrimary = (p.makePrimary || !org.primary_admin_id) && role === 'org_admin';
  let isPrimary = false;
  let previousPrimaryId: string | null = null;
  if (wantPrimary) {
    const promoted = await promotePrimaryAdmin(admin, p.orgId, userId, p.actorId);
    if (promoted.ok) {
      isPrimary = true;
      previousPrimaryId = promoted.change.previousPrimaryId;
    } else if (p.makePrimary) {
      // Explicitly requested but failed: undo what we created
      if (isNewUser) {
        await admin.from('user_roles').delete().eq('user_id', userId).eq('organization_id', p.orgId);
        await rollbackNewUser();
      }
      return fail(promoted.status, promoted.error);
    }
  }

  return {
    ok: true,
    status: 201,
    body: {
      user_id: userId,
      email,
      full_name: p.fullName,
      role,
      is_primary_admin: isPrimary,
      previous_primary_admin_id: previousPrimaryId,
      is_new_user: isNewUser,
      upgraded_from: upgradedFrom,
      organization_name: org.name,
    },
  };
}
