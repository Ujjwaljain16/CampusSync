/**
 * Single audit-log writer.
 *
 * Writes the canonical audit_logs shape:
 *   actor_id, organization_id, action, target_type, target_id (text), details, created_at
 *
 * Always uses the service-role client: signed-in users are not allowed to insert
 * audit rows (RLS), so the `client` argument is accepted only for call-site
 * compatibility and is never used to write. The target type is also copied into
 * `details.target_type` while older readers still look there.
 *
 * Audit failures are logged but never thrown: a failed audit write must not
 * turn a completed mutation into a 500 (the caller can inspect the boolean).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

export interface AuditEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  organizationId?: string | null;
  details?: Record<string, unknown>;
}

export async function writeAudit(
  // Kept for signature compatibility; the write always goes through the admin client.
  _client: Pick<SupabaseClient, 'from'> | null | undefined,
  entry: AuditEntry
): Promise<boolean> {
  try {
    const admin = await createSupabaseAdminClient();
    const { error } = await admin.from('audit_logs').insert({
      actor_id: entry.actorId,
      organization_id: entry.organizationId ?? null,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId == null ? null : String(entry.targetId),
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
