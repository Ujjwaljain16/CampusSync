import { withRole, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/documents/pending - list pending documents for faculty/admin
export const GET = withRole(['faculty', 'admin'], async () => {
  const supabase = await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending documents:', error);
    throw apiError.internal('Failed to fetch pending documents');
  }

  return success({ documents: data || [] }, 'Pending documents retrieved successfully');
});