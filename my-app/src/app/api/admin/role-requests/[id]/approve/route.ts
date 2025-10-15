import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { user, role } = await getServerUserWithRole();
	if (!user || role !== 'admin') {
		throw apiError.forbidden('Unauthorized');
	}
	const supabase = await createSupabaseServerClient();
	const { id } = await params;
	
	// Load request
	const { data: reqRow, error: loadErr } = await supabase
		.from('role_requests')
		.select('id, user_id, requested_role, status')
		.eq('id', id)
		.single();
	if (loadErr || !reqRow) throw apiError.notFound(loadErr?.message || 'Not found');
	if (reqRow.status !== 'pending') throw apiError.badRequest('Already processed');

	// Grant role via RPC (try but don't fail if RPC doesn't exist)
	try {
		await supabase.rpc('ensure_role', { p_user_id: reqRow.user_id, p_role: reqRow.requested_role });
	} catch (e) {
		console.warn('[approve] RPC ensure_role failed, will insert directly:', e);
	}
	
	// Ensure role is in user_roles table (fallback if RPC failed)
	const { error: roleInsertError } = await supabase
		.from('user_roles')
		.upsert({
			user_id: reqRow.user_id,
			role: reqRow.requested_role,
			assigned_by: user.id,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}, { onConflict: 'user_id' });
	
	if (roleInsertError) {
		console.error('[approve] Failed to assign role:', roleInsertError);
		throw apiError.internal('Failed to assign role');
	}
	
	// Ensure admin has a profile (required for foreign key constraint)
	const { data: adminProfile } = await supabase
		.from('profiles')
		.select('id')
		.eq('id', user.id)
		.single();
	
	if (!adminProfile) {
		// Create admin profile if it doesn't exist
		console.log('[approve] Admin profile missing, creating...');
		await supabase
			.from('profiles')
			.insert({
				id: user.id,
				full_name: 'Admin User',
				email: user.email,
				role: 'admin'
			});
	}
	
	// Update request status
	const { error: updateError } = await supabase
		.from('role_requests')
		.update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
		.eq('id', id);
	
	if (updateError) {
		console.error('[approve] Failed to update request status:', updateError);
		throw apiError.internal('Failed to update request status');
	}
	
	console.log('[approve] Successfully approved request:', id, 'for user:', reqRow.user_id);

	// Audit log (optional, don't fail if it errors)
	try {
		await supabase.from('audit_logs').insert({
			user_id: reqRow.user_id,
			action: 'role_approve',
			target_id: reqRow.user_id,
			details: { request_id: id, role: reqRow.requested_role, by: user.id },
			created_at: new Date().toISOString()
		});
	} catch (e) {
		console.warn('[approve] Audit log failed:', e);
	}

	return success({ 
		ok: true, 
		requestId: id,
		userId: reqRow.user_id,
		role: reqRow.requested_role
	}, 'Role request approved successfully');
}


