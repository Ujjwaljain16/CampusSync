import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export async function createSupabaseServerClient() {
	const cookieStore = await cookies();

	return createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

	// For now, use email-based role assignment to avoid RLS issues
	const adminEmails = [
		'jainujjwal1609@gmail.com',
		// Add more admin emails here as needed
	];
	
	if (user.email && adminEmails.includes(user.email)) {
		return { user, role: 'admin' } as const;
	}

	// Default to 'student' for all other users
	return { user, role: 'student' } as const;
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
