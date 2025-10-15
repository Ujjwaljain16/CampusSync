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
	
	const { data: reqRow, error: loadErr } = await supabase
		.from('role_requests')
		.select('id, user_id, requested_role, status')
		.eq('id', id)
		.single();
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

	// Audit log (optional, don't fail if it errors)
	try {
		await supabase.from('audit_logs').insert({
			user_id: reqRow.user_id,
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


