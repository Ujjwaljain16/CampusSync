/**
 * Authorization + state-machine helpers shared by the /api/documents routes.
 *
 * Rationale: `getOrganizationContext().role` and `getServerUserWithRole().role`
 * ignore `user_roles.approval_status`, so a pending/denied "faculty" row would
 * otherwise be treated as a reviewer. Every reviewer action must therefore
 * re-check an APPROVED reviewer row in the document's own organization.
 */

import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const REVIEWER_ROLES = ['faculty', 'admin', 'org_admin', 'super_admin'] as const;
/** Roles allowed to un-revoke a document */
export const ADMIN_ROLES = ['admin', 'org_admin', 'super_admin'] as const;

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'revoked';
export const DOCUMENT_STATUSES: readonly DocumentStatus[] = ['pending', 'verified', 'rejected', 'revoked'];

/** Statuses that owners may edit */
export const OWNER_EDITABLE_STATUSES: readonly string[] = ['pending', 'rejected'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface ApprovedReviewer {
  role: (typeof REVIEWER_ROLES)[number];
  organizationId: string | null;
}

/**
 * Returns the caller's APPROVED reviewer row for `orgId`, or null.
 * A super_admin row with a NULL organization_id counts for every organization.
 * Uses the user-session client with explicit filters (no `.single()`).
 */
export async function requireApprovedReviewer(
  user: Pick<User, 'id'>,
  orgId: string,
  client?: SupabaseLike
): Promise<ApprovedReviewer | null> {
  if (!orgId || !UUID_RE.test(orgId)) return null;
  const supabase = client ?? (await createSupabaseServerClient());

  const { data, error } = await supabase
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .eq('approval_status', 'approved')
    .in('role', [...REVIEWER_ROLES])
    .or(`organization_id.eq.${orgId},and(role.eq.super_admin,organization_id.is.null)`);

  if (error || !Array.isArray(data) || data.length === 0) return null;

  type Row = { role: ApprovedReviewer['role']; organization_id: string | null };
  const rows = (data as Row[]).filter(
    (r) =>
      REVIEWER_ROLES.includes(r.role) &&
      (r.organization_id === orgId || (r.role === 'super_admin' && r.organization_id === null))
  );
  if (rows.length === 0) return null;

  // Prefer the most privileged row
  const rank = (r: Row) => ['super_admin', 'org_admin', 'admin', 'faculty'].indexOf(r.role);
  rows.sort((a, b) => rank(a) - rank(b));
  return { role: rows[0].role, organizationId: rows[0].organization_id };
}

export function isAdminReviewer(reviewer: ApprovedReviewer | null): boolean {
  return !!reviewer && (ADMIN_ROLES as readonly string[]).includes(reviewer.role);
}

/**
 * Allowed reviewer transitions. `revoked -> pending` additionally needs an admin role.
 */
const TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  pending: ['verified', 'rejected'],
  verified: ['revoked', 'pending'],
  rejected: ['pending'],
  revoked: ['pending'],
};

export function canTransition(from: string, to: string, reviewerRole: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, from)) return false;
  if (!TRANSITIONS[from as DocumentStatus].includes(to as DocumentStatus)) return false;
  if (from === 'revoked') return (ADMIN_ROLES as readonly string[]).includes(reviewerRole);
  return true;
}

/**
 * Normalise a confidence value to 0..1. Accepts 0..1 (as is) and values above 1
 * up to 100 (percentage, divided by 100). Returns null for anything else.
 */
export function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const n = value > 1 ? value / 100 : value;
  return Math.round(n * 10000) / 10000;
}

/**
 * Write an audit row; failures are logged, never thrown.
 * Column set follows the majority of audit_logs inserts in the codebase.
 */
export async function writeAuditLog(
  client: SupabaseLike,
  entry: {
    actorId: string;
    organizationId: string | null;
    action: string;
    targetId: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await client.from('audit_logs').insert({
      actor_id: entry.actorId,
      organization_id: entry.organizationId,
      action: entry.action,
      target_id: entry.targetId,
      details: entry.details,
      created_at: new Date().toISOString(),
    });
    if (error) console.error('[documents] audit log insert failed:', error.message ?? error);
  } catch (err) {
    console.error('[documents] audit log insert threw:', err);
  }
}

/** Merge new evidence over existing verification_details without wiping it */
export function mergeDetails(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** True when JSON.stringify(v) fits in `maxBytes` (characters used as a proxy) */
export function withinJsonSize(v: unknown, maxBytes: number): boolean {
  try {
    const s = JSON.stringify(v);
    return s === undefined || s.length <= maxBytes;
  } catch {
    return false;
  }
}

export interface DocumentHead {
  id: string;
  student_id: string | null;
  user_id?: string | null;
  organization_id: string;
  verification_status: string;
}

export function isOwner(doc: Pick<DocumentHead, 'student_id' | 'user_id'>, userId: string): boolean {
  return doc.student_id === userId || doc.user_id === userId;
}

/** Load a document's authorization-relevant columns (RLS applies: user-session client) */
export async function loadDocumentHead(
  client: SupabaseLike,
  id: string
): Promise<DocumentHead | null> {
  const { data, error } = await client
    .from('documents')
    .select('id, student_id, user_id, organization_id, verification_status')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as DocumentHead;
}

/** Upsert document_metadata merging verification_details into the existing row */
export async function upsertMetadataMerged(
  client: SupabaseLike,
  documentId: string,
  fields: {
    ai_confidence_score?: number | null;
    extracted_fields?: unknown;
    detailsPatch?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { data: existing } = await client
    .from('document_metadata')
    .select('verification_details')
    .eq('document_id', documentId)
    .maybeSingle();

  const row: Record<string, unknown> = {
    document_id: documentId,
    updated_at: new Date().toISOString(),
  };
  if (fields.ai_confidence_score !== undefined) row.ai_confidence_score = fields.ai_confidence_score;
  if (fields.extracted_fields !== undefined) row.extracted_fields = fields.extracted_fields;
  if (fields.detailsPatch) {
    row.verification_details = mergeDetails(existing?.verification_details, fields.detailsPatch);
  }

  const { data, error } = await client
    .from('document_metadata')
    .upsert(row, { onConflict: 'document_id' })
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}
