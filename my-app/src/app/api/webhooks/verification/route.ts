// Webhook system for verification callbacks
import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Webhook signature verification
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-webhook-signature');
  const webhookSecret = process.env.WEBHOOK_SECRET;

  // Skip signature verification in development/testing
  if (process.env.NODE_ENV === 'production' && webhookSecret) {
    if (!signature || !verifyWebhookSignature(body, signature, webhookSecret)) {
      throw apiError.unauthorized('Invalid signature');
    }
  } else if (process.env.NODE_ENV === 'production' && !webhookSecret) {
    console.error('WEBHOOK_SECRET not configured');
    throw apiError.internal('Webhook not configured');
  }

  // Handle empty body gracefully
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body);
  } catch {
    throw apiError.badRequest('Invalid JSON or missing data');
  }
  
  const { event, payload } = data;

  // Handle different webhook events
  switch (event) {
    case 'verification.completed':
      await handleVerificationCompleted(payload as Record<string, unknown>);
      break;
    
    case 'verification.failed':
      await handleVerificationFailed(payload as Record<string, unknown>);
      break;
    
    case 'certificate.approved':
      await handleCertificateApproved(payload as Record<string, unknown>);
      break;
    
    case 'certificate.rejected':
      await handleCertificateRejected(payload as Record<string, unknown>);
      break;
    
    case 'vc.issued':
      await handleVCIssued(payload as Record<string, unknown>);
      break;
    
    case 'vc.revoked':
      await handleVCRevoked(payload as Record<string, unknown>);
      break;
    
    default:
      console.log(`Unknown webhook event: ${event}`);
      throw apiError.badRequest('Unknown event type');
  }

  return success({ success: true });
}

async function handleVerificationCompleted(payload: Record<string, unknown>) {
  const { credentialId, status, confidence, method, timestamp } = payload;
  
  // Log verification completion
  await supabase.from('audit_logs').insert({
    actor_id: null, // System event
    target_id: credentialId,
    action: 'webhook_verification_completed',
    details: {
      status,
      confidence,
      method,
      timestamp,
      source: 'webhook'
    },
    created_at: new Date().toISOString()
  });

  // Update any pending verification records
  if (credentialId) {
    await supabase
      .from('verification_requests')
      .update({
        status: status === 'verified' ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        webhook_data: payload
      })
      .eq('credential_id', credentialId)
      .eq('status', 'pending');
  }
}

async function handleVerificationFailed(payload: Record<string, unknown>) {
  const { credentialId, error, reason, timestamp } = payload;
  
  // Log verification failure
  await supabase.from('audit_logs').insert({
    actor_id: null,
    target_id: credentialId,
    action: 'webhook_verification_failed',
    details: {
      error,
      reason,
      timestamp,
      source: 'webhook'
    },
    created_at: new Date().toISOString()
  });

  // Update verification status
  if (credentialId) {
    await supabase
      .from('verification_requests')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error,
        webhook_data: payload
      })
      .eq('credential_id', credentialId)
      .eq('status', 'pending');
  }
}

async function handleCertificateApproved(payload: Record<string, unknown>) {
  const { certificateId, approvedBy, timestamp, reason } = payload;
  
  // Log certificate approval
  await supabase.from('audit_logs').insert({
    actor_id: approvedBy,
    target_id: certificateId,
    action: 'webhook_certificate_approved',
    details: {
      reason,
      timestamp,
      source: 'webhook'
    },
    created_at: new Date().toISOString()
  });
}

async function handleCertificateRejected(payload: Record<string, unknown>) {
  const { certificateId, rejectedBy, timestamp, reason } = payload;
  
  // Log certificate rejection
  await supabase.from('audit_logs').insert({
    actor_id: rejectedBy,
    target_id: certificateId,
    action: 'webhook_certificate_rejected',
    details: {
      reason,
      timestamp,
      source: 'webhook'
    },
    created_at: new Date().toISOString()
  });
}

async function handleVCIssued(payload: Record<string, unknown>) {
  const { credentialId, issuedTo, timestamp, credentialType } = payload;
  
  // Log VC issuance
  await supabase.from('audit_logs').insert({
    actor_id: null,
    target_id: credentialId,
    action: 'webhook_vc_issued',
    details: {
      issued_to: issuedTo,
      credential_type: credentialType,
      timestamp,
      source: 'webhook'
    },
    created_at: new Date().toISOString()
  });
}

async function handleVCRevoked(payload: Record<string, unknown>) {
  const { credentialId, revokedBy, timestamp, reason } = payload;
  
  // Log VC revocation
  await supabase.from('audit_logs').insert({
    actor_id: revokedBy,
    target_id: credentialId,
    action: 'webhook_vc_revoked',
    details: {
      reason,
      timestamp,
      source: 'webhook'
    },
    created_at: new Date().toISOString()
  });
}

// GET endpoint for webhook health check
export async function GET() {
  return success({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
}
