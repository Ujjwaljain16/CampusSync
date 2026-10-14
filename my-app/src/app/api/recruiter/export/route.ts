import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute, readJsonObject, getApprovedStudentOrgs } from '@/lib/privacy/recruiterAccess';
import { isPlainObject, isUuid } from '@/lib/privacy/sanitize';
import { getVisibilityForStudents } from '@/lib/privacy/visibility';
import { recordPiiRead } from '@/lib/privacy/audit';

const MAX_EXPORT_STUDENTS = 100;
const FORMATS = ['csv', 'json', 'excel'] as const;
type ExportFormat = (typeof FORMATS)[number];

type ProfileRow = { id: string; full_name: string | null; email: string | null; created_at: string | null };
type CertRow = { id: string; title: string | null; institution: string | null; date_issued: string | null; student_id: string };

/**
 * Export selected students (max 100, UUID-validated).
 *
 * Only approved students of the recruiter's organisations are exported; e-mail is
 * included only for students with `recruiter_share_contact`; credentials are
 * limited to VERIFIED certificates (id, title, institution, date_issued).
 * Response (envelope): { data: { data: rows, format, total_records, ... } }
 */
export const POST = recruiterRoute(
  { scope: 'recruiter-export', rateLimit: RateLimitPresets.strict },
  async (req: NextRequest, access) => {
    const parsed = await readJsonObject(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    if (!Array.isArray(body.studentIds) || body.studentIds.length === 0) {
      return apiError.badRequest('studentIds must be a non-empty array');
    }
    if (body.studentIds.length > MAX_EXPORT_STUDENTS) {
      return apiError.badRequest(`At most ${MAX_EXPORT_STUDENTS} students can be exported at once`);
    }
    if (!body.studentIds.every(isUuid)) {
      return apiError.badRequest('studentIds must be UUIDs');
    }
    if (typeof body.format !== 'string' || !(FORMATS as readonly string[]).includes(body.format)) {
      return apiError.badRequest(`format must be one of: ${FORMATS.join(', ')}`);
    }
    if (body.includeCredentials !== undefined && typeof body.includeCredentials !== 'boolean') {
      return apiError.badRequest('includeCredentials must be a boolean');
    }
    if (body.filters !== undefined && !isPlainObject(body.filters)) {
      return apiError.badRequest('filters must be an object');
    }
    const format = body.format as ExportFormat;
    const includeCredentials = body.includeCredentials === true;
    const verifiedOnly = isPlainObject(body.filters) && body.filters.verified_only === true;
    const requestedIds = Array.from(new Set(body.studentIds as string[]));

    const { admin, orgIds } = access;

    const approved = await getApprovedStudentOrgs(admin, requestedIds, orgIds);
    const eligibleIds = requestedIds.filter((id) => approved.has(id));

    let profiles: ProfileRow[] = [];
    let visibility = new Map<string, { recruiterShareContact: boolean }>();
    const certsByStudent = new Map<string, CertRow[]>();

    if (eligibleIds.length > 0) {
      const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, email, created_at')
        .in('id', eligibleIds)
        .in('organization_id', orgIds);
      if (error) {
        console.error('[recruiter-export] profile lookup failed', error);
        return apiError.internal('Failed to export students');
      }
      profiles = (data ?? []) as ProfileRow[];
      visibility = await getVisibilityForStudents(admin, eligibleIds);

      if (includeCredentials || verifiedOnly) {
        const { data: certs, error: certError } = await admin
          .from('certificates')
          .select('id, title, institution, date_issued, student_id')
          .in('student_id', eligibleIds)
          .in('organization_id', orgIds)
          .eq('verification_status', 'verified')
          .order('date_issued', { ascending: false })
          .limit(1000);
        if (certError) {
          console.error('[recruiter-export] certificate lookup failed', certError);
          return apiError.internal('Failed to export credentials');
        }
        for (const c of (certs ?? []) as CertRow[]) {
          const list = certsByStudent.get(c.student_id) ?? [];
          list.push(c);
          certsByStudent.set(c.student_id, list);
        }
      }
    }

    let rows: Array<Record<string, unknown>> = profiles.map((p) => {
      const shares = visibility.get(p.id)?.recruiterShareContact === true;
      const row: Record<string, unknown> = {
        id: p.id,
        full_name: p.full_name,
        created_at: p.created_at,
        contact_shared: shares,
      };
      if (shares && p.email) row.email = p.email;
      if (includeCredentials) {
        const certs = certsByStudent.get(p.id) ?? [];
        row.certificates = certs.map(({ id, title, institution, date_issued }) => ({ id, title, institution, date_issued }));
        row.certificate_count = certs.length;
        row.verified_certificates = certs.length;
      }
      return row;
    });

    if (verifiedOnly) {
      rows = rows.filter((r) => (certsByStudent.get(String(r.id)) ?? []).length > 0);
    }

    await recordPiiRead(admin, {
      userId: access.user.id,
      organizationId: access.selectedOrgId ?? orgIds[0] ?? null,
      action: 'recruiter_export_students',
      details: {
        format,
        requested_count: requestedIds.length,
        exported_count: rows.length,
        student_ids: rows.map((r) => r.id),
        include_credentials: includeCredentials,
        verified_only: verifiedOnly,
      },
    });

    if (format === 'csv') {
      const csvData = rows.map((r) => {
        const base: Record<string, unknown> = {
          student_id: r.id,
          full_name: r.full_name,
          email: r.email ?? '',
          joined_date: r.created_at,
        };
        if (includeCredentials) {
          base.certificate_count = r.certificate_count;
          base.verified_certificates = r.verified_certificates;
        }
        return base;
      });
      return success({
        data: csvData,
        format: 'csv',
        headers: Object.keys(csvData[0] ?? {}),
        total_records: csvData.length,
      });
    }

    return success({
      data: rows,
      format,
      total_records: rows.length,
      exported_at: new Date().toISOString(),
    });
  }
);
