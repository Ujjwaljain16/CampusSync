/**
 * Single audit-log writer.
 *
 * Uses the audit_logs column set used by the majority of existing inserts
 * (certificates/*, role-requests/*): actor_id, organization_id, action,
 * target_id, details, created_at. The target type is stored inside `details`
 * (there is no target_type column in the shared schema).
 *
 * Audit failures are logged but never thrown: a failed audit write must not
 * turn a completed mutation into a 500 (the caller can inspect the boolean).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  organizationId?: string | null;
  details?: Record<string, unknown>;
}

export async function writeAudit(
  client: Pick<SupabaseClient, 'from'>,
  entry: AuditEntry
): Promise<boolean> {
  try {
    const { error } = await client.from('audit_logs').insert({
      actor_id: entry.actorId,
      organization_id: entry.organizationId ?? null,
      action: entry.action,
      target_id: entry.targetId ?? null,
      details: { ...(entry.details ?? {}), target_type: entry.targetType },
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error(`[audit] Failed to write "${entry.action}" audit row:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[audit] Failed to write "${entry.action}" audit row:`, err);
    return false;
  }
}
