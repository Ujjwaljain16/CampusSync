import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Analytics read model. Everything is derived from the `certificates` table:
 * `confidence_score` (0..1), `auto_approved`, `verification_method` and the jsonb
 * `verification_details` (keys: qr_verification.verified, logo_match.score,
 * template_match.score). Nothing here reads any other table.
 */
export interface AnalyticsCertificate {
  id: string;
  verification_status: string | null;
  created_at: string;
  institution: string | null;
  confidence_score: number | string | null;
  auto_approved: boolean | null;
  verification_method: string | null;
  verification_details: Record<string, unknown> | null;
}

const COLUMNS =
  'id, verification_status, created_at, institution, confidence_score, auto_approved, verification_method, verification_details';

const PAGE_SIZE = 1000; // PostgREST's default max_rows: one un-paged query would silently truncate
const MAX_PAGES = 50;

export class AnalyticsQueryError extends Error {}

/**
 * Loads the certificates the analytics are computed from. `orgIds === null` means
 * every organization (super admin without a selected organization). Throws
 * AnalyticsQueryError when the query fails so the route can answer with an error
 * instead of an empty success.
 */
export async function loadAnalyticsCertificates(
  supabase: SupabaseClient,
  opts: { orgIds: string[] | null; since?: Date }
): Promise<AnalyticsCertificate[]> {
  const rows: AnalyticsCertificate[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = supabase.from('certificates').select(COLUMNS);
    if (opts.orgIds) q = q.in('organization_id', opts.orgIds);
    if (opts.since) q = q.gte('created_at', opts.since.toISOString());
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new AnalyticsQueryError(error.message ?? 'certificates query failed');
    const batch = (data ?? []) as AnalyticsCertificate[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

type Json = Record<string, unknown> | null | undefined;

function finite(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export type DetectedMethod = 'qr_verified' | 'logo_match' | 'template_match';

/**
 * Which automated check backs this certificate, if any. The recorded
 * `verification_method` wins; otherwise the stored details are inspected with the
 * thresholds the dashboard has always used (logo > 0.8, template > 0.6).
 */
export function detectMethod(method: string | null | undefined, details: Json): DetectedMethod | null {
  if (method === 'qr_verification') return 'qr_verified';
  if (method === 'logo_match') return 'logo_match';
  if (method === 'template_match') return 'template_match';
  const d = details ?? {};
  if ((d.qr_verification as Record<string, unknown> | undefined)?.verified === true) return 'qr_verified';
  const logo = finite((d.logo_match as Record<string, unknown> | undefined)?.score);
  if (logo !== null && logo > 0.8) return 'logo_match';
  const tpl = finite((d.template_match as Record<string, unknown> | undefined)?.score);
  if (tpl !== null && tpl > 0.6) return 'template_match';
  return null;
}

/** The certificate's confidence in 0..1, or null when none was recorded. */
export function scoreOf(c: { confidence_score: number | string | null }): number | null {
  return finite(c.confidence_score);
}

export function dayKey(iso: string): string {
  return new Date(iso).toISOString().split('T')[0];
}

export function mean(values: number[]): number | null {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
}
