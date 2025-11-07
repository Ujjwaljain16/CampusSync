import { NextRequest } from 'next/server';
import { withRole, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['faculty', 'admin'], async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  // Get user's organization
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (!userRole?.organization_id) {
    console.error('[Approval History API] User organization not found for user:', user.id);
    throw apiError.forbidden('User organization not found');
  }

  console.log('[Approval History API] Fetching history for org:', userRole.organization_id, 'page:', page, 'limit:', limit);

  // Get approval history filtered by organization
  const { data: approvals, error: approvalsError } = await supabase
    .from('audit_logs')
    .select(`
      id,
      actor_id,
      target_user_id,
      action,
      target_id,
      details,
      created_at,
      organization_id
    `)
    .eq('organization_id', userRole.organization_id)
    .in('action', ['manual_approve', 'manual_reject', 'batch_approve', 'batch_reject'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (approvalsError) {
    console.error('Error fetching approval history:', approvalsError);
    throw apiError.internal('Failed to fetch approval history');
  }

  console.log('[Approval History API] Query returned:', approvals?.length || 0, 'approvals');
  if (approvals && approvals.length > 0) {
    console.log('[Approval History API] First approval:', approvals[0]);
  }

  // Get certificate details for each approval
  const certificateIds = approvals?.map(a => a.target_id).filter(Boolean) || [];
  const certificates: Array<{
    id: string;
    title: string;
    institution: string;
    student_id: string;
    verification_status: string;
    created_at: string;
  }> = [];
  
  if (certificateIds.length > 0) {
    const { data: certs, error: certsError } = await supabase
      .from('certificates')
      .select('id, title, institution, student_id, verification_status, created_at')
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

  // Get revert actions for the certificates to check if any approvals were reverted
  const { data: reverts } = await supabase
    .from('audit_logs')
    .select('target_id, created_at')
    .eq('action', 'revert_approval')
    .in('target_id', certificateIds);

  // Create a map of certificate IDs to their latest revert timestamp
  const revertMap = new Map(reverts?.map(r => [r.target_id, r.created_at]) || []);

  // Get total count for pagination (filtered by organization)
  const { count, error: countError } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', userRole.organization_id)
    .in('action', ['manual_approve', 'manual_reject', 'batch_approve', 'batch_reject']);

  if (countError) {
    console.error('Error counting approvals:', countError);
  }

  // Get user details for the approvers
  const approverIds = [...new Set(
    approvals?.map(a => a.actor_id).filter(Boolean) || []
  )];
  const { data: users } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', approverIds);

  const userMap = new Map(users?.map(u => [u.user_id, u.role]) || []);

  // Format the response
  const formattedApprovals = approvals?.map(approval => {
    const revertTimestamp = revertMap.get(approval.target_id);
    const wasReverted = revertTimestamp && new Date(revertTimestamp) > new Date(approval.created_at);
    const isApproval = approval.action === 'manual_approve' || approval.action === 'batch_approve';
    
    return {
      id: approval.id,
      action: approval.action,
      certificateId: approval.target_id,
      certificate: certMap.get(approval.target_id) || {
        id: approval.target_id,
        title: 'Certificate not found',
        institution: 'Unknown',
        student_id: 'unknown',
        verification_status: 'unknown',
        created_at: approval.created_at
      },
      approverRole: userMap.get(approval.actor_id) || 'unknown',
      details: approval.details,
      createdAt: approval.created_at,
      reverted: wasReverted,
      canRevert: isApproval && !wasReverted
    };
  }) || [];

  console.log('[Approval History API] Raw approvals count:', approvals?.length || 0);
  console.log('[Approval History API] Formatted approvals count:', formattedApprovals.length);
  console.log('[Approval History API] Total count:', count);
  console.log('[Approval History API] Sample approval:', formattedApprovals[0]);

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

