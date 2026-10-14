import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { apiError } from '@/lib/api';
import { safeRedirectPath } from '@/lib/safeRedirect';
import { authCookieOptions } from '@/lib/supabase/cookieOptions';

async function handleGet(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const redirectTo = safeRedirectPath(searchParams.get('redirectTo'));

	// Prepare a response object to collect cookie writes
	const url = new URL(request.url);
	const response = new NextResponse(null, { headers: new Headers() });

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookieOptions: authCookieOptions(),
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

	// Derive base URL from the incoming request
	const baseUrl = `${url.protocol}//${url.host}`;
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: `${baseUrl}/api/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
			queryParams: { access_type: 'offline', prompt: 'consent' },
		},
	});

	if (error || !data.url) {
		console.error('OAuth init failed:', error?.message);
		throw apiError.internal('Failed to initialize OAuth');
	}

	// Convert the prepared response into a redirect so cookies are preserved
	response.headers.set('Location', data.url);
	return new NextResponse(null, { status: 302, headers: response.headers });
}



export async function GET(request: NextRequest) {
	try {
		return await handleGet(request);
	} catch (err) {
		if (err instanceof Response) return err;
		console.error('[oauth/google] unexpected error', err);
		return apiError.internal('Failed to initialize OAuth');
	}
}
