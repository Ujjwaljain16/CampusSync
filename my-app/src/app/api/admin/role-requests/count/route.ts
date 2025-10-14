import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';

export async function GET() {
	const { user, role } = await getServerUserWithRole();
	if (!user || role !== 'admin') {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const supabase = await createSupabaseServerClient();
	const { count } = await supabase
		.from('role_requests')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'pending');
	return NextResponse.json({ pending: count || 0 });
}



