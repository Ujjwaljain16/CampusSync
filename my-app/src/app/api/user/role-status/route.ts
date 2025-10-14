import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET() {
	try {
		const supabase = await createSupabaseServerClient();
		
		// Get current user
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		// Get user's role from user_roles table
		const { data: roleData, error: roleError } = await supabase
			.from('user_roles')
			.select('role')
			.eq('user_id', user.id)
			.single();
		
		if (roleError) {
			// No role assigned yet, still pending
			return NextResponse.json({ 
				role: null, 
				status: 'pending',
				message: 'Role request pending approval'
			});
		}
		
		// Return the user's current role
		return NextResponse.json({ 
			role: roleData.role,
			status: 'approved',
			userId: user.id
		});
		
	} catch (error: any) {
		console.error('[role-status] Error:', error);
		return NextResponse.json({ 
			error: error?.message || 'Failed to check role status' 
		}, { status: 500 });
	}
}
