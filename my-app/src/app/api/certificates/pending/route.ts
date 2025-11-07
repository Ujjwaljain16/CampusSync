import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';

export const GET = withRole(['faculty', 'admin'], async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  // Fetch pending certificates (filtered by organization)
  // The confidence_score and auto_approved fields are stored directly on the certificates table
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('verification_status', 'pending')
    .in('organization_id', targetOrgIds) // Multi-org filter
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending certificates:', error);
    throw apiError.internal(error.message);
  }

  console.log(`[Pending API] Found ${data?.length || 0} pending certificates`);
  
  // Filter to only those that require manual review (auto_approved === false or null)
  // If confidence_score >= 0.9 and auto_approved is true, filter them out
  const flagged = (data || []).filter((cert) => {
    // Include certificates that are not auto-approved
    const isAutoApproved = cert.auto_approved === true;
    const shouldInclude = !isAutoApproved;
    
    if (shouldInclude) {
      console.log(`[Pending API] Including cert ${cert.id}: auto_approved=${cert.auto_approved}, confidence=${cert.confidence_score}`);
    }
    
    return shouldInclude;
  });

  console.log(`[Pending API] Returning ${flagged.length} certificates requiring review`);
  
  return success(flagged);
});





