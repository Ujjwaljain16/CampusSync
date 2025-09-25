import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
	const res = NextResponse.next();
	const isDev = process.env.NODE_ENV !== 'production';

	// Check if environment variables are set
	if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
		console.error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
		// Redirect to setup page if environment is not configured
		if (!req.nextUrl.pathname.startsWith('/setup')) {
			return NextResponse.redirect(new URL('/setup', req.url));
		}
		return res;
	}

	// Determine route type early and short-circuit public routes BEFORE creating Supabase client
	const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
	const isSetupRoute = req.nextUrl.pathname.startsWith('/setup') || req.nextUrl.pathname.startsWith('/admin/setup');
	const isDebugRoute = req.nextUrl.pathname.startsWith('/debug-') || req.nextUrl.pathname.startsWith('/test-');
	const isHome = req.nextUrl.pathname === '/';
	const isPublic = isAuthRoute || isHome || req.nextUrl.pathname.startsWith('/public') || isSetupRoute || isDebugRoute;

	if (isPublic) {
		return res;
	}

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

	// Single auth call (faster/safer in middleware)
	const { data: { user: finalUser }, error: getUserError } = await supabase.auth.getUser();
	if (isDev) {
		console.log('Middleware - getUser:', {
			hasUser: !!finalUser,
			userEmail: finalUser?.email,
			userError: getUserError?.message,
			path: req.nextUrl.pathname
		});
	}

	// If user is authenticated and trying to access login, redirect to dashboard
	if (finalUser && isAuthRoute) {
		if (isDev) console.log('Authenticated user accessing login, redirecting to dashboard');
		return NextResponse.redirect(new URL('/dashboard', req.url));
	}

	if (!isPublic && !finalUser) {
		if (isDev) console.log('Unauthenticated user accessing protected route, redirecting to login');
		const loginUrl = new URL('/login', req.url);
		loginUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
		return NextResponse.redirect(loginUrl);
	}

	return res;
}

export const config = {
	matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};


