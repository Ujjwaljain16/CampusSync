/**
 * Recruiter student search.
 *
 * Profiles are scanned in DB-paginated windows (`range`) restricted to the
 * recruiter's organisations - we never load every profile id of an org. Each
 * window is then checked for (a) approved student role in those orgs,
 * (b) privacy flags and (c) verified certificates, and matching students are
 * collected until the requested page (plus one look-ahead row) is filled or a
 * scan budget is spent.
 *
 * Only the profile `.or()` filter interpolates user input, always through
 * `sanitizeFilterTerm`. Certificate filters are evaluated in JS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeFilterTerm } from './sanitize';
import { getVisibilityForStudents } from './visibility';
import { getApprovedStudentOrgs } from './recruiterAccess';
import { buildRecruiterStudentView, type RawCertificateRow, type RecruiterStudentView } from './studentView';

export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_DEFAULT_LIMIT = 20;
const WINDOW_SIZE = 50;
const MAX_WINDOWS = 20; // scans at most 1000 profiles per request
const MAX_CERT_ROWS_PER_WINDOW = 1000;

export interface StudentSearchCriteria {
  /** Free text matched against name / major / university. Sanitised by the caller or here. */
  q?: string;
  institutions?: string[];
  graduationYear?: number | null;
  /** Only applied to students who share contact details/GPA. */
  minGpa?: number;
  skills?: string[];
  certifications?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  hasCertificates?: boolean;
  minCertificates?: number;
}

export interface StudentSearchResult {
  students: RecruiterStudentView[];
  total: number;
  totalExact: boolean;
  hasMore: boolean;
}

const PROFILE_COLUMNS =
  'id, full_name, email, university, graduation_year, major, gpa, location, organization_id, created_at';

function matchesAny(title: string | null | undefined, terms: string[]): boolean {
  const t = (title ?? '').toLowerCase();
  return terms.some((term) => t.includes(term.toLowerCase()));
}

export async function searchStudents(
  admin: SupabaseClient,
  orgIds: string[],
  criteria: StudentSearchCriteria,
  page: { offset: number; limit: number }
): Promise<StudentSearchResult> {
  if (orgIds.length === 0) return { students: [], total: 0, totalExact: true, hasMore: false };

  const q = sanitizeFilterTerm(criteria.q ?? '');
  const institutions = (criteria.institutions ?? []).map((i) => sanitizeFilterTerm(i)).filter(Boolean);
  const skills = (criteria.skills ?? []).map((s) => sanitizeFilterTerm(s)).filter(Boolean);
  const certTerms = (criteria.certifications ?? []).map((s) => sanitizeFilterTerm(s)).filter(Boolean);
  const minGpa = typeof criteria.minGpa === 'number' && Number.isFinite(criteria.minGpa) ? criteria.minGpa : 0;
  const minCertificates = Math.max(0, criteria.minCertificates ?? 0);
  const needsCerts =
    !!criteria.hasCertificates || skills.length > 0 || certTerms.length > 0 || minCertificates > 0 || !!criteria.dateFrom || !!criteria.dateTo;

  const wanted = page.offset + page.limit + 1; // one look-ahead row for has_more
  const matched: RecruiterStudentView[] = [];
  let exhausted = false;

  for (let windowIndex = 0; windowIndex < MAX_WINDOWS && matched.length < wanted; windowIndex++) {
    const from = windowIndex * WINDOW_SIZE;
    let query = admin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + WINDOW_SIZE - 1);

    if (q) query = query.or(`full_name.ilike.%${q}%,major.ilike.%${q}%,university.ilike.%${q}%`);
    if (institutions.length > 0) query = query.or(institutions.map((i) => `university.ilike.%${i}%`).join(','));
    if (minGpa > 0) query = query.gte('gpa', minGpa);
    if (typeof criteria.graduationYear === 'number') query = query.eq('graduation_year', criteria.graduationYear);

    const { data: profiles, error: profilesError } = await query;
    if (profilesError) throw new Error(`profile search failed: ${profilesError.message ?? 'unknown'}`);

    const rows = (profiles ?? []) as Array<Record<string, unknown>>;
    if (rows.length < WINDOW_SIZE) exhausted = true;
    if (rows.length === 0) break;

    const approved = await getApprovedStudentOrgs(admin, rows.map((r) => String(r.id)), orgIds);
    const eligible = rows.filter((r) => approved.has(String(r.id)));
    if (eligible.length > 0) {
      const eligibleIds = eligible.map((r) => String(r.id));
      const visibility = await getVisibilityForStudents(admin, eligibleIds);

      const certsByStudent = new Map<string, RawCertificateRow[]>();
      {
        let certQuery = admin
          .from('certificates')
          .select('id, title, institution, date_issued, student_id')
          .in('student_id', eligibleIds)
          .in('organization_id', orgIds)
          .eq('verification_status', 'verified')
          .order('date_issued', { ascending: false })
          .limit(MAX_CERT_ROWS_PER_WINDOW);
        if (criteria.dateFrom) certQuery = certQuery.gte('date_issued', criteria.dateFrom);
        if (criteria.dateTo) certQuery = certQuery.lte('date_issued', criteria.dateTo);
        const { data: certs, error: certError } = await certQuery;
        if (certError) throw new Error(`certificate search failed: ${certError.message ?? 'unknown'}`);
        for (const c of (certs ?? []) as Array<RawCertificateRow & { student_id: string }>) {
          const list = certsByStudent.get(c.student_id) ?? [];
          list.push(c);
          certsByStudent.set(c.student_id, list);
        }
      }

      for (const profile of eligible) {
        const id = String(profile.id);
        const vis = visibility.get(id)!;
        const certs = certsByStudent.get(id) ?? [];

        if (needsCerts && certs.length === 0) continue;
        if (skills.length > 0 && !certs.some((c) => matchesAny(c.title, skills))) continue;
        if (certTerms.length > 0 && !certs.some((c) => matchesAny(c.title, certTerms))) continue;
        if (minCertificates > 0 && certs.length < minCertificates) continue;
        // Filtering on GPA would leak it, so it only applies to students who share it.
        if (minGpa > 0 && !(vis.recruiterShareContact && typeof profile.gpa === 'number' && profile.gpa >= minGpa)) continue;

        matched.push(buildRecruiterStudentView(profile, vis, certs));
        if (matched.length >= wanted) break;
      }
    }

    if (exhausted) break;
  }

  const students = matched.slice(page.offset, page.offset + page.limit);
  const hasLookAhead = matched.length > page.offset + page.limit;
  // Scan budget spent before the profile list ended: more results may exist.
  const scanBudgetSpent = !exhausted && matched.length < wanted;
  return {
    students,
    total: matched.length,
    totalExact: exhausted && !hasLookAhead,
    hasMore: hasLookAhead || scanBudgetSpent,
  };
}
