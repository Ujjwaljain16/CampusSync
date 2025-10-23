import { success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST() {
	try {
		const supabase = await createSupabaseServerClient();
		const { error } = await supabase.auth.signOut();
		
		// If there's no session to sign out from, that's okay - user is already signed out
		if (error) {
			// Check if it's a session missing error
			if (error.message?.includes('session') || error.message?.includes('Session')) {
				console.log('Session already cleared, treating as successful signout');
				return success({ success: true }, 'Signed out successfully');
			}
			
			// For other errors, log but still return success to avoid blocking the logout flow
			console.error('Sign out error (non-blocking):', error);
			return success({ success: true }, 'Signed out successfully');
		}
		
		return success({ success: true }, 'Signed out successfully');
	} catch (error) {
		// Catch any unexpected errors and still return success
		// This ensures the logout flow completes even if something goes wrong
		console.error('Unexpected sign out error:', error);
		return success({ success: true }, 'Signed out successfully');
	}
}



