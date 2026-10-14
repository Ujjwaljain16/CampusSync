import { NextRequest } from 'next/server';
import { withRole, success, apiError, resolveAdminOrg } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

const STATUSES = ['pending', 'approved', 'rejected'];

type ProfileRow = { id: string; full_name?: string | null; email?: string | null };

/**
 * GET /api/admin/role-requests
 * Role requests of ONE organization the caller administers
 * (a super_admin without an explicit organization sees all organizations).
 */
export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  if (!STATUSES.includes(status)) return apiError.validation('Invalid status');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  const requestedOrg = req.headers.get('X-Organization-ID') || searchParams.get('organization_id');
  const scope = await resolveAdminOrg(user, requestedOrg, 'admin');
  const adminSupabase = await createSupabaseAdminClient();

  let query = adminSupabase
    .from('role_requests')
    .select('id, user_id, requested_role, metadata, status, reviewed_by, reviewed_at, created_at, organization_id')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!(scope.isSuperAdmin && !scope.requested)) {
    query = query.eq('organization_id', scope.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin/role-requests] query failed:', error);
    return apiError.internal('Failed to load role requests');
  }

  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.map((r: { user_id: string }) => r.user_id)));
  const people = new Map<string, { email?: string | null; full_name?: string | null }>();

  if (userIds.length > 0) {
    const { data: profs } = await adminSupabase.from('profiles').select('id, full_name, email').in('id', userIds);
    for (const p of (profs ?? []) as ProfileRow[]) people.set(p.id, { email: p.email, full_name: p.full_name });

    // Fall back to Auth for requesters without a profile e-mail (bounded, no full listUsers scan)
    const missing = userIds.filter((id) => !people.get(id)?.email).slice(0, 50);
    await Promise.all(
      missing.map(async (id) => {
        const { data: au } = await adminSupabase.auth.admin.getUserById(id);
        if (au?.user) {
          const meta = au.user.user_metadata as { full_name?: string; name?: string } | undefined;
          people.set(id, {
            email: au.user.email,
            full_name: people.get(id)?.full_name || meta?.full_name || meta?.name,
          });
        }
      })
    );
  }

  const enriched = rows.map((r: { user_id: string }) => {
    const p = people.get(r.user_id);
    return {
      ...r,
      requester_name: p?.full_name || p?.email?.split('@')[0] || 'Unknown User',
      requester_email: p?.email || 'Unknown',
    };
  });

  return success({ data: enriched, pagination: { limit, offset } });
});
