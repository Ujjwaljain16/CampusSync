import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
	try {
		const response = NextResponse.json({ ok: true });
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					getAll() {
						return request.cookies.getAll();
					},
					setAll(cookies) {
						cookies.forEach(({ name, value, options }) => {
							response.cookies.set(name, value, options);
						});
					},
				},
			}
		);

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: userError?.message || 'Not authenticated' }, { status: 401 });
		}

		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('*')
			.eq('id', user.id)
			.single();

		if (profileError) {
			return NextResponse.json({ error: profileError.message || 'Profile not found' }, { status: 404 });
		}

		return NextResponse.json({ data: profile });
	} catch (error: any) {
		return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json().catch(() => ({}));
		const {
			full_name,
			university,
			graduation_year,
			major,
			location,
			gpa,
		} = body || {};

		if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
			return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
		}

		const response = NextResponse.json({ ok: true });
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					getAll() {
						return request.cookies.getAll();
					},
					setAll(cookies) {
						cookies.forEach(({ name, value, options }) => {

							response.cookies.set(name, value, options);
						});
					},
				},
			}
		);

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: userError?.message || 'Not authenticated' }, { status: 401 });
		}

		// Build payload using best-effort columns
		const payload: Record<string, any> = { id: user.id, full_name: full_name.trim(), role: 'student' };
		if (university) payload.university = String(university);
		if (graduation_year) payload.graduation_year = Number(graduation_year);
		if (major) payload.major = String(major);
		if (location) payload.location = String(location);
		if (gpa !== undefined && gpa !== null && gpa !== '') payload.gpa = Number(gpa);

		let upsertErr: any = null;
		try {
			const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
			upsertErr = error;
		} catch (e) {
			upsertErr = e;
		}
		if (upsertErr) {
			// Fallback to minimal
			const { error } = await supabase.from('profiles').upsert({ id: user.id, full_name: full_name.trim(), role: 'student' }, { onConflict: 'id' });
			if (error) {
				return NextResponse.json({ error: error.message || 'Profile update failed' }, { status: 500 });
			}
		}

		return response;
	} catch (error: any) {
		return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
	}
}


