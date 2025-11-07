import { withRole, success, getOrganizationContext, type RecruiterContext } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';

export const GET = withRole(['recruiter'], async (req, { user }) => {
  const supabase = await createSupabaseServerClient();
  
  // Get requested organization from header
  const requestedOrgId = getRequestedOrgId(req);
  
  // Get organization context (auto-detects recruiter multi-org)
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  
  // Check if this is a recruiter with multi-org access
  if ('isRecruiter' in orgContext && orgContext.isRecruiter) {
    const recruiterContext = orgContext as RecruiterContext;
    
    // If specific org selected, return stats for that org only
    if (recruiterContext.selectedOrganization) {
      const { count: totalVerifications } = await supabase
        .from('certificates')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', recruiterContext.selectedOrganization);
      
      const { count: successfulVerifications } = await supabase
        .from('certificates')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', recruiterContext.selectedOrganization)
        .eq('verification_status', 'verified');
      
      const { count: pendingVerifications } = await supabase
        .from('certificates')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', recruiterContext.selectedOrganization)
        .eq('verification_status', 'pending');
      
      const { data: recentVerifications } = await supabase
        .from('audit_logs')
        .select('action, created_at, target_id, details')
        .eq('organization_id', recruiterContext.selectedOrganization)
        .eq('user_id', user.id)
        .in('action', ['verify_certificate', 'bulk_verify', 'bulk_reject'])
        .order('created_at', { ascending: false })
        .limit(10);
      
      const verificationRate = totalVerifications && totalVerifications > 0
        ? ((successfulVerifications || 0) / totalVerifications * 100).toFixed(1)
        : 0;
      
      return success({
        user: {
          id: user.id,
          email: user.email,
          role: 'recruiter',
          organizationId: recruiterContext.selectedOrganization
        },
        analytics: {
          total_verifications: totalVerifications || 0,
          successful_verifications: successfulVerifications || 0,
          pending_verifications: pendingVerifications || 0,
          verification_rate: verificationRate
        },
        recent_verifications: recentVerifications || [],
        message: 'Recruiter dashboard loaded successfully (single org)'
      });
    }
    
    // No specific org - aggregate stats from all accessible organizations
    const aggregatedStats = await Promise.all(
      recruiterContext.accessibleOrganizations.map(async (orgId) => {
        const { count: total } = await supabase
          .from('certificates')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId);
        
        const { count: verified } = await supabase
          .from('certificates')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('verification_status', 'verified');
        
        const { count: pending } = await supabase
          .from('certificates')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('verification_status', 'pending');
        
        return {
          organizationId: orgId,
          total_verifications: total || 0,
          successful_verifications: verified || 0,
          pending_verifications: pending || 0,
        };
      })
    );
    
    // Get recent verifications across all orgs
    const { data: recentVerifications } = await supabase
      .from('audit_logs')
      .select('action, created_at, target_id, details, organization_id')
      .in('organization_id', recruiterContext.accessibleOrganizations)
      .eq('user_id', user.id)
      .in('action', ['verify_certificate', 'bulk_verify', 'bulk_reject'])
      .order('created_at', { ascending: false })
      .limit(10);
    
    const totalVerifications = aggregatedStats.reduce((sum, s) => sum + s.total_verifications, 0);
    const totalVerified = aggregatedStats.reduce((sum, s) => sum + s.successful_verifications, 0);
    const totalPending = aggregatedStats.reduce((sum, s) => sum + s.pending_verifications, 0);
    const verificationRate = totalVerifications > 0
      ? ((totalVerified / totalVerifications) * 100).toFixed(1)
      : 0;
    
    return success({
      user: {
        id: user.id,
        email: user.email,
        role: 'recruiter',
        accessibleOrganizations: recruiterContext.accessibleOrganizations
      },
      analytics: {
        total_verifications: totalVerifications,
        successful_verifications: totalVerified,
        pending_verifications: totalPending,
        verification_rate: verificationRate,
        by_organization: aggregatedStats
      },
      recent_verifications: recentVerifications || [],
      message: 'Recruiter dashboard loaded successfully (multi-org aggregated)'
    });
  }
  
  // This shouldn't happen for recruiters, but keeping backward compatibility
  // for any edge cases (like recruiter with an assigned org_id)
  const { count: totalVerifications } = await supabase
    .from('certificates')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgContext.organizationId);
  
  const { count: successfulVerifications } = await supabase
    .from('certificates')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgContext.organizationId)
    .eq('verification_status', 'verified');
  
  const { count: pendingVerifications } = await supabase
    .from('certificates')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgContext.organizationId)
    .eq('verification_status', 'pending');
  
  const { data: recentVerifications } = await supabase
    .from('audit_logs')
    .select('action, created_at, target_id, details')
    .eq('organization_id', orgContext.organizationId)
    .eq('user_id', user.id)
    .in('action', ['verify_certificate', 'bulk_verify', 'bulk_reject'])
    .order('created_at', { ascending: false })
    .limit(10);
  
  const verificationRate = totalVerifications && totalVerifications > 0
    ? ((successfulVerifications || 0) / totalVerifications * 100).toFixed(1)
    : 0;
  
  return success({
    user: {
      id: user.id,
      email: user.email,
      role: 'recruiter',
      organizationId: orgContext.organizationId
    },
    analytics: {
      total_verifications: totalVerifications || 0,
      successful_verifications: successfulVerifications || 0,
      pending_verifications: pendingVerifications || 0,
      verification_rate: verificationRate
    },
    recent_verifications: recentVerifications || [],
    message: 'Recruiter dashboard loaded successfully'
  });
});