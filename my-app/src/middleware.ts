import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
	const res = NextResponse.next();

	// Check if environment variables are set
	if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
		console.error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
		// Redirect to setup page if environment is not configured
		if (!req.nextUrl.pathname.startsWith('/setup')) {
			return NextResponse.redirect(new URL('/setup', req.url));
		}
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

	// Try getSession first as it's more reliable for middleware
	const { data: { session }, error: sessionError } = await supabase.auth.getSession();
	const user = session?.user;
	
	// Debug logging for authentication
	console.log('Middleware - getSession result:', {
		hasSession: !!session,
		hasUser: !!user,
		userEmail: user?.email,
		sessionError: sessionError?.message,
		path: req.nextUrl.pathname
	});
	
	// If getSession fails, try getUser as fallback
	let fallbackUser = null;
	if (sessionError || !user) {
		try {
			const { data: { user: userData }, error: userError } = await supabase.auth.getUser();
			fallbackUser = userData;
			console.log('Middleware - getUser fallback:', {
				hasUser: !!fallbackUser,
				userEmail: fallbackUser?.email,
				userError: userError?.message
			});
		} catch (error) {
			console.log('Middleware - getUser error:', error);
		}
	}
	
	const finalUser = user || fallbackUser;

	// Protect app routes except public ones
	const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
	const isSetupRoute = req.nextUrl.pathname.startsWith('/setup') || req.nextUrl.pathname.startsWith('/admin/setup');
	const isDebugRoute = req.nextUrl.pathname.startsWith('/debug-') || req.nextUrl.pathname.startsWith('/test-');
	const isPublic = isAuthRoute || req.nextUrl.pathname === '/' || req.nextUrl.pathname.startsWith('/public') || isSetupRoute || isDebugRoute;

	// If user is authenticated and trying to access login, redirect to dashboard
	if (finalUser && isAuthRoute) {
		console.log('Authenticated user accessing login, redirecting to dashboard');
		return NextResponse.redirect(new URL('/dashboard', req.url));
	}

	if (!isPublic && !finalUser) {
		console.log('Unauthenticated user accessing protected route, redirecting to login');
		const loginUrl = new URL('/login', req.url);
		loginUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
		return NextResponse.redirect(loginUrl);
	}

	return res;
}

export const config = {
	matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};


