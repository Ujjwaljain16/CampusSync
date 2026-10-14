import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, apiError, isValidUUID } from '@/lib/api';
import {
  applyCertificateTransition,
  normalizeReviewStatus,
  resolveActor,
} from '@/lib/services/certificateService';

const MAX_BATCH = 100;

interface BatchApproveBody {
  certificateIds?: unknown;
  /** 'verified' | 'rejected' (aliases: 'approved', 'approve', 'reject'). */
  status?: unknown;
  /** Dashboard payload: 'approve' | 'reject'. */
  action?: unknown;
  reason?: unknown;
}

export const POST = withRole(['faculty', 'admin', 'org_admin', 'super_admin'], async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as BatchApproveBody | null;
  if (!body || typeof body !== 'object') {
    throw apiError.badRequest('Invalid JSON body');
  }

  const rawIds = body.certificateIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw apiError.validation('certificateIds must be a non-empty array');
  }
  if (rawIds.length > MAX_BATCH) {
    throw apiError.validation(`At most ${MAX_BATCH} certificates can be processed per request`);
  }
  if (!rawIds.every((id): id is string => typeof id === 'string' && isValidUUID(id))) {
    throw apiError.validation('certificateIds must all be valid UUIDs');
  }
  const ids = Array.from(new Set(rawIds));

  const target = normalizeReviewStatus(body.status ?? body.action);
  if (!target) {
    throw apiError.validation('status (or action) must be one of: verified, approved, approve, rejected, reject');
  }
  const reason = typeof body.reason === 'string' && body.reason.length > 0 ? body.reason : undefined;

  const supabase = await createSupabaseServerClient();
  const actor = await resolveActor(supabase, user.id);

  // Each id goes through exactly the same state machine as a single approval.
  const results: Array<{ id: string; ok: boolean; status?: string; error?: string }> = [];
  for (const id of ids) {
    const outcome = await applyCertificateTransition(supabase, {
      certificateId: id,
      action: target === 'verified' ? 'approve' : 'reject',
      actor,
      notes: reason,
      source: 'batch',
    });
    results.push(
      outcome.ok ? { id, ok: true, status: outcome.to } : { id, ok: false, error: outcome.error }
    );
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.length - succeeded;
  const message =
    failed === 0
      ? `Successfully processed ${succeeded} certificates`
      : `Processed ${succeeded} of ${results.length} certificates; ${failed} failed`;

  // 200 when everything worked, 207 (multi-status) when at least one id failed.
  return NextResponse.json(
    { data: { status: target, total: results.length, succeeded, failed, results }, message },
    { status: failed === 0 ? 200 : 207 }
  );
});
