import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError, isUuid, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { addOrgAdmin } from '@/lib/api/utils/orgAdmins';

/**
 * POST /api/v2/admin/super/organizations/[orgId]/admins/add
 * Add a new admin to an existing organization (super admin only)
 *
 * Can either:
 * 1. Create a new user and assign as admin (password required)
 * 2. Assign an existing user as admin
 * The first admin of an organization becomes its primary admin.
 */
export const POST = withSuperAdmin<{ orgId: string }>(async (request, { user, params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  let body: { email?: string; password?: string; full_name?: string; role?: string; is_primary_admin?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { email, password, full_name, role = 'org_admin', is_primary_admin = false } = body;

  if (!email || !full_name) {
    return NextResponse.json(
      { error: 'Missing required fields', details: 'email and full_name are required' },
      { status: 400 }
    );
  }

  const db = await createSupabaseAdminClient();
  const outcome = await addOrgAdmin(db, {
    actorId: user.id,
    orgId,
    email,
    fullName: full_name,
    password,
    role,
    makePrimary: is_primary_admin === true,
  });

  if (!outcome.ok) return NextResponse.json(outcome.body, { status: outcome.status });

  const b = outcome.body as {
    user_id: string; is_primary_admin: boolean; is_new_user: boolean; organization_name: string;
  };

  await writeAudit(db, {
    actorId: user.id,
    action: 'admin_added_to_organization',
    targetType: 'user_role',
    targetId: b.user_id,
    organizationId: orgId,
    details: {
      organization_name: b.organization_name,
      admin_email: email,
      admin_role: role,
      is_primary_admin: b.is_primary_admin,
      is_new_user: b.is_new_user,
    },
  });

  return NextResponse.json(
    {
      success: true,
      admin: { id: b.user_id, email, full_name, role, is_primary_admin: b.is_primary_admin },
    },
    { status: 201 }
  );
});
