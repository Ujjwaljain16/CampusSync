import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, apiError, error as errorResponse, parseAndValidateBody, getOrganizationContext, rankOf } from '@/lib/api';

const ALLOWED_ROLES = ['recruiter', 'faculty', 'admin'] as const;
const MAX_METADATA_BYTES = 4096;

interface RoleRequestBody {
	requested_role: string;
	metadata?: Record<string, unknown>;
	organization_id?: string;
}

/**
 * POST /api/role-requests
 * A signed-in user asks for a higher role in ONE organization they belong to.
 * Nothing is granted here; an admin of that organization decides.
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
	const supabase = await createSupabaseServerClient();

	const result = await parseAndValidateBody<RoleRequestBody>(req, ['requested_role']);
	if (result.error) return result.error;

	const { requested_role, metadata, organization_id } = result.data;

	if (!ALLOWED_ROLES.includes(requested_role as typeof ALLOWED_ROLES[number])) {
		return apiError.badRequest('Invalid requested_role. Must be one of: recruiter, faculty, admin');
	}
	if (metadata !== undefined) {
		if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata) ||
			JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
			return apiError.validation('metadata must be a small JSON object');
		}
	}

	// Membership is verified (approved row in that org) by getOrganizationContext
	const orgContext = await getOrganizationContext(user, organization_id ?? null);
	const organizationId = 'organizationId' in orgContext ? orgContext.organizationId : null;

	// Already holds an equal or higher role there?
	if ('role' in orgContext && rankOf(orgContext.role) >= rankOf(requested_role)) {
		return errorResponse('You already hold an equal or higher role', 409);
	}

	// One open request per (user, organization, role)
	let dup = supabase
		.from('role_requests')
		.select('id')
		.eq('user_id', user.id)
		.eq('requested_role', requested_role)
		.eq('status', 'pending');
	dup = organizationId ? dup.eq('organization_id', organizationId) : dup.is('organization_id', null);
	const { data: existing } = await dup.limit(1);
	if (existing && existing.length > 0) {
		return errorResponse('You already have a pending request for this role', 409);
	}

	const { error } = await supabase
		.from('role_requests')
		.insert({
			user_id: user.id,
			organization_id: organizationId,
			requested_role,
			metadata: metadata || {}
		});

	if (error) {
		console.error('[role-requests] insert failed:', error);
		return apiError.internal('Failed to submit role request');
	}

	return success({ ok: true }, 'Role request submitted successfully');
});
