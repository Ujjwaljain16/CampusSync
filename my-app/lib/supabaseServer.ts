import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export async function createSupabaseServerClient() {
	const cookieStore = await cookies();

	// Check if environment variables are available
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
	}

	return createServerClient(
		supabaseUrl,
		supabaseAnonKey,
		{
			cookies: {
				getAll() {
					return cookieStore.getAll();
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value, options }) => {
						cookieStore.set(name, value, options);
					});
				},
			},
		}
	);
}

// Utility to get current user on the server
export async function getServerUser() {
	const supabase = await createSupabaseServerClient();
	const { data } = await supabase.auth.getUser();
	return data.user ?? null;
}


export async function getServerUserWithRole() {
	const supabase = await createSupabaseServerClient();
	const { data } = await supabase.auth.getUser();
	const user = data.user ?? null;
	
	if (!user) {
		return { user: null, role: null } as const;
	}

	try {
		// Try to get role from database first
		const { data: roleData, error: roleError } = await supabase
			.from('user_roles')
			.select('role')
			.eq('user_id', user.id)
			.single();

		if (roleData && !roleError) {
			return { user, role: roleData.role } as const;
		}

		// Fallback to email-based role assignment for existing admins
		const adminEmails = [
			'jainujjwal1609@gmail.com',
			'test@university.edu'
			// Add more admin emails here as needed
		];
		
		if (user.email && adminEmails.includes(user.email)) {
			// Assign admin role in database
			const { error: upsertError } = await supabase
				.from('user_roles')
				.upsert({
					user_id: user.id,
					role: 'admin',
					assigned_by: 'system',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}, {
					onConflict: 'user_id'
				});
			
			if (upsertError) {
				console.error('Error assigning admin role:', upsertError);
			} else {
				console.log(`Assigned admin role to ${user.email}`);
			}
			return { user, role: 'admin' } as const;
		}

		// Default to 'student' for all other users
		// Assign student role in database for new users
		const { error: upsertError } = await supabase
			.from('user_roles')
			.upsert({
				user_id: user.id,
				role: 'student',
				assigned_by: 'system',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}, {
				onConflict: 'user_id'
			});
		
		if (upsertError) {
			console.error('Error assigning default student role:', upsertError);
		}
		
		return { user, role: 'student' } as const;
	} catch (error) {
		console.error('Error fetching user role:', error);
		// Fallback to student role on error
		return { user, role: 'student' } as const;
	}
}

export async function requireRole(allowedRoles: string[]) {
	const { user, role } = await getServerUserWithRole();
	if (!user) {
		return { authorized: false, status: 401, message: 'Unauthorized' } as const;
	}
	if (!allowedRoles.includes(role)) {
		return { authorized: false, status: 403, message: 'Forbidden' } as const;
	}
	return { authorized: true, user, role } as const;
}

// Admin client with service role key for admin operations
export function createSupabaseAdminClient() {
	if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations');
	}

	return createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY,
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		}
	);
}
