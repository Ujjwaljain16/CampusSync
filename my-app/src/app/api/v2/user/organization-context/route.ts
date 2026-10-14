/**
 * Organization Context API Endpoint
 *
 * Returns the current user's organization context for frontend validation.
 * Deterministic: the highest-privilege APPROVED role wins (ties: oldest row).
 */

import { NextResponse } from 'next/server';
import { withSession, fetchApprovedRoleRows, pickHighestRow, apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = withSession(async (_request, { user }) => {
  const rows = await fetchApprovedRoleRows(user.id);
  const best = pickHighestRow(rows);

  if (!best) {
    return apiError.forbidden('No approved role found for this account');
  }

  return NextResponse.json({
    userId: user.id,
    organizationId: best.organization_id,
    role: best.role,
    isSuperAdmin: rows.some((r) => r.role === 'super_admin'),
  });
});
