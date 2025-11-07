/**
 * Certificate Database Verification Endpoint
 * 
 * Purpose: Verifies and flags certificates stored in the database
 * 
 * Use Cases:
 * - Recruiter verification of student certificates
 * - Multi-organization access control
 * - Certificate flagging and review workflow
 * 
 * This is different from /verify-credential which performs cryptographic VC verification.
 * This endpoint handles business logic for certificate approval/rejection in the database.
 * 
 * Features:
 * - Multi-tenant organization filtering
 * - Recruiter access control
 * - Audit logging
 * - Certificate status updates (verify/flag)
 */
import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';

export const POST = withRole(['recruiter', 'admin'], async (req: NextRequest, { user }) => {
  const body = await req.json() as {
    certificate_id: string;
    action: 'verify' | 'flag';
    notes?: string;
  };

  if (!body.certificate_id || !body.action) {
    throw apiError.badRequest('Missing required fields: certificate_id, action');
  }

  const supabase = await createSupabaseServerClient();
  
  // Get requested organization from header
  const requestedOrgId = getRequestedOrgId(req);
  
  // Get organization context for multi-tenancy (handles recruiter multi-org)
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  
  // Get target org IDs
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  // Get the certificate (filtered by accessible organizations)
  const { data: certificate, error: certError } = await supabase
    .from('certificates')
    .select('*')
    .eq('id', body.certificate_id)
    .in('organization_id', targetOrgIds) // Multi-org filter for recruiter access
    .single();

  if (certError || !certificate) {
    throw apiError.notFound('Certificate not found');
  }

  // Update verification status
  const updateData = {
    recruiter_verified: body.action === 'verify',
    recruiter_notes: body.notes || null,
    verified_by_recruiter: user.id,
    recruiter_verification_date: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('certificates')
    .update(updateData)
    .eq('id', body.certificate_id)
    .in('organization_id', targetOrgIds) // Ensure org match for recruiter access
    .select()
    .single();

  if (error) {
    throw apiError.internal(error.message);
  }

  // Log the verification action
  await supabase.from('audit_logs').insert({
    user_id: user.id,
    organization_id: certificate.organization_id, // Use cert's org for audit log
    action: 'recruiter_certificate_verification',
    target_id: body.certificate_id,
    details: {
      action: body.action,
      notes: body.notes,
      certificate_title: certificate.title,
      student_id: certificate.student_id
    },
    created_at: new Date().toISOString()
  });

  return success({
    certificate_id: body.certificate_id,
    action: body.action,
    verified: body.action === 'verify',
    verification_date: updateData.recruiter_verification_date
  });
});