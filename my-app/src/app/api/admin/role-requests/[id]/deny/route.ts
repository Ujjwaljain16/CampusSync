import { NextRequest } from 'next/server';
import { success, apiError, getOrganizationContext, isRecruiterContext } from '@/lib/api';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { emailService } from '@/lib/emailService';
import { getBaseUrl } from '@/lib/envValidator';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const userWithRole = await getServerUserWithRole();
	if (!userWithRole || !['admin', 'org_admin', 'super_admin'].includes(userWithRole.role)) {
		throw apiError.forbidden('Unauthorized');
	}
	const { user } = userWithRole;
	const supabase = await createSupabaseServerClient();
	const orgContext = await getOrganizationContext(user);
	const { id } = await params;
	
	// Load request (must be in admin's organization unless super admin)
	let requestQuery = supabase
		.from('role_requests')
		.select('id, user_id, requested_role, status, organization_id')
		.eq('id', id);
	
	if (!orgContext.isSuperAdmin) {
		if (isRecruiterContext(orgContext)) {
			const orgId = orgContext.selectedOrganization || orgContext.accessibleOrganizations[0];
			if (orgId) {
				requestQuery = requestQuery.eq('organization_id', orgId);
			}
		} else {
			requestQuery = requestQuery.eq('organization_id', orgContext.organizationId);
		}
	}
	
	const { data: reqRow, error: loadErr } = await requestQuery.single();
	if (loadErr || !reqRow) throw apiError.notFound(loadErr?.message || 'Not found');
	if (reqRow.status !== 'pending') throw apiError.badRequest('Already processed');

	// Ensure admin has a profile (required for foreign key constraint)
	const { data: adminProfile } = await supabase
		.from('profiles')
		.select('id')
		.eq('id', user.id)
		.single();
	
	if (!adminProfile) {
		// Create admin profile if it doesn't exist
		console.log('[deny] Admin profile missing, creating...');
		await supabase
			.from('profiles')
			.insert({
				id: user.id,
				full_name: 'Admin User',
				email: user.email,
				role: 'admin'
			});
	}

	const { error: updateError } = await supabase
		.from('role_requests')
		.update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
		.eq('id', id);
	
	if (updateError) {
		console.error('[deny] Failed to update request status:', updateError);
		throw apiError.internal('Failed to update request status');
	}

	// Send email notification to user
	try {
		const { data: userData } = await supabase.auth.admin.getUserById(reqRow.user_id);
		const userEmail = userData?.user?.email;

		if (userEmail) {
			await emailService.sendRoleDenied(userEmail, {
				userName: userData?.user?.user_metadata?.full_name || 'User',
				requestedRole: reqRow.requested_role,
				reason: 'Your role request did not meet our verification criteria.',
				adminNotes: 'Please contact support if you have questions about this decision.',
				supportUrl: `${getBaseUrl()}/support`
			});
		}
	} catch (emailError) {
		console.error('[deny] Failed to send email notification:', emailError);
		// Don't fail the request if email fails
	}

	// Audit log (optional, don't fail if it errors)
	try {
		await supabase.from('audit_logs').insert({
			user_id: reqRow.user_id,
			organization_id: reqRow.organization_id, // Multi-org field
			action: 'role_deny',
			target_id: reqRow.user_id,
			details: { request_id: id, role: reqRow.requested_role, by: user.id },
			created_at: new Date().toISOString()
		});
	} catch (e) {
		console.warn('[deny] Audit log failed:', e);
	}

	return success({ ok: true }, 'Role request denied successfully');
}


