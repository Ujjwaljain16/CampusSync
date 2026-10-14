import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError, isUuid, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { addOrgAdmin } from '@/lib/api/utils/orgAdmins';

/**
 * POST /api/v2/admin/super/organizations/admins
 * Create an org admin for an organization (super admin only).
 * Body: { organizationId, email, name, password }
 */
export const POST = withSuperAdmin(async (request, { user }) => {
  let body: { organizationId?: string; email?: string; name?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { organizationId, email, name, password } = body;

  if (!organizationId || !email || !name) {
    return apiError.badRequest('Missing required fields: organizationId, email, name, password');
  }
  if (!isUuid(organizationId)) return apiError.badRequest('Invalid organizationId');

  const db = await createSupabaseAdminClient();
  const outcome = await addOrgAdmin(db, {
    actorId: user.id,
    orgId: organizationId,
    email,
    fullName: name,
    password,
    role: 'org_admin',
  });

  if (!outcome.ok) {
    // keep the historical 409 for "already has a role"
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  const b = outcome.body as { user_id: string; is_primary_admin: boolean };
  await writeAudit(db, {
    actorId: user.id,
    action: 'org_admin_add',
    targetType: 'user_role',
    targetId: b.user_id,
    organizationId,
    details: { role: 'org_admin', is_primary_admin: b.is_primary_admin, email },
  });

  return NextResponse.json({ admin: { id: b.user_id, email, name } }, { status: 201 });
});
