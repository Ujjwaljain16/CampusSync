import { NextRequest, NextResponse } from 'next/server';
import { emailService } from '@/lib/emailService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email address required' }, { status: 400 });
    }

    console.log('[Test Email] Sending test email to:', email);

    // Send a simple test email
    const result = await emailService.sendCertificateApproved(email, {
      studentName: 'Test User',
      certificateTitle: 'Test Certificate',
      institution: 'Test Institution',
      portfolioUrl: 'http://localhost:3000',
    });

    console.log('[Test Email] Email sent result:', result);

    return NextResponse.json({ 
      success: result,
      message: result 
        ? 'Test email sent successfully! Check your inbox (and spam folder).' 
        : 'Failed to send email. Check server logs for details.',
    });
  } catch (error) {
    console.error('[Test Email] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to send test email',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
