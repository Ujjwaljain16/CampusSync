import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withAuth, success, apiError, parseAndValidateBody, getOrganizationContext } from '@/lib/api';

const ALLOWED_ROLES = ['recruiter', 'faculty', 'admin'] as const;

interface RoleRequestBody {
	requested_role: string;
	metadata?: Record<string, unknown>;
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
	const supabase = await createSupabaseServerClient();
	
	// Get organization context for multi-tenancy
	const orgContext = await getOrganizationContext(user);
	
	const result = await parseAndValidateBody<RoleRequestBody>(req, ['requested_role']);
	if (result.error) return result.error;
	
	const { requested_role, metadata } = result.data;
	
	if (!ALLOWED_ROLES.includes(requested_role as typeof ALLOWED_ROLES[number])) {
		throw apiError.badRequest('Invalid requested_role. Must be one of: recruiter, faculty, admin');
	}
	
	const { error } = await supabase
		.from('role_requests')
		.insert({ 
			user_id: user.id,
			organization_id: 'organizationId' in orgContext ? orgContext.organizationId : null, // Multi-org support
			requested_role, 
			metadata: metadata || {} 
		});
	
	if (error) throw apiError.internal(error.message);
	
	return success({ ok: true }, 'Role request submitted successfully');
});



