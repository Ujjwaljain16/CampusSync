import { NextRequest, NextResponse } from 'next/server';
import { success, apiError } from '@/lib/api/utils/response';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { isUuid } from '@/lib/privacy/sanitize';
import { getStudentVisibility } from '@/lib/privacy/visibility';

/**
 * Public portfolio (unauthenticated).
 *
 * DEFAULT DENY: only students who enabled `profiles.public_portfolio_enabled`
 * are served. Unknown ids, non-students and private portfolios all return the
 * same 404 so the endpoint cannot be used to enumerate users.
 *
 * Response (envelope):
 *   { data: { certificates: [
 *       { id, title, institution, date_issued,
 *         credential?: { id, jws? } }   // present when an active VC exists
 *   ] } }
 * Never returned: description / raw OCR text, confidence scores, file URLs,
 * non-verified certificates, user or organisation identifiers.
 */

const MAX_CERTIFICATES = 100;
const NOT_AVAILABLE = 'This portfolio is private or does not exist';

type CertRow = { id: string; title: string | null; institution: string | null; date_issued: string | null };
type VcRow = { id: string; credential: unknown };

function readVcLink(row: VcRow): { certificateId: string; id: string; jws?: string } | null {
  const credential = row.credential as
    | { credentialSubject?: { certificateId?: unknown }; proof?: { jws?: unknown } }
    | null
    | undefined;
  const certificateId = credential?.credentialSubject?.certificateId;
  if (typeof certificateId !== 'string') return null;
  const jws = credential?.proof?.jws;
  return { certificateId, id: row.id, ...(typeof jws === 'string' && jws ? { jws } : {}) };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const limited = enforceRateLimit(request, 'public-portfolio', RateLimitPresets.relaxed);
  if (limited) return limited;

  try {
    const { userId } = await params;
    if (!isUuid(userId)) return apiError.badRequest('Invalid user id');

    const organizationId = new URL(request.url).searchParams.get('organizationId');
    if (organizationId !== null && !isUuid(organizationId)) return apiError.badRequest('Invalid organization id');

    // Service-role client: anonymous visitors have no RLS access. Every query below
    // is explicitly scoped to the (opted-in) student.
    const admin = await createSupabaseAdminClient();

    const visibility = await getStudentVisibility(admin, userId);
    if (!visibility.publicPortfolioEnabled) return apiError.notFound(NOT_AVAILABLE);

    const { data: roleRows, error: roleError } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('user_id', userId)
      .eq('role', 'student')
      .eq('approval_status', 'approved')
      .limit(1);
    if (roleError) {
      console.error('[public-portfolio] role lookup failed', roleError);
      return apiError.internal('Failed to load portfolio');
    }
    if (!roleRows || roleRows.length === 0) return apiError.notFound(NOT_AVAILABLE);

    let certQuery = admin
      .from('certificates')
      .select('id, title, institution, date_issued')
      .eq('student_id', userId)
      .eq('verification_status', 'verified')
      .order('date_issued', { ascending: false })
      .limit(MAX_CERTIFICATES);
    if (organizationId) certQuery = certQuery.eq('organization_id', organizationId);

    const { data: certificates, error: certError } = await certQuery;
    if (certError) {
      console.error('[public-portfolio] certificate query failed', certError);
      return apiError.internal('Failed to load portfolio');
    }
    const certRows = (certificates ?? []) as CertRow[];

    // Link active verifiable credentials to their certificates (by credentialSubject.certificateId).
    const linkByCert = new Map<string, { id: string; jws?: string }>();
    if (certRows.length > 0) {
      const { data: vcs, error: vcError } = await admin
        .from('verifiable_credentials')
        .select('id, credential')
        .eq('student_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(200);
      if (vcError) {
        console.error('[public-portfolio] credential query failed', vcError);
      } else {
        for (const row of (vcs ?? []) as VcRow[]) {
          const link = readVcLink(row);
          if (link && !linkByCert.has(link.certificateId)) {
            linkByCert.set(link.certificateId, { id: link.id, ...(link.jws ? { jws: link.jws } : {}) });
          }
        }
      }
    }

    const items = certRows.map((c) => {
      const credential = linkByCert.get(c.id);
      return {
        id: c.id,
        title: c.title,
        institution: c.institution,
        date_issued: c.date_issued,
        ...(credential ? { credential } : {}),
      };
    });

    const response: NextResponse = success({ certificates: items });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('[public-portfolio] failed', err);
    return apiError.internal('Failed to load portfolio');
  }
}
