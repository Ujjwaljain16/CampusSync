import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import {
  withRole,
  success,
  apiError,
  parseAndValidateBody,
  resolveAdminOrg,
  assertSuperAdmin,
  isUuid,
  isKnownRole,
  writeAudit,
} from '@/lib/api';
import { applyRoleChange } from '@/lib/api/utils/roleMutations';

type UserRoleRow = {
  user_id: string;
  role?: string;
  organization_id?: string | null;
  approval_status?: string | null;
  is_super_admin?: boolean;
  is_primary_admin?: boolean;
  created_at?: string;
  updated_at?: string;
  assigned_by?: string;
};

type ProfileRow = { id: string; full_name?: string | null; email?: string | null; created_at?: string | null };

const ADMIN_ROLES = ['admin', 'org_admin', 'super_admin'];
const MAX_PAGE = 500;

/** Organization the caller asks to act on: header first, then query string. */
function requestedOrgFrom(request: NextRequest): string | null {
  return request.headers.get('X-Organization-ID') || new URL(request.url).searchParams.get('organization_id');
}

/**
 * GET /api/admin/roles
 * List users and their roles. Admin-class only, scoped to ONE organization the
 * caller administers. A super_admin without an explicit organization sees all.
 */
export const GET = withRole(ADMIN_ROLES, async (request, { user }) => {
  const adminSupabase = await createSupabaseAdminClient();

  const scope = await resolveAdminOrg(user, requestedOrgFrom(request), 'admin');

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10) || 200, 1), MAX_PAGE);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  let query = adminSupabase
    .from('user_roles')
    .select('user_id, role, organization_id, approval_status, is_super_admin, is_primary_admin, created_at, updated_at, assigned_by')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!(scope.isSuperAdmin && !scope.requested)) {
    query = query.eq('organization_id', scope.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin/roles GET] query failed:', error);
    return apiError.internal('Failed to load roles');
  }
  const users = (data ?? []) as UserRoleRow[];

  const userIds = users.map((u) => u.user_id);
  const { data: profiles } = userIds.length
    ? await adminSupabase.from('profiles').select('id, full_name, email, created_at').in('id', userIds)
    : { data: [] as ProfileRow[] };
  const profileMap = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  // Emails come from profiles; only fall back to Auth for the few rows without one
  const missing = userIds.filter((id) => !profileMap.get(id)?.email).slice(0, 50);
  const authMap = new Map<string, { email?: string; created_at?: string; name?: string }>();
  await Promise.all(
    missing.map(async (id) => {
      const { data: au } = await adminSupabase.auth.admin.getUserById(id);
      if (au?.user) {
        const meta = au.user.user_metadata as { full_name?: string; name?: string } | undefined;
        authMap.set(id, { email: au.user.email, created_at: au.user.created_at, name: meta?.full_name || meta?.name });
      }
    })
  );

  const result = users.map((userRole) => {
    const profile = profileMap.get(userRole.user_id);
    const au = authMap.get(userRole.user_id);
    const email = profile?.email || au?.email;
    return {
      ...userRole,
      auth_users: email
        ? {
            email,
            created_at: au?.created_at ?? profile?.created_at ?? userRole.created_at,
            full_name: profile?.full_name || au?.name || null,
          }
        : null,
    };
  });

  return success(result);
});

/**
 * POST /api/admin/roles
 * Assign or update a user's role inside ONE organization.
 * The caller must outrank both the target's current and the new role.
 */
export const POST = withRole(ADMIN_ROLES, async (request, { user }) => {
  const { data: body, error: validationError } = await parseAndValidateBody<{
    user_id: string;
    role: string;
    organization_id?: string | null;
  }>(request, ['user_id', 'role']);
  if (validationError) return validationError;

  if (!isUuid(body.user_id)) return apiError.validation('Invalid user_id');
  if (!isKnownRole(body.role)) return apiError.validation('Invalid role');

  const adminSupabase = await createSupabaseAdminClient();

  // super_admin is a platform-level (NULL organization) role
  const platformLevel = body.role === 'super_admin';
  const requestedOrg = body.organization_id || requestedOrgFrom(request);
  if (platformLevel && requestedOrg) {
    return apiError.validation('super_admin is a platform-level role and takes no organization_id');
  }

  let actorRole = 'super_admin';
  let orgId: string | null = null;
  if (platformLevel) {
    await assertSuperAdmin(user);
  } else {
    const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
    actorRole = scope.role;
    orgId = scope.organizationId;
  }

  const result = await applyRoleChange(adminSupabase, {
    actorId: user.id,
    actorRole,
    orgId,
    targetUserId: body.user_id,
    newRole: body.role,
  });
  if (!result.ok) return result.response;

  await writeAudit(adminSupabase, {
    actorId: user.id,
    action: 'role_assign',
    targetType: 'user_role',
    targetId: body.user_id,
    organizationId: orgId,
    details: { old_role: result.oldRole, new_role: body.role },
  });

  return success({ user_id: body.user_id, role: body.role, organization_id: orgId }, 'Role updated successfully');
});

/**
 * DELETE /api/admin/roles?user_id=...&organization_id=...
 * Remove a user's role in ONE organization.
 */
export const DELETE = withRole(ADMIN_ROLES, async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');

  if (!userId) return apiError.badRequest('Missing user_id parameter');
  if (!isUuid(userId)) return apiError.validation('Invalid user_id');

  const scope = await resolveAdminOrg(user, requestedOrgFrom(req), 'admin');
  const adminSupabase = await createSupabaseAdminClient();

  const result = await applyRoleChange(adminSupabase, {
    actorId: user.id,
    actorRole: scope.role,
    orgId: scope.organizationId,
    targetUserId: userId,
    newRole: null,
  });
  if (!result.ok) return result.response;

  await writeAudit(adminSupabase, {
    actorId: user.id,
    action: 'role_remove',
    targetType: 'user_role',
    targetId: userId,
    organizationId: scope.organizationId,
    details: { old_role: result.oldRole },
  });

  return success({ user_id: userId, organization_id: scope.organizationId, message: 'Role removed' });
});
