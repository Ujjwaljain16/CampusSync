import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError } from '@/lib/api';

export const POST = withRole(['admin'], async (req: NextRequest, { user }) => {
  const body = await req.json().catch(() => null) as {
    requestId: string;
    action: 'approve' | 'reject';
    reason?: string;
    adminNotes?: string;
  } | null;

  if (!body || !body.requestId || !body.action) {
    throw apiError.badRequest('Missing required fields: requestId, action');
  }

  const supabase = await createSupabaseServerClient();
  
  // Get the role request
  const { data: request, error: requestError } = await supabase
    .from('role_requests')
    .select('*')
    .eq('id', body.requestId)
    .single();

  if (requestError || !request) {
    throw apiError.notFound('Role request not found');
  }

  // Update the request status
  const { error: updateError } = await supabase
    .from('role_requests')
    .update({
      status: body.action === 'approve' ? 'approved' : 'rejected',
      admin_notes: body.adminNotes || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', body.requestId);

  if (updateError) {
    throw apiError.internal('Failed to update role request');
  }

  // If approved, assign the role
  if (body.action === 'approve') {
    await supabase.from('user_roles').upsert({
      user_id: request.user_id,
      role: request.requested_role,
      assigned_by: user.id,
      assigned_at: new Date().toISOString()
    });
  }

  // In a real application, you would send an email notification here
  // For now, we'll just simulate the email notification
  const emailNotificationSent = await simulateEmailNotification({
    to: request.user_email,
    subject: `Role Request ${body.action === 'approve' ? 'Approved' : 'Rejected'}`,
    template: body.action === 'approve' ? 'role-approved' : 'role-rejected',
    data: {
      userName: request.user_name,
      requestedRole: request.requested_role,
      reason: body.reason,
      adminNotes: body.adminNotes
    }
  });

  // Log the notification
  await supabase.from('audit_logs').insert({
    user_id: user.id,
    action: 'role_request_notification',
    target_id: body.requestId,
    details: {
      action: body.action,
      recipient: request.user_email,
      email_sent: emailNotificationSent,
      reason: body.reason,
      admin_notes: body.adminNotes
    },
    created_at: new Date().toISOString()
  });

  return success({
    requestId: body.requestId,
    action: body.action,
    email_sent: emailNotificationSent,
    processed_at: new Date().toISOString()
  }, `Role request ${body.action}d and notification sent`);
});

// Simulate email notification (in production, use real email service)
async function simulateEmailNotification(params: {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}): Promise<boolean> {
  try {
    // In production, integrate with SendGrid, AWS SES, or similar
    console.log('📧 Email Notification Simulated:', {
      to: params.to,
      subject: params.subject,
      template: params.template,
      data: params.data
    });
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
  } catch (error) {
    console.error('Email notification failed:', error);
    return false;
  }
}