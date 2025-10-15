import { NextRequest } from 'next/server';
import { withAuth, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/vc/status?credentialId=...
export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get('credentialId');
  
  if (!credentialId) {
    throw apiError.badRequest('Missing credentialId');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('vc_status_registry')
    .select('*')
    .eq('credential_id', credentialId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching VC status:', error);
    throw apiError.internal(error.message);
  }

  return success(data || { status: 'active' });
});



