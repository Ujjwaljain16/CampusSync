import { NextRequest, NextResponse } from 'next/server';
import { requireRole, createSupabaseServerClient, getServerUserWithRole } from '../../../../../lib/supabaseServer';
import { emailService } from '../../../../../lib/emailService';

export async function POST(req: NextRequest) {
	const auth = await requireRole(['faculty', 'admin']);
	if (!auth.authorized) {
		return NextResponse.json({ error: auth.message }, { status: auth.status });
	}

	const body = await req.json().catch(() => null);
	if (!body || typeof body.certificateId !== 'string' || typeof body.status !== 'string') {
		return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
	}

	if (!['approved', 'rejected'].includes(body.status)) {
		return NextResponse.json({ error: 'Status must be approved or rejected' }, { status: 400 });
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
		return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
	}

	// Get user email for notification
	const { data: user, error: userError } = await supabase.auth.admin.getUserById(certificate.user_id);
	const userEmail = user?.user?.email;

	// Update certificate status in your DB table `certificates`
	const { error: updateErr } = await supabase
		.from('certificates')
		.update({ verification_status: verificationStatus, updated_at: new Date().toISOString() })
		.eq('id', body.certificateId);

	if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

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
			entity_type: 'certificate',
			entity_id: body.certificateId,
			details: {
				reason: body.approveReason || body.rejectReason || null,
				metadataId: body.metadataId || null,
			},
			created_at: new Date().toISOString(),
		});
	} catch {
		// ignore audit failures
	}

	return NextResponse.json({ data: { certificateId: body.certificateId, status: body.status } });
}


