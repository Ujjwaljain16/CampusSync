import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { success, apiError } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute } from '@/lib/privacy/recruiterAccess';

/**
 * Audit actions that count as recruiter verification work. (The route that wrote
 * `recruiter_certificate_verification` was removed; nothing writes it today.)
 */
const VERIFICATION_ACTIONS = ['recruiter_certificate_verification'];

async function countCertificates(admin: SupabaseClient, orgIds: string[], status?: string): Promise<number> {
  let query = admin.from('certificates').select('*', { count: 'exact', head: true }).in('organization_id', orgIds);
  if (status) query = query.eq('verification_status', status);
  const { count, error } = await query;
  if (error) throw new Error(`certificate count failed: ${error.message ?? 'unknown'}`);
  return count ?? 0;
}

/**
 * Per-organisation certificate counts for the recruiter's approved organisations
 * plus their own recent verification actions (from audit_logs).
 * Response (envelope): { data: { user, analytics, recent_verifications } }
 */
export const GET = recruiterRoute(
  { scope: 'recruiter-dashboard', rateLimit: RateLimitPresets.relaxed },
  async (_req: NextRequest, { admin, user, orgIds, selectedOrgId }) => {
    try {
      const byOrganization = await Promise.all(
        orgIds.map(async (organizationId) => {
          const [total, verified, pending] = await Promise.all([
            countCertificates(admin, [organizationId]),
            countCertificates(admin, [organizationId], 'verified'),
            countCertificates(admin, [organizationId], 'pending'),
          ]);
          return {
            organizationId,
            total_verifications: total,
            successful_verifications: verified,
            pending_verifications: pending,
          };
        })
      );

      const total = byOrganization.reduce((s, o) => s + o.total_verifications, 0);
      const verified = byOrganization.reduce((s, o) => s + o.successful_verifications, 0);
      const pending = byOrganization.reduce((s, o) => s + o.pending_verifications, 0);

      const { data: recent, error: recentError } = await admin
        .from('audit_logs')
        .select('action, created_at, target_id, details, organization_id')
        .in('organization_id', orgIds)
        .eq('user_id', user.id)
        .in('action', VERIFICATION_ACTIONS)
        .order('created_at', { ascending: false })
        .limit(10);
      if (recentError) console.error('[recruiter-dashboard] recent verifications failed', recentError);

      return success({
        user: {
          id: user.id,
          role: 'recruiter',
          ...(selectedOrgId ? { organizationId: selectedOrgId } : { accessibleOrganizations: orgIds }),
        },
        analytics: {
          total_verifications: total,
          successful_verifications: verified,
          pending_verifications: pending,
          verification_rate: total > 0 ? ((verified / total) * 100).toFixed(1) : '0.0',
          ...(selectedOrgId ? {} : { by_organization: byOrganization }),
        },
        recent_verifications: recent ?? [],
      });
    } catch (err) {
      console.error('[recruiter-dashboard] failed', err);
      return apiError.internal('Failed to load dashboard');
    }
  }
);
