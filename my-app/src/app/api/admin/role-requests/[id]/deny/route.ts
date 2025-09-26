import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '../../../../../../../lib/supabaseServer';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
	const { user, role } = await getServerUserWithRole();
	if (!user || role !== 'admin') {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const supabase = await createSupabaseServerClient();
	const id = params.id;
	const { data: reqRow, error: loadErr } = await supabase
		.from('role_requests')
		.select('id, user_id, requested_role, status')
		.eq('id', id)
		.single();
	if (loadErr || !reqRow) return NextResponse.json({ error: loadErr?.message || 'Not found' }, { status: 404 });
	if (reqRow.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 400 });

	await supabase
		.from('role_requests')
		.update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
		.eq('id', id);

	await supabase.from('audit_logs').insert({
		user_id: reqRow.user_id,
		action: 'role_deny',
		target_id: reqRow.user_id,
		details: { request_id: id, role: reqRow.requested_role, by: user.id },
		created_at: new Date().toISOString()
	}).catch(()=>null);

	return NextResponse.json({ ok: true });
}


