import { NextRequest } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { emailService } from '@/lib/emailService';
import { getBaseUrl } from '@/lib/envValidator';

interface ApproveBody {
	certificateId: string;
	status: 'approved' | 'rejected';
	metadataId?: string;
	approveReason?: string;
	rejectReason?: string;
}

export const POST = withRole(['faculty', 'admin'], async (req: NextRequest, { user }) => {
	const result = await parseAndValidateBody<ApproveBody>(req, ['certificateId', 'status']);
	if (result.error) return result.error;
	
	const body = result.data;
	
	if (!['approved', 'rejected'].includes(body.status)) {
		throw apiError.badRequest('Status must be approved or rejected');
	}

	const supabase = await createSupabaseServerClient();
	const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

	console.log('[Approve] User:', user.email, 'OrgContext:', orgContext, 'TargetOrgIds:', targetOrgIds);

	// Map API status to database verification_status
	const verificationStatus = body.status === 'approved' ? 'verified' : 'rejected';

	// Get certificate details (must be in faculty's organization)
	const { data: certificate, error: certError } = await supabase
		.from('certificates')
		.select('title, institution, student_id, description, organization_id')
		.eq('id', body.certificateId)
		.in('organization_id', targetOrgIds) // Multi-org filter
		.single();

	if (certError) {
		throw apiError.notFound('Certificate not found or not in your organization');
	}

	// Get user email for notification using admin client
	let userEmail: string | undefined;
	let studentName = 'Student';
	
	try {
		const adminClient = await createSupabaseAdminClient();
		const { data: studentData, error: authError } = await adminClient.auth.admin.getUserById(certificate.student_id);
		
		if (authError) {
			console.error('[Approve] Error fetching student auth data:', authError);
		} else if (studentData?.user) {
			userEmail = studentData.user.email;
			studentName = studentData.user.user_metadata?.full_name || studentData.user.email?.split('@')[0] || 'Student';
			console.log('[Approve] Found student email:', userEmail, 'name:', studentName);
		}
	} catch (error) {
		console.error('[Approve] Failed to get student email:', error);
	}

	// Update certificate status in your DB table `certificates`
	const { error: updateErr } = await supabase
		.from('certificates')
		.update({ verification_status: verificationStatus, updated_at: new Date().toISOString() })
		.eq('id', body.certificateId);

	if (updateErr) throw apiError.internal(updateErr.message);

	// If approved and metadataId provided, update verification method to manual
	if (body.status === 'approved' && typeof body.metadataId === 'string') {
		await supabase
			.from('certificate_metadata')
			.update({ verification_method: 'manual' })
			.eq('id', body.metadataId);
	}

	// Send email notification
	if (userEmail) {
		try {
			console.log(`[Approve] Sending ${body.status} email to:`, userEmail);
			const notificationData = {
				studentName,
				certificateTitle: certificate.title,
				institution: certificate.institution,
				portfolioUrl: `${getBaseUrl()}/public/portfolio/${certificate.student_id}`,
			};

			if (body.status === 'approved') {
				const emailSent = await emailService.sendCertificateApproved(userEmail, notificationData);
				console.log(`[Approve] Certificate approved email sent: ${emailSent}`);
			} else {
				const emailSent = await emailService.sendCertificateRejected(userEmail, notificationData);
				console.log(`[Approve] Certificate rejected email sent: ${emailSent}`);
			}
		} catch (emailError) {
			console.error('[Approve] Failed to send email notification:', emailError);
			// Don't fail the request if email fails
		}
	} else {
		console.warn('[Approve] No user email found for student_id:', certificate.student_id);
	}

	// Write audit log
	try {
		const organizationIdForLog = 'organizationId' in orgContext ? orgContext.organizationId : null;
		console.log('[Approve] Creating audit log with:', {
			actor_id: user.id,
			organization_id: organizationIdForLog,
			action: body.status === 'approved' ? 'manual_approve' : 'manual_reject',
			target_id: body.certificateId,
			certificate_org_id: certificate.organization_id
		});
		
		const auditLog = await supabase.from('audit_logs').insert({
			actor_id: user.id,
			organization_id: organizationIdForLog, // Multi-org field
			action: body.status === 'approved' ? 'manual_approve' : 'manual_reject',
			target_id: body.certificateId,
			details: {
				reason: body.approveReason || body.rejectReason || null,
				metadataId: body.metadataId || null,
			},
			created_at: new Date().toISOString(),
		});
		
		if (auditLog.error) {
			console.error('[Approve] Audit log error:', auditLog.error);
		} else {
			console.log('[Approve] Audit log created successfully');
		}
	} catch (auditError) {
		console.error('[Approve] Failed to create audit log:', auditError);
		// ignore audit failures
	}

	return success(
		{ certificateId: body.certificateId, status: body.status }, 
		`Certificate ${body.status} successfully`
	);
});





