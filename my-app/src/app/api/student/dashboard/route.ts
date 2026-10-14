import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['student'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();

  // Get organization context for multi-tenancy
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  // Get student's certificates (filtered by organization)
  const { data: certificates, error: certError } = await supabase
    .from('certificates')
    .select('*')
    .eq('student_id', user.id)
    .in('organization_id', targetOrgIds)
    .order('created_at', { ascending: false })
    .limit(500);

  if (certError) {
    console.error('Error fetching certificates:', certError);
    throw apiError.internal('Failed to fetch certificates');
  }

  return success({
    user: {
      id: user.id,
      email: user.email,
      role: 'student'
    },
    organizationId: 'organizationId' in orgContext ? orgContext.organizationId : null,
    certificates: certificates || [],
    stats: {
      totalCertificates: certificates?.length || 0,
      pendingApproval: certificates?.filter((c: { verification_status?: string }) => c.verification_status === 'pending').length || 0,
      approved: certificates?.filter((c: { verification_status?: string }) => c.verification_status === 'verified').length || 0,
      rejected: certificates?.filter((c: { verification_status?: string }) => c.verification_status === 'rejected').length || 0
    }
  });
});


