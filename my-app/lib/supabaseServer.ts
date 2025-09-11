import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

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
	const role = (user?.user_metadata?.role as string | undefined) ?? 'student';
	return { user, role } as const;
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


