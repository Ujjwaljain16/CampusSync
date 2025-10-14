import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

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
						response.cookies.set(name, value, options);
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

	// Handle role assignment for invited users
	const { data: { user } } = await supabase.auth.getUser();
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
	response.headers.set('Location', dest);
	return new NextResponse(null, { status: 302, headers: response.headers });
}