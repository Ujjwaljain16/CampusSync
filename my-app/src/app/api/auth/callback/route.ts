import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const redirectTo = url.searchParams.get('redirectTo') || '/';

	if (!code) {
		const absolute = `${url.protocol}//${url.host}${redirectTo}`;
		return NextResponse.redirect(absolute);
	}

	// Prepare response for cookie writes during session exchange
	const response = new NextResponse(null, { headers: new Headers() });
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
						response.cookies.set({ name, value, ...options });
					});
				},
			},
		}
	);

	const { error } = await supabase.auth.exchangeCodeForSession(code);

	const base = `${url.protocol}//${url.host}`;
	if (error) {
		const errorUrl = `${base}/login?error=${encodeURIComponent(error.message)}`;
		response.headers.set('Location', errorUrl);
		return new NextResponse(null, { status: 302, headers: response.headers });
	}

	const dest = redirectTo.startsWith('http') ? redirectTo : `${base}${redirectTo}`;
	response.headers.set('Location', dest);
	return new NextResponse(null, { status: 302, headers: response.headers });
}


