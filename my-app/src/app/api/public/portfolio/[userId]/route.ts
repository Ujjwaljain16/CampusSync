import { NextRequest, NextResponse } from 'next/server';
import { success, apiError } from '@/lib/api/utils/response';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { enforceGlobalRateLimit } from '@/lib/rateLimitGlobal';
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

type VcEmbed = { id: string; created_at?: string | null; credential: unknown };
type CertRow = {
  id: string;
  title: string | null;
  institution: string | null;
  date_issued: string | null;
  /** Active credentials of this certificate (embedded through verifiable_credentials.certificate_id). */
  verifiable_credentials?: VcEmbed[] | VcEmbed | null;
};

/** The newest active credential of a certificate, reduced to what the portfolio shows. */
function pickCredential(embed: CertRow['verifiable_credentials']): { id: string; jws?: string } | null {
  const rows = Array.isArray(embed) ? embed : embed ? [embed] : [];
  if (rows.length === 0) return null;
  const newest = [...rows].sort((a, b) => `${b.created_at ?? ''}`.localeCompare(`${a.created_at ?? ''}`))[0];
  const jws = (newest.credential as { proof?: { jws?: unknown } } | null | undefined)?.proof?.jws;
  return { id: newest.id, ...(typeof jws === 'string' && jws ? { jws } : {}) };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const limited = enforceRateLimit(request, 'public-portfolio', RateLimitPresets.relaxed);
  if (limited) return limited;
  const globalLimited = await enforceGlobalRateLimit(request, 'public-portfolio', { limit: 30, windowSeconds: 60 });
  if (globalLimited) return globalLimited;

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

    // One query: verified certificates with their ACTIVE credentials embedded (join on
    // verifiable_credentials.certificate_id). The embedded filter keeps certificates that have none.
    let certQuery = admin
      .from('certificates')
      .select('id, title, institution, date_issued, verifiable_credentials(id, created_at, credential)')
      .eq('student_id', userId)
      .eq('verification_status', 'verified')
      .eq('verifiable_credentials.status', 'active')
      .order('date_issued', { ascending: false })
      .limit(MAX_CERTIFICATES);
    if (organizationId) certQuery = certQuery.eq('organization_id', organizationId);

    const { data: certificates, error: certError } = await certQuery;
    if (certError) {
      console.error('[public-portfolio] certificate query failed', certError);
      return apiError.internal('Failed to load portfolio');
    }
    const certRows = (certificates ?? []) as unknown as CertRow[];

    const items = certRows.map((c) => {
      const credential = pickCredential(c.verifiable_credentials);
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
