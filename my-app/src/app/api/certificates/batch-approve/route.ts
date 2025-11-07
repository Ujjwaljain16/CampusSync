import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody, getOrganizationContext } from '@/lib/api';

interface BatchApproveBody {
  certificateIds: string[];
  status: 'approved' | 'rejected';
  reason?: string;
}

export const POST = withRole(['faculty', 'admin', 'org_admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<BatchApproveBody>(
    req,
    ['certificateIds', 'status']
  );
  if (result.error) return result.error;

  const body = result.data;
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  
  // Validate all certificates belong to faculty's organization
  const { data: certsToValidate, error: validationError } = await supabase
    .from('certificates')
    .select('id, organization_id')
    .in('id', body.certificateIds);

  if (validationError) throw apiError.internal(validationError.message);

  const invalidCerts = certsToValidate?.filter(cert => 
    !orgContext.isSuperAdmin && cert.organization_id !== ('organizationId' in orgContext ? orgContext.organizationId : null)
  );

  if (invalidCerts && invalidCerts.length > 0) {
    throw apiError.forbidden(`Cannot approve certificates from other organizations: ${invalidCerts.map(c => c.id).join(', ')}`);
  }
  
  // Update all certificates
  const { data, error } = await supabase
    .from('certificates')
    .update({
      verification_status: body.status,
      faculty_notes: body.reason,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('id', body.certificateIds)
    .select();

  if (error) throw apiError.internal(error.message);

  // Log the batch action
  try {
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      organization_id: 'organizationId' in orgContext ? orgContext.organizationId : null,
      action: 'batch_certificate_review',
      target_id: body.certificateIds.join(','),
      details: {
        status: body.status,
        reason: body.reason,
        count: body.certificateIds.length
      },
      created_at: new Date().toISOString()
    });
  } catch (auditError) {
    console.error('Audit log error:', auditError);
    // Don't fail the request
  }

  return success({
    updated: data?.length || 0,
    status: body.status,
    certificateIds: body.certificateIds
  }, `Successfully ${body.status} ${data?.length || 0} certificates`);
});