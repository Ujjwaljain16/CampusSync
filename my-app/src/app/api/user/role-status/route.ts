import { withAuth, success, fetchApprovedRoleRows, pickHighestRow } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withAuth(async (_req, { user }) => {
  // Deterministic: highest-privilege APPROVED role (a user may hold several rows)
  const approved = await fetchApprovedRoleRows(user.id);
  const best = pickHighestRow(approved);

  if (best) {
    return success({
      role: best.role,
      status: 'approved',
      userId: user.id
    });
  }

  // No approved role: distinguish "denied" from "still pending / none yet"
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from('user_roles')
    .select('role, approval_status')
    .eq('user_id', user.id);
  const denied = (rows ?? []).length > 0 && (rows ?? []).every((r: { approval_status: string }) => r.approval_status === 'denied');

  return success({
    role: null,
    status: denied ? 'denied' : 'pending',
    message: denied ? 'Role request was denied' : 'Role request pending approval'
  });
});
