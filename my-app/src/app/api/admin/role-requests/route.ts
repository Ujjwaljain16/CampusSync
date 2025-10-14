import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
	try {
		const { user, role } = await getServerUserWithRole();
		if (!user || role !== 'admin') {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		const { searchParams } = new URL(req.url);
		const status = searchParams.get('status') || 'pending';
		const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
		const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

		const supabase = await createSupabaseServerClient();
		let query = supabase
			.from('role_requests')
			.select('id, user_id, requested_role, metadata, status, reviewed_by, reviewed_at, created_at')
			.eq('status', status)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		const { data, error } = await query;
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		// join minimal profile info
		const userIds = Array.from(new Set((data || []).map(r => r.user_id)));
		let profiles: any[] = [];
		if (userIds.length > 0) {
			const { data: profs } = await supabase
				.from('profiles')
				.select('id, full_name')
				.in('id', userIds);
			profiles = profs || [];
		}
		const profileMap = new Map(profiles.map(p => [p.id, p]));
		const enriched = (data || []).map(r => ({
			...r,
			requester: profileMap.get(r.user_id) || null,
		}));

		return NextResponse.json({ data: enriched, pagination: { limit, offset } });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
	}
}



