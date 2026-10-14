/**
 * Audit trail for reads of student PII by recruiters/staff.
 *
 * Uses the column set shared by the majority of existing `audit_logs` inserts:
 * user_id, organization_id, action, target_id, details, created_at.
 * Failures are logged but never fail the request.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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
  details?: Record<string, unknown>;
}

export async function recordPiiRead(client: SupabaseClient, entry: PiiAuditEntry): Promise<void> {
  try {
    const { error } = await client.from('audit_logs').insert({
      user_id: entry.userId,
      organization_id: entry.organizationId,
      action: entry.action,
      target_id: entry.targetId ?? null,
      details: entry.details ?? {},
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error(`[audit] failed to record ${entry.action}`, error);
    }
  } catch (err) {
    console.error(`[audit] failed to record ${entry.action}`, err);
  }
}
