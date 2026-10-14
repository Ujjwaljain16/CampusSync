import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute, getApprovedStudentOrgs } from '@/lib/privacy/recruiterAccess';
import { isUuid } from '@/lib/privacy/sanitize';
import { getStudentVisibility } from '@/lib/privacy/visibility';
import { buildRecruiterStudentView, type RawCertificateRow } from '@/lib/privacy/studentView';
import { recordPiiRead } from '@/lib/privacy/audit';

const MAX_CERTIFICATES = 100;

/**
 * Recruiter view of a single student.
 *
 * Response (envelope): { data: RecruiterStudentView }.
 * 404 for anything that is not an APPROVED student in one of the recruiter's
 * approved organisations (faculty/admin/pending profiles are indistinguishable
 * from non-existent ids). Only verified certificates, never file_url /
 * description / confidence_score / verification_method; contact details and GPA
 * only when the student enabled `recruiter_share_contact`.
 */
export const GET = recruiterRoute(
  { scope: 'recruiter-student-detail', rateLimit: RateLimitPresets.search },
  async (_req: NextRequest, access, routeCtx: { params: Promise<{ studentId: string }> }) => {
    const { studentId } = await routeCtx.params;
    if (!isUuid(studentId)) return apiError.badRequest('Invalid student id');

    const { admin, orgIds } = access;

    // Eligibility first: must be an approved student of an accessible org.
    const approved = await getApprovedStudentOrgs(admin, [studentId], orgIds);
    const studentOrgId = approved.get(studentId);
    if (!studentOrgId) return apiError.notFound('Student not found');

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('id', studentId)
      .in('organization_id', orgIds)
      .maybeSingle();
    if (profileError) {
      console.error('[recruiter-student-detail] profile lookup failed', profileError);
      return apiError.internal('Failed to load student');
    }
    if (!profile) return apiError.notFound('Student not found');

    const visibility = await getStudentVisibility(admin, studentId);

    const { data: certificates, error: certError } = await admin
      .from('certificates')
      .select('id, title, institution, date_issued')
      .eq('student_id', studentId)
      .in('organization_id', orgIds)
      .eq('verification_status', 'verified')
      .order('date_issued', { ascending: false })
      .limit(MAX_CERTIFICATES);
    if (certError) {
      console.error('[recruiter-student-detail] certificate lookup failed', certError);
      return apiError.internal('Failed to load certificates');
    }

    const record = profile as Record<string, unknown>;
    // Fall back to the organisation name when the profile has no university.
    if (!record.university) {
      const { data: org } = await admin.from('organizations').select('name').eq('id', studentOrgId).maybeSingle();
      if (org && typeof (org as { name?: unknown }).name === 'string') record.university = (org as { name: string }).name;
    }

    const view = buildRecruiterStudentView(record, visibility, (certificates ?? []) as RawCertificateRow[]);

    await recordPiiRead(admin, {
      userId: access.user.id,
      organizationId: studentOrgId,
      action: 'recruiter_view_student',
      targetId: studentId,
      details: { contact_shared: visibility.recruiterShareContact, certificate_count: view.certifications.length },
    });

    return success(view);
  }
);
