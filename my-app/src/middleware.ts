import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(req: NextRequest) {
	const isDev = process.env.NODE_ENV !== 'production';

	// Check if environment variables are set
	if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
		console.error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
		// Redirect to setup page if environment is not configured
		if (!req.nextUrl.pathname.startsWith('/setup')) {
			return NextResponse.redirect(new URL('/setup', req.url));
		}
		return NextResponse.next();
	}

	// Determine route type early and short-circuit public routes BEFORE creating Supabase client
	const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
	const isSetupRoute = req.nextUrl.pathname.startsWith('/setup') || req.nextUrl.pathname.startsWith('/admin/setup');
	const isDebugRoute = req.nextUrl.pathname.startsWith('/debug-') || req.nextUrl.pathname.startsWith('/test-');
	const isHome = req.nextUrl.pathname === '/';
	const isPublic = isAuthRoute || isHome || req.nextUrl.pathname.startsWith('/public') || isSetupRoute || isDebugRoute;

	// Update session and get user
	const { supabaseResponse, user } = await updateSession(req);
	
	if (isDev) {
		console.log('Middleware - getUser:', {
			hasUser: !!user,
			userEmail: user?.email,
			path: req.nextUrl.pathname
		});
	}

	// If user is authenticated and trying to access login, redirect to dashboard
	if (user && isAuthRoute) {
		if (isDev) console.log('Authenticated user accessing login, redirecting to dashboard');
		return NextResponse.redirect(new URL('/dashboard', req.url));
	}

	if (!isPublic && !user) {
		if (isDev) console.log('Unauthenticated user accessing protected route, redirecting to login');
		const loginUrl = new URL('/login', req.url);
		loginUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
		return NextResponse.redirect(loginUrl);
	}

	return supabaseResponse;
}

export const config = {
	matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};


