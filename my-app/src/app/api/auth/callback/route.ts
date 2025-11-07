import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

/**
 * OAuth Callback Handler
 * 
 * Handles the OAuth callback from Google and completes the authentication flow.
 * 
 * Flow:
 * 1. Exchange OAuth code for session
 * 2. Check if user has a profile in our database
 * 3. If NO profile → Redirect to signup (OAuth created auth.users but no profile yet)
 * 4. If HAS profile → Continue to dashboard (existing user)
 * 
 * Note: Supabase automatically creates an entry in auth.users during OAuth,
 * but we only create a profile after the user completes our signup flow.
 * This ensures users provide required information (role, organization, etc.)
 */
export async function GET(request: NextRequest) {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const redirectTo = url.searchParams.get('redirectTo') || '/';

	if (!code) {
		const absolute = `${url.protocol}//${url.host}${redirectTo}`;
		return NextResponse.redirect(absolute);
	}

	const base = `${url.protocol}//${url.host}`;
	
	// Create supabase client with cookie handling
	const cookieStore: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach((cookie) => {
						cookieStore.push(cookie);
					});
				},
			},
		}
	);

	const { error } = await supabase.auth.exchangeCodeForSession(code);

	if (error) {
		const errorUrl = `${base}/login?error=${encodeURIComponent(error.message)}`;
		return NextResponse.redirect(errorUrl);
	}

	// Get the authenticated user
	const { data: { user } } = await supabase.auth.getUser();
	
	if (!user) {
		const errorUrl = `${base}/login?error=${encodeURIComponent('Authentication failed')}`;
		return NextResponse.redirect(errorUrl);
	}

	// Check if this is a new OAuth user (first time signing in with OAuth)
	const { data: existingProfile } = await supabase
		.from('profiles')
		.select('id, email')
		.eq('id', user.id)
		.single();

	// If no profile exists, this user hasn't completed signup - redirect to signup
	if (!existingProfile) {
		console.log(`OAuth user ${user.email} has no profile - redirecting to signup`);
		// If user metadata signals a recruiter signup or invited role, pass role in query
		const roleFromMeta = user.user_metadata?.signup_type || user.user_metadata?.invited_role;
		const qs = new URLSearchParams({
			email: user.email || '',
			oauth: 'true'
		});
		if (roleFromMeta) {
			qs.set('role', String(roleFromMeta));
		}
		const signupUrl = `${base}/signup?${qs.toString()}`;
		return NextResponse.redirect(signupUrl);
	}

	// User exists, check for role and approval status for proper redirect
	console.log(`OAuth user ${user.email} has existing profile`);
	
	// Check if user is a recruiter and their approval status
	const { data: recruiterRole } = await supabase
		.from('user_roles')
		.select('role, approval_status')
		.eq('user_id', user.id)
		.eq('role', 'recruiter')
		.maybeSingle();
	
	// If user is a recruiter with pending/denied approval, redirect to waiting page
	if (recruiterRole) {
		console.log(`OAuth recruiter found with approval status: ${recruiterRole.approval_status}`);
		if (recruiterRole.approval_status === 'pending' || recruiterRole.approval_status === 'denied') {
			console.log(`Redirecting recruiter to waiting page`);
			const waitingUrl = `${base}/recruiter/waiting`;
			const redirectResponse = NextResponse.redirect(waitingUrl);
			cookieStore.forEach(({ name, value, options }) => {
				redirectResponse.cookies.set(name, value, options);
			});
			return redirectResponse;
		}
	}
	// Handle role assignment for invited users
	if (user?.user_metadata?.invited_role) {
		const invitedRole = user.user_metadata.invited_role;
		const invitedBy = user.user_metadata.invited_by;
		
		// Check if user already has a role (from trigger or previous assignment)
		const { data: existingRole } = await supabase
			.from('user_roles')
			.select('role')
			.eq('user_id', user.id)
			.single();
		
		if (existingRole) {
			// User already has a role, update it to the invited role
			const { error: updateError } = await supabase
				.from('user_roles')
				.update({
					role: invitedRole,
					assigned_by: invitedBy,
					updated_at: new Date().toISOString()
				})
				.eq('user_id', user.id);
			
			if (updateError) {
				console.error('Error updating invited role:', updateError);
			}
		} else {
			// User has no role, insert the invited role
			const { error: insertError } = await supabase
				.from('user_roles')
				.insert({
					user_id: user.id,
					role: invitedRole,
					assigned_by: invitedBy,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				});
			
			if (insertError) {
				console.error('Error inserting invited role:', insertError);
			}
		}
		
		// Clean up the metadata using admin client
		try {
			const adminSupabase = createClient(
				process.env.NEXT_PUBLIC_SUPABASE_URL!,
				process.env.SUPABASE_SERVICE_ROLE_KEY!,
				{
					auth: {
						autoRefreshToken: false,
						persistSession: false
					}
				}
			);
			
			await adminSupabase.auth.admin.updateUserById(user.id, {
				user_metadata: {
					...user.user_metadata,
					invited_role: undefined,
					invited_by: undefined
				}
			});
		} catch (cleanupError) {
			console.error('Error cleaning up user metadata:', cleanupError);
			// Continue with redirect even if cleanup fails
		}
	} else {
		// Check if this user should be an admin (existing admin users)
		// List of admin emails - you can add more here
		const adminEmails = [
			'jainujjwal1609@gmail.com',
			'test@university.edu',
			// Add more admin emails here as needed
		];
		
		if (user?.email && adminEmails.includes(user.email)) {
			// Check if user already has a role
			const { data: existingRole } = await supabase
				.from('user_roles')
				.select('role')
				.eq('user_id', user.id)
				.single();
			
			if (existingRole) {
				// User has a role, check if it's admin
				if (existingRole.role !== 'admin') {
					// Update to admin
					const { error: updateError } = await supabase
						.from('user_roles')
					.update({
						role: 'admin',
						assigned_by: user.id,
						updated_at: new Date().toISOString()
					})
						.eq('user_id', user.id);
					
					if (updateError) {
						console.error('Error updating user to admin:', updateError);
					} else {
						console.log(`Updated ${user.email} to admin role`);
					}
				}
			} else {
				// User has no role, insert admin role
				const { error: insertError } = await supabase
					.from('user_roles')
				.insert({
					user_id: user.id,
					role: 'admin',
					assigned_by: user.id,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				});
				
				if (insertError) {
					console.error('Error inserting admin role:', insertError);
				} else {
					console.log(`Assigned admin role to ${user.email}`);
				}
			}
		}
	}

	const dest = redirectTo.startsWith('http') ? redirectTo : `${base}${redirectTo}`;
	const redirectResponse = NextResponse.redirect(dest);
	
	// Apply all cookies to the redirect response
	cookieStore.forEach(({ name, value, options }) => {
		redirectResponse.cookies.set(name, value, options);
	});
	
	return redirectResponse;
}