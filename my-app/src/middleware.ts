import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
	const res = NextResponse.next();

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return req.cookies.getAll();
				},
				setAll(cookies) {
					cookies.forEach(({ name, value, options }) => {
						res.cookies.set({ name, value, ...options });
					});
				},
			},
		}
	);

	const { data } = await supabase.auth.getUser();

	// Protect app routes except public ones
	const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
	const isPublic = isAuthRoute || req.nextUrl.pathname === '/' || req.nextUrl.pathname.startsWith('/public');

	if (!isPublic && !data.user) {
		const loginUrl = new URL('/login', req.url);
		loginUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
		return NextResponse.redirect(loginUrl);
	}

	return res;
}

export const config = {
	matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};


