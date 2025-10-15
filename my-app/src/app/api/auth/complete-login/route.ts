import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { apiError, parseAndValidateBody } from '@/lib/api';

function getRedirectForRole(role: string | null | undefined): string {
	if (role === 'student') return '/student/dashboard';
	if (role === 'faculty') return '/faculty/dashboard';
	if (role === 'recruiter') return '/recruiter/dashboard';
	if (role === 'admin') return '/dashboard';
	return '/dashboard';
}

interface LoginBody {
  access_token: string;
  refresh_token: string;
}

export async function POST(request: NextRequest) {
	const result = await parseAndValidateBody<LoginBody>(request, ['access_token', 'refresh_token']);
	if (result.error) return result.error;
	
	const { access_token, refresh_token } = result.data;

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
		throw apiError.internal(setSessionError.message || 'Failed to set session');
	}

	// Identify user and role using the newly established session (RLS-aware)
	const { data: { user }, error: userError } = await supabase.auth.getUser();
	if (userError || !user) {
		console.error('[complete-login] getUser error:', userError);
		throw apiError.internal(userError?.message || 'User not found after login');
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
		role = roles && roles.length > 0 ? (roles[0] as Record<string, unknown>).role as string : null;
	} catch (e) {
		console.error('[complete-login] role query exception:', e);
		role = null;
	}

	const redirectTo = getRedirectForRole(role);
	return NextResponse.json({ ok: true, redirectTo }, { status: 200, headers: response.headers });
}


