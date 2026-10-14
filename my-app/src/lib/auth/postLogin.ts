/**
 * Where to send a user right after signing in, and what the login page needs to know about them.
 * Pure (no I/O); used by POST /api/auth/login.
 *
 * A user may hold several user_roles rows. Like /api/auth/me, the highest-privilege APPROVED row wins;
 * only when nothing is approved do we look at the highest remaining row, so the user lands on the
 * "awaiting approval" page instead of a dashboard they cannot use.
 */
import { isApprovedRow, isKnownRole, pickHighestRow, type RoleRow } from '@/lib/api/utils/roles';

export interface PostLoginInfo {
  role: string | null;
  organization_id: string | null;
  approval_status: string | null;
  redirectTo: string;
}

const DASHBOARD_BY_ROLE: Record<string, string> = {
  student: '/student/dashboard',
  faculty: '/faculty/dashboard',
  recruiter: '/recruiter/dashboard',
};

const WAITING_BY_ROLE: Record<string, string> = {
  faculty: '/faculty/waiting',
  recruiter: '/recruiter/waiting',
};

export function resolvePostLogin(rows: readonly RoleRow[] | null | undefined): PostLoginInfo {
  const all = (rows ?? []).filter((r) => r && typeof r.role === 'string');
  const known = all.filter((r) => isKnownRole(r.role));
  const chosen = pickHighestRow(known.filter((r) => isApprovedRow(r))) ?? pickHighestRow(known) ?? all[0];

  if (!chosen) {
    return { role: null, organization_id: null, approval_status: null, redirectTo: '/dashboard' };
  }

  const info = {
    role: chosen.role,
    organization_id: chosen.organization_id ?? null,
    approval_status: chosen.approval_status ?? null,
  };

  if (!isApprovedRow(chosen)) {
    return { ...info, redirectTo: WAITING_BY_ROLE[chosen.role] ?? '/dashboard' };
  }
  return { ...info, redirectTo: DASHBOARD_BY_ROLE[chosen.role] ?? '/dashboard' };
}
