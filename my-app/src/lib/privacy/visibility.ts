/**
 * Per-student privacy settings.
 *
 * Two opt-in flags live on `profiles` (see
 * supabase/migrations/20261014_privacy_profile_visibility.sql):
 *
 *   public_portfolio_enabled  - unauthenticated visitors may open /public/portfolio/<id>
 *   recruiter_share_contact   - approved recruiters may see the student's contact
 *                               details (email, phone, linkedin, github, portfolio
 *                               link) AND GPA. GPA is grouped with contact details
 *                               because it is the most sensitive academic datum a
 *                               student can otherwise not control.
 *
 * Both default to FALSE. The columns may not exist yet in the live database, so
 * every read tolerates a missing-column error (Postgres 42703 / PostgREST
 * PGRST204) and falls back to the secure default - it never throws.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface StudentVisibility {
  publicPortfolioEnabled: boolean;
  recruiterShareContact: boolean;
}

export const SECURE_VISIBILITY_DEFAULTS: Readonly<StudentVisibility> = Object.freeze({
  publicPortfolioEnabled: false,
  recruiterShareContact: false,
});

export const VISIBILITY_COLUMNS = {
  publicPortfolioEnabled: 'public_portfolio_enabled',
  recruiterShareContact: 'recruiter_share_contact',
} as const;

type ErrorLike = { code?: string; message?: string; details?: string } | null | undefined;

/** True when the error means "that column does not exist (yet)". */
export function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as NonNullable<ErrorLike>;
  if (e.code === '42703' || e.code === 'PGRST204') return true;
  const text = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  return (
    (text.includes('column') && text.includes('does not exist')) ||
    (text.includes('could not find') && text.includes('column'))
  );
}

let warnedMissingColumns = false;

/** Test hook: lets unit tests assert the "log once" behaviour. */
export function resetVisibilityWarningForTests(): void {
  warnedMissingColumns = false;
}

function warnMissingColumnsOnce(err: unknown): void {
  if (warnedMissingColumns) return;
  warnedMissingColumns = true;
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message) : '';
  console.warn(
    '[privacy] profiles.public_portfolio_enabled / recruiter_share_contact are missing; ' +
      'treating every student as private (secure default). Apply the 20261014_privacy_profile_visibility migration.',
    message
  );
}

function defaultsFor(ids: string[]): Map<string, StudentVisibility> {
  return new Map(ids.map((id) => [id, { ...SECURE_VISIBILITY_DEFAULTS }]));
}

type VisibilityRow = { id: string; public_portfolio_enabled?: unknown; recruiter_share_contact?: unknown };

function mergeRows(map: Map<string, StudentVisibility>, rows: VisibilityRow[] | null | undefined, which: Array<keyof StudentVisibility>) {
  for (const row of rows ?? []) {
    const current = map.get(row.id);
    if (!current) continue;
    if (which.includes('publicPortfolioEnabled')) current.publicPortfolioEnabled = row.public_portfolio_enabled === true;
    if (which.includes('recruiterShareContact')) current.recruiterShareContact = row.recruiter_share_contact === true;
  }
}

/**
 * Read the visibility flags for a set of students. Always resolves with an
 * entry for every requested id; missing columns / errors yield the secure
 * defaults. Only a literal `true` in the database enables a flag.
 */
export async function getVisibilityForStudents(
  client: SupabaseClient,
  studentIds: string[]
): Promise<Map<string, StudentVisibility>> {
  const ids = Array.from(new Set(studentIds));
  const result = defaultsFor(ids);
  if (ids.length === 0) return result;

  try {
    const { data, error } = await client
      .from('profiles')
      .select('id, public_portfolio_enabled, recruiter_share_contact')
      .in('id', ids);

    if (!error) {
      mergeRows(result, data as VisibilityRow[] | null, ['publicPortfolioEnabled', 'recruiterShareContact']);
      return result;
    }

    if (!isMissingColumnError(error)) {
      console.error('[privacy] visibility lookup failed; using secure defaults', error);
      return result;
    }

    // One of the two columns is missing (partial migration?). Probe each alone
    // so the one that exists is still honoured.
    warnMissingColumnsOnce(error);
    for (const [key, column] of Object.entries(VISIBILITY_COLUMNS) as Array<[keyof StudentVisibility, string]>) {
      const single = await client.from('profiles').select(`id, ${column}`).in('id', ids);
      if (!single.error) mergeRows(result, single.data as unknown as VisibilityRow[] | null, [key]);
    }
    return result;
  } catch (err) {
    if (isMissingColumnError(err)) warnMissingColumnsOnce(err);
    else console.error('[privacy] visibility lookup threw; using secure defaults', err);
    return result;
  }
}

/** Convenience wrapper for a single student. */
export async function getStudentVisibility(client: SupabaseClient, studentId: string): Promise<StudentVisibility> {
  const map = await getVisibilityForStudents(client, [studentId]);
  return map.get(studentId) ?? { ...SECURE_VISIBILITY_DEFAULTS };
}
