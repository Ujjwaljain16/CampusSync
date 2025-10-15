import { NextRequest } from 'next/server';
import { withRole, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['admin'], async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  const supabase = await createSupabaseServerClient();
  const query = supabase
    .from('role_requests')
    .select('id, user_id, requested_role, metadata, status, reviewed_by, reviewed_at, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching role requests:', error);
    throw apiError.internal(error.message);
  }

  // join minimal profile info
  const userIds = Array.from(new Set((data || []).map(r => r.user_id)));
  let profiles: Array<{ id: string; full_name: string }> = [];
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    profiles = profs || [];
  }
  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const enriched = (data || []).map(r => ({
    ...r,
    requester: profileMap.get(r.user_id) || null,
  }));

  return success({ data: enriched, pagination: { limit, offset } });
});



