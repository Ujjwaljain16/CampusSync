import { NextRequest } from 'next/server';
import { withRole, success, apiError } from '@/lib/api';
import { emailService } from '@/lib/emailService';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';

/**
 * POST /api/test-email
 *
 * Development-only diagnostic. Disabled in production, restricted to admins,
 * and can only send to the calling admin's own address (never a relay).
 */
export const POST = withRole(['admin', 'super_admin'], async (req: NextRequest, { user }) => {
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 });
  }

  const limited = enforceRateLimit(req, 'test-email', RateLimitPresets.strict, user.id);
  if (limited) return limited;

  if (!user.email) throw apiError.badRequest('Your account has no email address');

  const result = await emailService.sendCertificateApproved(user.email, {
    studentName: 'Test User',
    certificateTitle: 'Test Certificate',
    institution: 'Test Institution',
    portfolioUrl: 'http://localhost:3000',
  });

  return success({ sent: result }, result ? 'Test email sent' : 'Failed to send email. Check server logs.');
});
