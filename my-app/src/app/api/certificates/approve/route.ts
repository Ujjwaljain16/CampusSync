import { NextRequest, NextResponse } from 'next/server';
import { requireRole, createSupabaseServerClient } from '../../../../../lib/supabaseServer';

export async function POST(req: NextRequest) {
	const auth = await requireRole(['faculty', 'admin']);
	if (!auth.authorized) {
		return NextResponse.json({ error: auth.message }, { status: auth.status });
	}

	const body = await req.json().catch(() => null);
	if (!body || typeof body.certificateId !== 'string' || typeof body.status !== 'string') {
		return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
	}

	if (!['approved', 'rejected'].includes(body.status)) {
		return NextResponse.json({ error: 'Status must be approved or rejected' }, { status: 400 });
	}

	const supabase = await createSupabaseServerClient();
	// Update certificate status in your DB table `certificates`
	const { error } = await supabase
		.from('certificates')
		.update({ verification_status: body.status, updated_at: new Date().toISOString() })
		.eq('id', body.certificateId);

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ data: { certificateId: body.certificateId, status: body.status } });
}


