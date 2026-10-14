import { withSession, success, apiError, error as errorResponse, authorizeOrg, assertSuperAdmin, isUuid, isKnownRole, rankOf, checkRoleChange, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { getTargetRoleRow } from '@/lib/api/utils/roleIntegrity';
import { applyRoleChange } from '@/lib/api/utils/roleMutations';
import { emailService } from '@/lib/emailService';
import { getBaseUrl } from '@/lib/envValidator';

/**
 * POST /api/admin/role-requests/[id]/approve
 *
 *  1. caller must administer the REQUEST'S organization (authorizeOrg)
 *  2. you cannot approve your own request
 *  3. the request is CLAIMED first with a conditional update
 *     (status pending -> approved); a second concurrent/duplicate call gets 409
 *  4. the role is granted with the service-role client (never ensure_role,
 *     never upsert on user_id) and verified; on failure the request is put
 *     back to `pending`
 *  5. platform-level (NULL organization) recruiter approval is super_admin only
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
		console.error('[approve] load failed:', loadErr);
		return apiError.internal('Failed to load role request');
	}
	if (!reqRow) return apiError.notFound('Role request not found');

	// --- authorization against the request's organization -------------------
	let actorRole = 'super_admin';
	if (reqRow.organization_id) {
		const scope = await authorizeOrg(user, { orgId: reqRow.organization_id, minRole: 'admin' });
		actorRole = scope.role;
	} else {
		// Platform-level request (no organization): super_admin only
		await assertSuperAdmin(user);
	}

	if (reqRow.user_id === user.id) {
		return apiError.forbidden('You cannot approve your own role request');
	}
	if (!isKnownRole(reqRow.requested_role) || reqRow.requested_role === 'super_admin') {
		return apiError.validation('This request asks for a role that cannot be granted here');
	}
	if (reqRow.requested_role === 'recruiter' && !reqRow.organization_id && actorRole !== 'super_admin') {
		return apiError.forbidden('Only super admins can approve platform-level recruiter access');
	}
	if (reqRow.status !== 'pending') {
		return errorResponse('This request has already been processed', 409);
	}

	// --- hierarchy + "no accidental demotion" pre-checks --------------------
	const existing = await getTargetRoleRow(admin, reqRow.user_id, reqRow.organization_id ?? null);
	const decision = checkRoleChange({
		actorRole,
		actorId: user.id,
		targetUserId: reqRow.user_id,
		targetCurrentRole: existing?.role ?? null,
		newRole: reqRow.requested_role,
	});
	if (!decision.ok) return apiError.forbidden(decision.message);
	if (existing && existing.approval_status === 'approved' && rankOf(existing.role) >= rankOf(reqRow.requested_role)) {
		return errorResponse('The user already holds an equal or higher role in this organization', 409);
	}

	// --- claim the request atomically --------------------------------------
	const reviewedAt = new Date().toISOString();
	const { data: claimed, error: claimErr } = await admin
		.from('role_requests')
		.update({ status: 'approved', reviewed_by: user.id, reviewed_at: reviewedAt })
		.eq('id', id)
		.eq('status', 'pending')
		.select('id');
	if (claimErr) {
		console.error('[approve] claim failed:', claimErr);
		return apiError.internal('Failed to update request status');
	}
	if (!claimed || claimed.length === 0) {
		return errorResponse('This request has already been processed', 409);
	}

	// --- grant the role (and verify), roll the claim back on failure --------
	const rollbackClaim = async () => {
		const { error } = await admin
			.from('role_requests')
			.update({ status: 'pending', reviewed_by: null, reviewed_at: null })
			.eq('id', id)
			.eq('status', 'approved');
		if (error) console.error('[approve] CRITICAL: could not restore request to pending:', error);
	};

	let grant;
	try {
		grant = await applyRoleChange(admin, {
			actorId: user.id,
			actorRole,
			orgId: reqRow.organization_id ?? null,
			targetUserId: reqRow.user_id,
			newRole: reqRow.requested_role,
		});
	} catch (e) {
		console.error('[approve] grant threw:', e);
		await rollbackClaim();
		return apiError.internal('Failed to assign role');
	}
	if (!grant.ok) {
		await rollbackClaim();
		return grant.response;
	}

	const granted = await getTargetRoleRow(admin, reqRow.user_id, reqRow.organization_id ?? null);
	if (!granted || granted.role !== reqRow.requested_role || granted.approval_status !== 'approved') {
		console.error('[approve] role grant could not be verified for request', id);
		await rollbackClaim();
		return apiError.internal('Failed to assign role');
	}

	// --- notifications / audit (best effort) -------------------------------
	try {
		const { data: userData } = await admin.auth.admin.getUserById(reqRow.user_id);
		const userEmail = userData?.user?.email;
		if (userEmail) {
			let institution = 'Your Organization';
			if (reqRow.organization_id) {
				const { data: orgData } = await admin.from('organizations').select('name').eq('id', reqRow.organization_id).maybeSingle();
				if (orgData?.name) institution = orgData.name;
			}
			await emailService.sendRoleApproved(userEmail, {
				userName: userData?.user?.user_metadata?.full_name || 'User',
				requestedRole: reqRow.requested_role,
				institution,
				adminNotes: 'Your role request has been approved by the admin team.',
				dashboardUrl: `${getBaseUrl()}/dashboard`,
			});
		}
	} catch (emailError) {
		console.error('[approve] Failed to send email notification:', emailError);
	}

	await writeAudit(admin, {
		actorId: user.id,
		action: 'role_approve',
		targetType: 'role_request',
		targetId: id,
		organizationId: reqRow.organization_id ?? null,
		details: { request_id: id, user_id: reqRow.user_id, role: reqRow.requested_role },
	});

	return success(
		{ ok: true, requestId: id, userId: reqRow.user_id, role: reqRow.requested_role },
		'Role request approved successfully'
	);
});
