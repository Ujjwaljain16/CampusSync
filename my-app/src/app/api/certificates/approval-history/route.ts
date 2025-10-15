import { NextRequest } from 'next/server';
import { withRole, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['faculty', 'admin'], async (req: NextRequest) => {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

    // Get approval history first
    const { data: approvals, error: approvalsError } = await supabase
      .from('audit_logs')
      .select(`
        id,
        actor_id,
        user_id,
        action,
        target_id,
        details,
        created_at
      `)
      .in('action', ['manual_approve', 'manual_reject', 'batch_approve', 'batch_reject'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

  if (approvalsError) {
    console.error('Error fetching approval history:', approvalsError);
    throw apiError.internal('Failed to fetch approval history');
  }

  // Get certificate details for each approval
  const certificateIds = approvals?.map(a => a.target_id).filter(Boolean) || [];
  const certificates: Array<{
    id: string;
    title: string;
    institution: string;
    user_id: string;
    verification_status: string;
    created_at: string;
  }> = [];
  
  if (certificateIds.length > 0) {
    const { data: certs, error: certsError } = await supabase
      .from('certificates')
      .select('id, title, institution, user_id, verification_status, created_at')
      .in('id', certificateIds);
    
    if (certsError) {
      console.error('Error fetching certificates:', certsError);
      // Continue without certificate details
    } else {
      certificates.push(...(certs || []));
    }
  }

  // Create a map for quick certificate lookup
  const certMap = new Map(certificates.map(cert => [cert.id, cert]));

  // Get total count for pagination
  const { count, error: countError } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .in('action', ['manual_approve', 'manual_reject', 'batch_approve', 'batch_reject']);

  if (countError) {
    console.error('Error counting approvals:', countError);
  }

  // Get user details for the approvers
  const approverIds = [...new Set(approvals?.map(a => a.user_id).filter(Boolean) || [])];
  const { data: users } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', approverIds);

  const userMap = new Map(users?.map(u => [u.user_id, u.role]) || []);

  // Format the response
  const formattedApprovals = approvals?.map(approval => ({
    id: approval.id,
    action: approval.action,
    certificateId: approval.target_id,
    certificate: certMap.get(approval.target_id) || {
      id: approval.target_id,
      title: 'Certificate not found',
      institution: 'Unknown',
      user_id: 'unknown',
      verification_status: 'unknown',
      created_at: approval.created_at
    },
    approverRole: userMap.get(approval.user_id) || 'unknown',
    details: approval.details,
    createdAt: approval.created_at,
    canRevert: approval.action === 'manual_approve' || approval.action === 'batch_approve'
  })) || [];

  return success({
    approvals: formattedApprovals,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  });
});

