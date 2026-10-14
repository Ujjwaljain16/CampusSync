import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute, readJsonObject, type RecruiterAccess } from '@/lib/privacy/recruiterAccess';
import { clampInt, isIsoDateString, sanitizeFilterTerm, sanitizeTermList } from '@/lib/privacy/sanitize';
import { SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT, searchStudents, type StudentSearchCriteria } from '@/lib/privacy/studentSearch';
import { recordPiiRead } from '@/lib/privacy/audit';

/**
 * Recruiter student search.
 *
 * Response (envelope): { data: { students, pagination, filters | search_criteria } }
 * Students are privacy-filtered by `buildRecruiterStudentView`: only approved
 * students of the recruiter's approved organisations, verified certificates only,
 * contact details + GPA only for students who opted in (`recruiter_share_contact`).
 */

const RATE = { scope: 'recruiter-search', rateLimit: RateLimitPresets.search };

function parseGpa(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0;
}

async function runAndAudit(
  access: RecruiterAccess,
  criteria: StudentSearchCriteria,
  limit: number,
  offset: number,
  filterNames: string[]
) {
  const result = await searchStudents(access.admin, access.orgIds, criteria, { offset, limit });
  await recordPiiRead(access.admin, {
    userId: access.user.id,
    organizationId: access.selectedOrgId ?? access.orgIds[0] ?? null,
    action: 'recruiter_search_students',
    details: {
      result_count: result.students.length,
      student_ids: result.students.map((s) => s.id),
      filters_used: filterNames,
      limit,
      offset,
    },
  });
  return result;
}

export const GET = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const { searchParams } = new URL(req.url);
  const q = sanitizeFilterTerm(searchParams.get('q') ?? '');
  const skill = sanitizeFilterTerm(searchParams.get('skill') ?? '');
  const certification = sanitizeFilterTerm(searchParams.get('certification') ?? '');
  const institution = sanitizeFilterTerm(searchParams.get('institution') ?? '');
  const hasCertificates = searchParams.get('has_certificates') === 'true';
  const minGpa = parseGpa(searchParams.get('min_gpa'));
  const rawYear = searchParams.get('graduation_year');
  const graduationYear = rawYear ? clampInt(rawYear, 1950, 2100, 0) || null : null;
  const limit = clampInt(searchParams.get('limit'), 1, SEARCH_MAX_LIMIT, SEARCH_DEFAULT_LIMIT);
  const offset = clampInt(searchParams.get('offset'), 0, 100000, 0);

  const criteria: StudentSearchCriteria = {
    q,
    institutions: institution ? [institution] : [],
    skills: skill ? [skill] : [],
    certifications: certification ? [certification] : [],
    minGpa,
    graduationYear,
    hasCertificates,
  };

  const filterNames = Object.entries({ q, skill, certification, institution, has_certificates: hasCertificates, min_gpa: minGpa, graduation_year: graduationYear })
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k);

  const result = await runAndAudit(access, criteria, limit, offset, filterNames);

  return success({
    students: result.students,
    pagination: { total: result.total, total_exact: result.totalExact, limit, offset, has_more: result.hasMore },
    filters: { query: q, skill, certification, institution, has_certificates: hasCertificates, min_gpa: minGpa, graduation_year: graduationYear },
  });
});

// POST: advanced search with multiple criteria
export const POST = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  for (const key of ['skills', 'certifications', 'institutions'] as const) {
    if (body[key] !== undefined && !Array.isArray(body[key])) {
      return apiError.badRequest(`${key} must be an array of strings`);
    }
  }
  if (body.has_certificates !== undefined && typeof body.has_certificates !== 'boolean') {
    return apiError.badRequest('has_certificates must be a boolean');
  }
  for (const key of ['graduation_year', 'min_gpa', 'min_certificates', 'limit', 'offset'] as const) {
    if (body[key] !== undefined && (typeof body[key] !== 'number' || !Number.isFinite(body[key] as number))) {
      return apiError.badRequest(`${key} must be a number`);
    }
  }

  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  if (body.date_range !== undefined && body.date_range !== null) {
    const range = body.date_range as { start?: unknown; end?: unknown };
    if (typeof range !== 'object' || (range.start !== undefined && !isIsoDateString(range.start)) || (range.end !== undefined && !isIsoDateString(range.end))) {
      return apiError.badRequest('date_range must contain ISO dates (start, end)');
    }
    dateFrom = (range.start as string | undefined) ?? null;
    dateTo = (range.end as string | undefined) ?? null;
  }

  const skills = sanitizeTermList(body.skills);
  const certifications = sanitizeTermList(body.certifications);
  const institutions = sanitizeTermList(body.institutions);
  const minGpa = parseGpa(body.min_gpa);
  const graduationYear = typeof body.graduation_year === 'number' ? clampInt(body.graduation_year, 1950, 2100, 0) || null : null;
  const minCertificates = clampInt(body.min_certificates, 0, 50, 0);
  const hasCertificates = body.has_certificates === true;
  const limit = clampInt(body.limit, 1, SEARCH_MAX_LIMIT, SEARCH_DEFAULT_LIMIT);
  const offset = clampInt(body.offset, 0, 100000, 0);

  const criteria: StudentSearchCriteria = {
    institutions,
    skills,
    certifications,
    minGpa,
    graduationYear,
    dateFrom,
    dateTo,
    minCertificates,
    hasCertificates,
  };

  const filterNames = Object.entries({ skills: skills.length, certifications: certifications.length, institutions: institutions.length, min_gpa: minGpa, graduation_year: graduationYear, date_range: dateFrom || dateTo, min_certificates: minCertificates, has_certificates: hasCertificates })
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k);

  const result = await runAndAudit(access, criteria, limit, offset, filterNames);

  return success({
    students: result.students,
    pagination: { total: result.total, total_exact: result.totalExact, limit, offset, has_more: result.hasMore },
    search_criteria: {
      skills,
      certifications,
      institutions,
      date_range: dateFrom || dateTo ? { start: dateFrom, end: dateTo } : null,
      min_certificates: minCertificates,
      has_certificates: hasCertificates,
      min_gpa: minGpa,
      graduation_year: graduationYear,
    },
  });
});
