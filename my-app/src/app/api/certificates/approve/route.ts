import { NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { emailService } from '../../../../../lib/emailService';

interface ApproveBody {
	certificateId: string;
	status: 'approved' | 'rejected';
	metadataId?: string;
	approveReason?: string;
	rejectReason?: string;
}

export const POST = withRole(['faculty', 'admin'], async (req: NextRequest) => {
	const result = await parseAndValidateBody<ApproveBody>(req, ['certificateId', 'status']);
	if (result.error) return result.error;
	
	const body = result.data;
	
	if (!['approved', 'rejected'].includes(body.status)) {
		throw apiError.badRequest('Status must be approved or rejected');
	}

	const supabase = await createSupabaseServerClient();

	// Map API status to database verification_status
	const verificationStatus = body.status === 'approved' ? 'verified' : 'rejected';

	// Get certificate details for email notification
	const { data: certificate, error: certError } = await supabase
		.from('certificates')
		.select('title, institution, user_id, description')
		.eq('id', body.certificateId)
		.single();

	if (certError) {
		throw apiError.notFound('Certificate not found');
	}

	// Get user email for notification
	const { data: user } = await supabase.auth.admin.getUserById(certificate.user_id);
	const userEmail = user?.user?.email;

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
			const notificationData = {
				studentName: user?.user?.user_metadata?.full_name || 'Student',
				certificateTitle: certificate.title,
				institution: certificate.institution,
				portfolioUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/public/portfolio/${certificate.user_id}`,
			};

			if (body.status === 'approved') {
				await emailService.sendCertificateApproved(userEmail, notificationData);
			} else {
				await emailService.sendCertificateRejected(userEmail, notificationData);
			}
		} catch (emailError) {
			console.error('Failed to send email notification:', emailError);
			// Don't fail the request if email fails
		}
	}

	// Write audit log if possible
	try {
		const { user } = await getServerUserWithRole();
		await supabase.from('audit_logs').insert({
			user_id: user?.id ?? null,
			action: body.status === 'approved' ? 'manual_approve' : 'manual_reject',
			target_id: body.certificateId,
			details: {
				reason: body.approveReason || body.rejectReason || null,
				metadataId: body.metadataId || null,
			},
			created_at: new Date().toISOString(),
		});
	} catch {
		// ignore audit failures
	}

	return success(
		{ certificateId: body.certificateId, status: body.status }, 
		`Certificate ${body.status} successfully`
	);
});



