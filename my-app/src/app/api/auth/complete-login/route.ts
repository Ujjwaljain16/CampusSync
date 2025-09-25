import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function getRedirectForRole(role: string | null | undefined): string {
	if (role === 'student') return '/student/dashboard';
	if (role === 'faculty') return '/faculty/dashboard';
	if (role === 'recruiter') return '/recruiter/dashboard';
	if (role === 'admin') return '/dashboard';
	return '/dashboard';
}

export async function POST(request: NextRequest) {
	try {
		const { access_token, refresh_token } = await request.json();

		if (!access_token || !refresh_token) {
			return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
		}

		// Prepare response to capture auth cookies
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

		// Establish session
		const { error: setSessionError } = await supabase.auth.setSession({ access_token, refresh_token });
		if (setSessionError) {
			console.error('[complete-login] setSessionError:', setSessionError);
			return NextResponse.json({ error: setSessionError.message || 'Failed to set session' }, { status: 500 });
		}

		// Identify user and role using the newly established session (RLS-aware)
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			console.error('[complete-login] getUser error:', userError);
			return NextResponse.json({ error: userError?.message || 'User not found after login' }, { status: 500 });
		}

		let role: string | null = null;
		try {
			const { data: roles, error: roleError } = await supabase
				.from('user_roles')
				.select('role')
				.eq('user_id', user.id)
				.limit(1);
			if (roleError) {
				console.error('[complete-login] role query error:', roleError);
			}
			role = roles && roles.length > 0 ? (roles[0] as any).role : null;
		} catch (e) {
			console.error('[complete-login] role query exception:', e);
			role = null;
		}

		const redirectTo = getRedirectForRole(role);
		return NextResponse.json({ ok: true, redirectTo }, { status: 200, headers: response.headers });
	} catch (error: any) {
		console.error('[complete-login] unexpected error:', error);
		return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
	}
}


