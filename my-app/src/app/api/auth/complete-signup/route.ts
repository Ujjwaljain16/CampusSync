import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function coerceProfilePayload(base: Record<string, any>, extras: Record<string, any>) {
	// Build initial payload using safe known columns
	const payload: Record<string, any> = {
		id: base.id,
		full_name: extras.full_name,
		role: 'student',
	};
	// Optimistically include optional fields if present in request
	['university', 'graduation_year', 'major', 'location', 'gpa'].forEach((k) => {
		if (extras[k] !== undefined && extras[k] !== null && extras[k] !== '') {
			payload[k] = extras[k];
		}
	});
	return payload;
}

export async function POST(request: NextRequest) {
	try {
		const { access_token, refresh_token, full_name, university, graduation_year, major, location, gpa } = await request.json();

		if (!access_token || !refresh_token || !full_name) {
			return NextResponse.json({ error: 'Missing tokens or full_name' }, { status: 400 });
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

		// Establish session first so RLS allows profile/roles writes
		const { error: setSessionError } = await supabase.auth.setSession({ access_token, refresh_token });
		if (setSessionError) {
			console.error('[complete-signup] setSessionError:', setSessionError);
			return NextResponse.json({ error: setSessionError.message || 'Failed to set session' }, { status: 500 });
		}

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			console.error('[complete-signup] getUser error:', userError);
			return NextResponse.json({ error: userError?.message || 'User not found' }, { status: 500 });
		}

		// Upsert profile with best-effort extras; fall back to minimal if schema lacks columns
		const attempt = coerceProfilePayload({ id: user.id }, { full_name, university, graduation_year, major, location, gpa });
		let profileError: any = null;
		try {
			const { error } = await supabase.from('profiles').upsert(attempt, { onConflict: 'id' });
			profileError = error;
		} catch (e: any) {
			console.error('[complete-signup] profile upsert exception:', e);
			profileError = e;
		}
		if (profileError) {
			// Retry with only known-safe columns
			const minimal = { id: user.id, full_name, role: 'student' };
			const { error: retryErr } = await supabase.from('profiles').upsert(minimal, { onConflict: 'id' });
			if (retryErr) {
				console.error('[complete-signup] minimal profile upsert failed:', retryErr);
				return NextResponse.json({ error: retryErr.message || 'Profile upsert failed' }, { status: 500 });
			}
		}

		// Ensure user_roles has student role (best-effort under RLS)
		try {
			const { error: roleErr } = await supabase
				.from('user_roles')
				.upsert({ user_id: user.id, role: 'student', assigned_by: user.id }, { onConflict: 'user_id' });
			if (roleErr) {
				console.error('[complete-signup] role upsert error:', roleErr);
				// Ignore RLS errors – role may already exist, and middleware gates access anyway
			}
		} catch (e) {
			console.error('[complete-signup] role write exception:', e);
		}

		return response;
	} catch (error: any) {
		console.error('[complete-signup] unexpected error:', error);
		return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
	}
}


