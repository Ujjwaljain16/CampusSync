import { NextRequest } from 'next/server';
import { success } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute } from '@/lib/privacy/recruiterAccess';
import { clampInt, sanitizeFilterTerm, sanitizeTermList } from '@/lib/privacy/sanitize';
import { searchStudents } from '@/lib/privacy/studentSearch';
import { recordPiiRead } from '@/lib/privacy/audit';

/**
 * Paginated student list for recruiters.
 *
 * Query: page (>=1), limit (1..50, default 10), search, skills (comma separated).
 * `verification_status` / `confidence_min` are no longer supported: recruiters only
 * ever see VERIFIED certificates and confidence scores are not exposed.
 * Response (envelope): { data: { students, pagination: { page, limit, total, totalPages, total_exact } } }
 * Shares its privacy-filtered student shape with /api/recruiter/search-students.
 */
export const GET = recruiterRoute(
  { scope: 'recruiter-students', rateLimit: RateLimitPresets.search },
  async (req: NextRequest, access) => {
    const { searchParams } = new URL(req.url);
    const page = clampInt(searchParams.get('page'), 1, 10000, 1);
    const limit = clampInt(searchParams.get('limit'), 1, 50, 10);
    const search = sanitizeFilterTerm(searchParams.get('search') ?? '');
    const skills = sanitizeTermList(searchParams.get('skills') ?? '');
    const offset = (page - 1) * limit;

    const result = await searchStudents(
      access.admin,
      access.orgIds,
      { q: search, skills, hasCertificates: skills.length > 0 },
      { offset, limit }
    );

    await recordPiiRead(access.admin, {
      userId: access.user.id,
      organizationId: access.selectedOrgId ?? access.orgIds[0] ?? null,
      action: 'recruiter_search_students',
      details: {
        source: 'students_list',
        result_count: result.students.length,
        student_ids: result.students.map((s) => s.id),
        page,
        limit,
      },
    });

    return success({
      students: result.students,
      pagination: {
        page,
        limit,
        total: result.total,
        total_exact: result.totalExact,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    });
  }
);
