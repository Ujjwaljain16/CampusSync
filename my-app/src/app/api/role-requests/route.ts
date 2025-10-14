import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
	try {
		const supabase = await createSupabaseServerClient();
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		const { requested_role, metadata } = await req.json().catch(() => ({}));
		if (!requested_role || !['recruiter','faculty','admin'].includes(requested_role)) {
			return NextResponse.json({ error: 'Invalid requested_role' }, { status: 400 });
		}
		const { error } = await supabase.from('role_requests').insert({ user_id: user.id, requested_role, metadata: metadata || {} });
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}
		return NextResponse.json({ ok: true });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
	}
}



