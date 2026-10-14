import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError, isUuid, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { addOrgAdmin } from '@/lib/api/utils/orgAdmins';

/**
 * GET /api/v2/admin/super/organizations/[orgId]/admins
 * Get all admins for a specific organization (super admin only)
 */
export const GET = withSuperAdmin<{ orgId: string }>(async (_request, { params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  const db = await createSupabaseAdminClient();

  const { data: org, error: orgError } = await db.from('organizations').select('id').eq('id', orgId).maybeSingle();
  if (orgError) {
    console.error('GET admins: org lookup failed:', orgError);
    return apiError.internal('Failed to fetch admins');
  }
  if (!org) return apiError.notFound('Organization not found');

  const { data: adminRoles, error: adminsError } = await db
    .from('user_roles')
    .select('user_id, role, is_primary_admin, approval_status, created_at')
    .eq('organization_id', orgId)
    .in('role', ['org_admin', 'admin'])
    .order('is_primary_admin', { ascending: false })
    .order('created_at', { ascending: true });
  if (adminsError) {
    console.error('GET admins failed:', adminsError);
    return apiError.internal('Failed to fetch admins');
  }

  type AdminRow = { user_id: string; role: string; is_primary_admin: boolean | null; approval_status: string | null; created_at: string };
  const rows = (adminRoles ?? []) as AdminRow[];
  const ids = rows.map((r) => r.user_id);
  const { data: profiles } = ids.length
    ? await db.from('profiles').select('id, email, full_name').in('id', ids)
    : { data: [] };
  type Profile = { id: string; email?: string; full_name?: string };
  const profileMap = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]));

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.user_id,
      email: profileMap.get(r.user_id)?.email || '',
      full_name: profileMap.get(r.user_id)?.full_name || '',
      role: r.role,
      is_primary_admin: r.is_primary_admin || false,
      approval_status: r.approval_status,
      created_at: r.created_at,
    })),
  });
});

/**
 * POST /api/v2/admin/super/organizations/[orgId]/admins
 * Add a new admin to a specific organization (super admin only)
 */
export const POST = withSuperAdmin<{ orgId: string }>(async (request, { user, params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  let body: { email?: string; full_name?: string; password?: string; role?: string; is_primary_admin?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { email, full_name, password, role = 'org_admin', is_primary_admin = false } = body;

  if (!email || !full_name) {
    return apiError.badRequest('Missing required fields: email, full_name');
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

  await writeAudit(db, {
    actorId: user.id,
    action: 'org_admin_add',
    targetType: 'user_role',
    targetId: String((outcome.body as { user_id: string }).user_id),
    organizationId: orgId,
    details: { role, is_primary_admin: (outcome.body as { is_primary_admin: boolean }).is_primary_admin, email },
  });

  const { user_id, is_primary_admin: primary, upgraded_from } = outcome.body as {
    user_id: string; is_primary_admin: boolean; upgraded_from: string | null;
  };
  return NextResponse.json(
    {
      success: true,
      data: { user_id, email, full_name, role, is_primary_admin: primary, ...(upgraded_from ? { upgraded_from } : {}) },
    },
    { status: 201 }
  );
});
