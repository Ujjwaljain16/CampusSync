import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody, getOrganizationContext } from '@/lib/api';

/**
 * POST /api/v2/admin/super/organizations/[orgId]/transfer-primary-admin
 * Transfer primary admin status from one user to another
 * ONLY super_admins can call this endpoint
 */

interface TransferPrimaryAdminRequest {
  from_user_id: string;
  to_user_id: string;
}

export const POST = withRole(['super_admin'], async (req: NextRequest, { user }) => {
  // Extract orgId from URL path
  const urlParts = req.nextUrl.pathname.split('/');
  const orgId = urlParts[urlParts.indexOf('organizations') + 1];
  
  if (!orgId) {
    return apiError.badRequest('Organization ID is required');
  }
  
  const { data: body, error: validationError } = await parseAndValidateBody<TransferPrimaryAdminRequest>(
    req,
    ['from_user_id', 'to_user_id']
  );
  
  if (validationError) return validationError;
  
  // Verify caller is super_admin
  const orgContext = await getOrganizationContext(user);
  if (!orgContext.isSuperAdmin) {
    return apiError.forbidden('Only super admins can transfer primary admin status');
  }
  
  // Validate that from_user and to_user are different
  if (body.from_user_id === body.to_user_id) {
    return apiError.validation('Cannot transfer primary admin status to the same user');
  }
  
  const adminSupabase = await createSupabaseAdminClient();
  
  // Step 1: Verify from_user is current primary admin
  const { data: fromUser, error: fromUserError } = await adminSupabase
    .from('user_roles')
    .select('role, organization_id, is_primary_admin')
    .eq('user_id', body.from_user_id)
    .single();
  
  if (fromUserError || !fromUser) {
    return apiError.notFound('Source user not found');
  }
  
  if (!fromUser.is_primary_admin) {
    return apiError.validation('Source user is not the primary admin');
  }
  
  if (fromUser.organization_id !== orgId) {
    return apiError.validation('Source user does not belong to this organization');
  }
  
  // Step 2: Verify to_user exists and is in same organization
  const { data: toUser, error: toUserError } = await adminSupabase
    .from('user_roles')
    .select('role, organization_id, is_primary_admin')
    .eq('user_id', body.to_user_id)
    .single();
  
  if (toUserError || !toUser) {
    return apiError.notFound('Target user not found');
  }
  
  if (toUser.organization_id !== orgId) {
    return apiError.validation('Target user must be in the same organization');
  }
  
  if (toUser.is_primary_admin) {
    return apiError.validation('Target user is already a primary admin');
  }
  
  // Step 3: Perform transfer using database function
  const { data: transferResult, error: transferError } = await adminSupabase
    .rpc('transfer_primary_admin', {
      from_user_id: body.from_user_id,
      to_user_id: body.to_user_id,
      org_id: orgId
    });
  
  if (transferError) {
    console.error('Error transferring primary admin:', transferError);
    return apiError.internal(`Failed to transfer primary admin: ${transferError.message}`);
  }
  
  // Step 4: Update organizations table primary_admin_id
  const { error: orgUpdateError } = await adminSupabase
    .from('organizations')
    .update({
      primary_admin_id: body.to_user_id,
      updated_at: new Date().toISOString()
    })
    .eq('id', orgId);
  
  if (orgUpdateError) {
    console.warn('Failed to update organizations.primary_admin_id:', orgUpdateError);
    // Don't fail the whole operation, just log warning
  }
  
  // Step 5: Log the transfer in audit logs
  await adminSupabase
    .from('super_admin_audit_partitioned')
    .insert({
      user_id: user.id,
      action: 'transfer_primary_admin',
      access_reason: `Transferred primary admin from ${body.from_user_id} to ${body.to_user_id}`,
      category: 'organization_management',
      metadata: {
        organization_id: orgId,
        from_user_id: body.from_user_id,
        to_user_id: body.to_user_id,
        transfer_result: transferResult
      }
    });
  
  return success({
    success: true,
    from_user_id: body.from_user_id,
    to_user_id: body.to_user_id,
    organization_id: orgId,
    message: 'Primary admin status transferred successfully'
  }, 'Primary admin transferred successfully');
});

/**
 * GET /api/v2/admin/super/organizations/[orgId]/primary-admin
 * Get the current primary admin for an organization
 */
export const GET = withRole(['admin', 'org_admin', 'super_admin'], async (req: NextRequest) => {
  // Extract orgId from URL path
  const urlParts = req.nextUrl.pathname.split('/');
  const orgId = urlParts[urlParts.indexOf('organizations') + 1];
  
  if (!orgId) {
    return apiError.badRequest('Organization ID is required');
  }
  
  const adminSupabase = await createSupabaseAdminClient();
  
  // Get primary admin using database function
  const { data: primaryAdmin, error } = await adminSupabase
    .rpc('get_organization_primary_admin', { org_id: orgId });
  
  if (error) {
    console.error('Error fetching primary admin:', error);
    return apiError.internal(`Failed to fetch primary admin: ${error.message}`);
  }
  
  if (!primaryAdmin || primaryAdmin.length === 0) {
    return apiError.notFound('No primary admin found for this organization');
  }
  
  return success({
    user_id: primaryAdmin[0].user_id,
    email: primaryAdmin[0].email,
    full_name: primaryAdmin[0].full_name
  });
});
