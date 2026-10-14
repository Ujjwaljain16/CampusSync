import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withSession, apiError, isUuid } from '@/lib/api';
import { createRecruiterAccessRequest } from '@/lib/api/utils/recruiterAccess';

/**
 * Thin alias of /api/recruiter/access-requests.
 * Both create / read the SAME per-organization `user_roles` recruiter rows,
 * which is what every recruiter data route and the org admins' approve /
 * revoke endpoints use. (The legacy recruiter_org_access table is not used.)
 */

/**
 * POST /api/recruiter/request-access
 * Body: { organization_id, notes? }
 */
export const POST = withSession(async (request, { user }) => {
  let body: { organization_id?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const organization_id = body.organization_id;
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000) : null;

  if (!organization_id) return apiError.badRequest('organization_id is required');
  if (typeof organization_id !== 'string' || !isUuid(organization_id)) {
    return apiError.validation('Invalid organization_id');
  }

  const admin = await createSupabaseAdminClient();
  const outcome = await createRecruiterAccessRequest(admin, user.id, organization_id, notes);
  return NextResponse.json(outcome.body, { status: outcome.status });
});

/**
 * GET /api/recruiter/request-access
 * The logged-in recruiter's access requests (same shape as before).
 */
export const GET = withSession(async (_request, { user }) => {
  const admin = await createSupabaseAdminClient();

  const { data: rows, error } = await admin
    .from('user_roles')
    .select('organization_id, approval_status, created_at, approved_at, approval_notes')
    .eq('user_id', user.id)
    .eq('role', 'recruiter')
    .not('organization_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET_REQUESTS] Error:', error);
    return apiError.internal('Failed to fetch requests');
  }

  const list = (rows ?? []) as Array<{
    organization_id: string;
    approval_status: string;
    created_at: string;
    approved_at: string | null;
    approval_notes: string | null;
  }>;
  const orgIds = list.map((r) => r.organization_id);
  const { data: orgs } = orgIds.length
    ? await admin.from('organizations').select('id, name, slug, type').in('id', orgIds)
    : { data: [] };
  type Org = { id: string; name: string; slug: string; type: string };
  const orgMap = new Map(((orgs ?? []) as Org[]).map((o) => [o.id, o]));

  const requests = list.map((r) => ({
    id: r.organization_id,
    organization_id: r.organization_id,
    status: r.approval_status,
    requested_at: r.created_at,
    reviewed_at: r.approved_at,
    notes: r.approval_notes,
    organization: orgMap.get(r.organization_id) ?? null,
  }));

  return NextResponse.json({ requests });
});
