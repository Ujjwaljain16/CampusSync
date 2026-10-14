import { withSession, success, apiError, error as errorResponse, authorizeOrg, assertSuperAdmin, isUuid, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { emailService } from '@/lib/emailService';
import { getBaseUrl } from '@/lib/envValidator';

/**
 * POST /api/admin/role-requests/[id]/deny
 * Caller must administer the request's organization. The request is claimed
 * with a conditional update (pending -> rejected) so a request is processed once.
 */
export const POST = withSession<{ id: string }>(async (_req, { user, params }) => {
	const { id } = params;
	if (!isUuid(id)) return apiError.badRequest('Invalid request id');

	const admin = await createSupabaseAdminClient();

	const { data: reqRow, error: loadErr } = await admin
		.from('role_requests')
		.select('id, user_id, requested_role, status, organization_id')
		.eq('id', id)
		.maybeSingle();
	if (loadErr) {
		console.error('[deny] load failed:', loadErr);
		return apiError.internal('Failed to load role request');
	}
	if (!reqRow) return apiError.notFound('Role request not found');

	if (reqRow.organization_id) {
		await authorizeOrg(user, { orgId: reqRow.organization_id, minRole: 'admin' });
	} else {
		await assertSuperAdmin(user);
	}

	if (reqRow.status !== 'pending') {
		return errorResponse('This request has already been processed', 409);
	}

	const { data: claimed, error: updateError } = await admin
		.from('role_requests')
		.update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
		.eq('id', id)
		.eq('status', 'pending')
		.select('id');
	if (updateError) {
		console.error('[deny] Failed to update request status:', updateError);
		return apiError.internal('Failed to update request status');
	}
	if (!claimed || claimed.length === 0) {
		return errorResponse('This request has already been processed', 409);
	}

	try {
		const { data: userData } = await admin.auth.admin.getUserById(reqRow.user_id);
		const userEmail = userData?.user?.email;
		if (userEmail) {
			await emailService.sendRoleDenied(userEmail, {
				userName: userData?.user?.user_metadata?.full_name || 'User',
				requestedRole: reqRow.requested_role,
				reason: 'Your role request did not meet our verification criteria.',
				adminNotes: 'Please contact support if you have questions about this decision.',
				supportUrl: `${getBaseUrl()}/support`,
			});
		}
	} catch (emailError) {
		console.error('[deny] Failed to send email notification:', emailError);
	}

	await writeAudit(admin, {
		actorId: user.id,
		action: 'role_deny',
		targetType: 'role_request',
		targetId: id,
		organizationId: reqRow.organization_id ?? null,
		details: { request_id: id, user_id: reqRow.user_id, role: reqRow.requested_role },
	});

	return success({ ok: true }, 'Role request denied successfully');
});
