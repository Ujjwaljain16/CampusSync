import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';

export const POST = withRole(['recruiter', 'admin'], async (request: NextRequest, { user }) => {
  const body = await request.json() as {
    student_ids: string[];
    action: 'verify' | 'reject';
  };

  if (!body.student_ids || !Array.isArray(body.student_ids) || body.student_ids.length === 0) {
    throw apiError.badRequest('Student IDs are required');
  }

  if (!body.action || !['verify', 'reject'].includes(body.action)) {
    throw apiError.badRequest('Action must be "verify" or "reject"');
  }

  const { student_ids, action } = body;

  const supabase = await createSupabaseServerClient();
  
  // Get requested organization from header
  const requestedOrgId = getRequestedOrgId(request);
  
  // Get organization context for multi-tenancy (handles recruiter multi-org)
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  
  // Get target org IDs
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const newStatus = action === 'verify' ? 'verified' : 'rejected';

  // Update all certificates for the selected students (filtered by accessible organizations)
  const { data: certificates, error: fetchError } = await supabase
    .from('certificates')
    .select('id, student_id, title, verification_status, organization_id')
    .in('student_id', student_ids)
    .in('organization_id', targetOrgIds); // Multi-org filter for recruiter access

  if (fetchError) {
    console.error('Error fetching certificates:', fetchError);
    throw apiError.internal('Failed to fetch certificates');
  }

  if (!certificates || certificates.length === 0) {
    throw apiError.notFound('No certificates found for selected students');
  }

  // Update certificate statuses
  const { error: updateError } = await supabase
    .from('certificates')
    .update({
      verification_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .in('id', certificates.map(c => c.id))
    .in('organization_id', targetOrgIds); // Multi-org filter for recruiter access

  if (updateError) {
    console.error('Error updating certificates:', updateError);
    throw apiError.internal('Failed to update certificates');
  }

  // Create audit logs for the bulk action (align with existing schema)
  const auditLogs = certificates.map(cert => ({
    user_id: user.id,
    organization_id: cert.organization_id, // Use cert's org for audit log
    action: `bulk_${action}`,
    target_id: cert.id,
    details: {
      student_id: cert.student_id,
      certificate_title: cert.title,
      previous_status: cert.verification_status,
      new_status: newStatus,
      bulk_action: true
    },
    created_at: new Date().toISOString()
  }));

  const { error: auditError } = await supabase
    .from('audit_logs')
    .insert(auditLogs);

  if (auditError) {
    console.error('Error creating audit logs:', auditError);
    // Don't fail the request for audit log errors
  }

  // If verifying, issue VCs for the certificates
  if (action === 'verify') {
    try {
      // Issue VCs for verified certificates
      const vcPromises = certificates.map(async (cert) => {
        const vcResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/vc/issue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.id}` // In production, use proper auth
          },
          body: JSON.stringify({
            certificate_id: cert.id,
            student_id: cert.student_id
          })
        });

        if (!vcResponse.ok) {
          console.error(`Failed to issue VC for certificate ${cert.id}`);
        }
      });

      await Promise.allSettled(vcPromises);
    } catch (vcError) {
      console.error('Error issuing VCs:', vcError);
      // Don't fail the request for VC issuance errors
    }
  }

  return success({
    success: true,
    message: `Successfully ${action}ed ${certificates.length} certificates for ${student_ids.length} students`,
    updated_certificates: certificates.length,
    students_affected: student_ids.length
  });
});

