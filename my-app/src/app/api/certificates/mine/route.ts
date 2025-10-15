import { withAuth, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/certificates/mine
 * Returns all certificates for the authenticated user
 */
export const GET = withAuth(async (_request, { user }) => {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('certificates')
    .select('id, title, institution, date_issued, file_url, verification_status, created_at, auto_approved')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return apiError.internal(error.message);
  return success(data);
});



