/**
 * Unit tests for the email service: HTML escaping, URL validation and failure handling.
 * nodemailer is mocked with a transport that captures the outgoing message.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SMTP_ENV = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'mailer@example.test',
  SMTP_PASS: 'not-a-real-password',
  NEXT_PUBLIC_SITE_URL: 'https://campussync.example.test',
};

type Sent = { from: string; to: string; subject: string; html: string };

async function loadService(sendMail: (m: Sent) => Promise<unknown>, withSmtp = true) {
  vi.resetModules();
  for (const [k, v] of Object.entries(SMTP_ENV)) {
    if (withSmtp || k === 'NEXT_PUBLIC_SITE_URL') process.env[k] = v;
    else delete process.env[k];
  }
  if (!withSmtp) {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  }
  vi.doMock('nodemailer', () => ({
    default: { createTransport: () => ({ sendMail }) },
  }));
  return import('@/lib/emailService');
}

describe('Email Service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.doUnmock('nodemailer');
    process.env = { ...originalEnv };
  });

  describe('escapeHtml / safeHttpUrl', () => {
    it('escapes HTML metacharacters', async () => {
      const { escapeHtml } = await loadService(async () => ({}));
      expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;'
      );
      expect(escapeHtml(undefined)).toBe('');
    });

    it('only accepts absolute http(s) URLs', async () => {
      const { safeHttpUrl } = await loadService(async () => ({}));
      expect(safeHttpUrl('https://a.example/x')).toBe('https://a.example/x');
      expect(safeHttpUrl('http://a.example/')).toBe('http://a.example/');
      expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
      expect(safeHttpUrl('data:text/html,<b>x</b>')).toBeNull();
      expect(safeHttpUrl('/relative/path')).toBeNull();
      expect(safeHttpUrl('')).toBeNull();
      expect(safeHttpUrl(undefined)).toBeNull();
    });
  });

  describe('sendNotification', () => {
    it('escapes user-controlled text in the HTML body', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'id-1' });
      const { emailService } = await loadService(sendMail);

      const result = await emailService.sendNotification({
        to: 'student@example.com',
        subject: 'Certificate <b>Approved</b>',
        template: 'certificate_approved',
        data: {
          studentName: '<img src=x onerror=alert(1)>',
          certificateTitle: '<script>alert(1)</script>',
          institution: 'MIT" onmouseover="x',
        },
      });

      expect(result).toBe(true);
      expect(sendMail).toHaveBeenCalledTimes(1);
      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).toContain('MIT&quot; onmouseover=&quot;x');
      expect(html).toContain('<title>Certificate &lt;b&gt;Approved&lt;/b&gt;</title>');
    });

    it('escapes role request notes and reasons', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'id-2' });
      const { emailService } = await loadService(sendMail);

      await emailService.sendRoleDenied('user@example.com', {
        requestedRole: '<u>faculty</u>',
        reason: '<script>steal()</script>',
        adminNotes: '<a href="http://evil.example">click</a>',
        supportUrl: 'https://support.example.test/help',
      });

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).not.toContain('<script>steal()</script>');
      expect(html).not.toContain('<a href="http://evil.example">');
      expect(html).toContain('&lt;a href=&quot;http://evil.example&quot;&gt;click&lt;/a&gt;');
      expect(html).toContain('href="https://support.example.test/help"');
    });

    it('rejects non-http(s) URLs and falls back to the site URL', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'id-3' });
      const { emailService } = await loadService(sendMail);

      await emailService.sendRoleApproved('user@example.com', {
        requestedRole: 'faculty',
        dashboardUrl: 'javascript:alert(document.cookie)',
        portfolioUrl: 'data:text/html;base64,AAAA',
      });

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('data:text/html');
      // dashboard link falls back to the configured site URL; portfolio link is dropped
      expect(html).toContain('href="https://campussync.example.test/"');
      expect(html).not.toContain('View Your Portfolio');
    });

    it('escapes quotes inside otherwise valid URLs', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'id-4' });
      const { emailService } = await loadService(sendMail);

      await emailService.sendCertificateApproved('user@example.com', {
        certificateTitle: 'T',
        portfolioUrl: 'https://ok.example/p?q="onclick="x',
      });

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).not.toContain('"onclick="x');
    });

    it('strips line breaks from the subject to prevent header injection', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'id-5' });
      const { emailService } = await loadService(sendMail);

      await emailService.sendNotification({
        to: 'user@example.com',
        subject: 'Hello\r\nBcc: attacker@example.com',
        template: 'certificate_rejected',
        data: { certificateTitle: 'T' },
      });

      expect(sendMail.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
    });

    it('returns false when the transport fails', async () => {
      const sendMail = vi.fn().mockRejectedValue(new Error('SMTP down'));
      const { emailService } = await loadService(sendMail);

      const result = await emailService.sendCertificateRejected('user@example.com', { certificateTitle: 'T' });

      expect(result).toBe(false);
    });

    it('returns false (and does not throw) when SMTP is not configured', async () => {
      const sendMail = vi.fn();
      const { emailService } = await loadService(sendMail, false);

      const result = await emailService.sendCertificateApproved('user@example.com', { certificateTitle: 'T' });

      expect(result).toBe(false);
      expect(sendMail).not.toHaveBeenCalled();
    });
  });
});
