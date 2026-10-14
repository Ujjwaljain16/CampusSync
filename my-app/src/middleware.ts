import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { logger } from '@/lib/logger';

export async function middleware(req: NextRequest) {
	const isDev = process.env.NODE_ENV !== 'production';

	// Dev-only diagnostic pages must never be reachable in production
	if (!isDev && (req.nextUrl.pathname.startsWith('/test-') || req.nextUrl.pathname.startsWith('/debug-'))) {
		return new NextResponse(null, { status: 404 });
	}

	// NOTE: only the Supabase URL / anon key are critical for the site as a whole
	// (checked below). Feature-level keys (Gemini, VC issuer, SMTP) must degrade
	// the specific feature, never take the whole site (including /login) offline.
	// /api/* is excluded by the matcher: every API route enforces its own auth.

	// Check if environment variables are set
	if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
		logger.error('Missing Supabase environment variables', { 
			message: 'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY' 
		});
		// Redirect to setup page if environment is not configured
		if (!req.nextUrl.pathname.startsWith('/setup')) {
			return NextResponse.redirect(new URL('/setup', req.url));
		}
		return NextResponse.next();
	}

	// Determine route type early and short-circuit public routes BEFORE creating Supabase client
	const isAuthRoute = req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/signup');
	const isPasswordResetRoute = req.nextUrl.pathname.startsWith('/reset-password');
	const isAuthCallbackRoute = req.nextUrl.pathname.startsWith('/auth/confirm');
	const isSetupRoute = req.nextUrl.pathname.startsWith('/setup') || req.nextUrl.pathname.startsWith('/admin/setup');
	const isWaitingRoute = req.nextUrl.pathname.startsWith('/waiting') || req.nextUrl.pathname.startsWith('/faculty/waiting') || req.nextUrl.pathname.startsWith('/recruiter/waiting');
	const isHome = req.nextUrl.pathname === '/';
	const isWellKnown = req.nextUrl.pathname === '/.well-known' || req.nextUrl.pathname.startsWith('/.well-known/');
	const isPublic = isWellKnown || isAuthRoute || isPasswordResetRoute || isAuthCallbackRoute || isHome || req.nextUrl.pathname.startsWith('/public') || isSetupRoute || isWaitingRoute || req.nextUrl.pathname === '/verify/sd';

	// Update session and get user
	const { supabaseResponse, user, supabase } = await updateSession(req);
	
	if (isDev) {
		logger.debug('Middleware - getUser', {
			hasUser: !!user,
			path: req.nextUrl.pathname
		});
	}

	// If user is authenticated and trying to access login/signup, redirect based on role
	if (user && isAuthRoute) {
		if (isDev) logger.debug('Authenticated user accessing login/signup');
		
		// Check user's roles and approval status (user may have multiple roles)
		const { data: roles, error: roleError } = await supabase
			.from('user_roles')
			.select('role, approval_status')
			.eq('user_id', user.id);
		
		if (isDev) {
			logger.debug('User roles loaded', { roles, roleError });
		}
		
		// Check if user has faculty role with pending approval
		const facultyRole = roles?.find(r => r.role === 'faculty');
		if (facultyRole && facultyRole.approval_status === 'pending') {
			if (isDev) logger.debug('Faculty with pending approval, redirecting to waiting page');
			return NextResponse.redirect(new URL('/faculty/waiting', req.url));
		}
		
	// Check if user has recruiter role with pending approval
	const recruiterRole = roles?.find(r => r.role === 'recruiter');
	if (recruiterRole && recruiterRole.approval_status === 'pending') {
		if (isDev) logger.debug('Recruiter with pending approval, redirecting to waiting page');
		return NextResponse.redirect(new URL('/recruiter/waiting', req.url));
	}		// Otherwise redirect to dashboard
		if (isDev) logger.debug('Authenticated user, redirecting to dashboard');
		return NextResponse.redirect(new URL('/dashboard', req.url));
	}

	if (!isPublic && !user) {
		if (isDev) logger.debug('Unauthenticated user accessing protected route, redirecting to login');
		const loginUrl = new URL('/login', req.url);
		loginUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
		return NextResponse.redirect(loginUrl);
	}

	// Check faculty approval status for protected faculty routes
	if (user && req.nextUrl.pathname.startsWith('/faculty/') && !isWaitingRoute) {
		const { data: roleData } = await supabase
			.from('user_roles')
			.select('role, approval_status')
			.eq('user_id', user.id)
			.eq('role', 'faculty')
			.maybeSingle();

		if (roleData && (roleData.approval_status === 'pending' || roleData.approval_status === 'denied')) {
			if (isDev) logger.debug('Faculty user with pending/denied approval, redirecting to waiting');
			return NextResponse.redirect(new URL('/faculty/waiting', req.url));
		}
	}

	// Check recruiter approval status for protected recruiter routes
	if (user && req.nextUrl.pathname.startsWith('/recruiter/') && !isWaitingRoute) {
		const { data: roleData } = await supabase
			.from('user_roles')
			.select('role, approval_status')
			.eq('user_id', user.id)
			.eq('role', 'recruiter')
			.maybeSingle();

		if (roleData && (roleData.approval_status === 'pending' || roleData.approval_status === 'denied')) {
			if (isDev) logger.debug('Recruiter user with pending/denied approval, redirecting to waiting');
			return NextResponse.redirect(new URL('/recruiter/waiting', req.url));
		}
	}

	// IMPORTANT: Check recruiter approval when accessing /dashboard
	// This handles OAuth flow where recruiters land on /dashboard after login
	if (user && req.nextUrl.pathname === '/dashboard') {
		const { data: roleData } = await supabase
			.from('user_roles')
			.select('role, approval_status')
			.eq('user_id', user.id)
			.eq('role', 'recruiter')
			.maybeSingle();

		if (roleData) {
			// If recruiter has pending or denied approval, redirect to waiting page
			if (roleData.approval_status === 'pending' || roleData.approval_status === 'denied') {
				if (isDev) logger.debug('Recruiter accessing /dashboard with pending/denied approval, redirecting to waiting');
				return NextResponse.redirect(new URL('/recruiter/waiting', req.url));
			}
		}
	}

	return supabaseResponse;
}

// Run on every page route, including dynamic segments that contain a dot
// (e.g. /recruiter/student/a.b). Skipped: Next internals (_next/static,
// _next/image), favicon, /api/* (each API route self-enforces auth), and
// well-known static file extensions at the END of the path. /.well-known/* is
// always matched (and treated as public above) even when it ends in .json.
export const config = {
	matcher: [
		'/((?!_next/static|_next/image|favicon\\.ico|api/|(?!\\.well-known/).*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|woff2?|ttf|pdf)$).*)',
	],
};
