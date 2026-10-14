/**
 * Audit trail for reads of student PII by recruiters/staff.
 *
 * Writes the canonical audit_logs shape (actor_id, organization_id, action,
 * target_type, target_id, details, created_at) with the service-role client;
 * the `client` argument is accepted for call-site compatibility only.
 * Failures are logged but never fail the request.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

export type PiiAuditAction =
  | 'recruiter_search_students'
  | 'recruiter_view_student'
  | 'recruiter_export_students'
  | 'portfolio_pdf_export';

export interface PiiAuditEntry {
  userId: string;
  organizationId: string | null;
  action: PiiAuditAction;
  targetId?: string | null;
  /** What the target is; defaults to 'student'. */
  targetType?: string;
  details?: Record<string, unknown>;
}

export async function recordPiiRead(
  // Kept for signature compatibility; the write always goes through the admin client.
  _client: SupabaseClient | null | undefined,
  entry: PiiAuditEntry
): Promise<void> {
  try {
    const admin = await createSupabaseAdminClient();
    const targetType = entry.targetType ?? 'student';
    const { error } = await admin.from('audit_logs').insert({
      actor_id: entry.userId,
      organization_id: entry.organizationId,
      action: entry.action,
      target_type: targetType,
      target_id: entry.targetId == null ? null : String(entry.targetId),
      details: { ...(entry.details ?? {}), target_type: targetType },
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error(`[audit] failed to record ${entry.action}`, error);
    }
  } catch (err) {
    console.error(`[audit] failed to record ${entry.action}`, err);
  }
}
