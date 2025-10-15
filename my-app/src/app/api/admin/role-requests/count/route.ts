import { withRole, success } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin'], async () => {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from('role_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  return success({ pending: count || 0 });
});



