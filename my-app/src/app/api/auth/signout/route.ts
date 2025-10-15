import { success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST() {
	const supabase = await createSupabaseServerClient();
	const { error } = await supabase.auth.signOut();
	if (error) {
		console.error('Sign out error:', error);
		throw apiError.internal(error.message);
	}
	return success({ success: true }, 'Signed out successfully');
}



