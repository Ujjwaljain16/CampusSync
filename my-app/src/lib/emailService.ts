import nodemailer from 'nodemailer';
import { features, config } from './envValidator';
import { logger } from './logger';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface NotificationData {
  to: string;
  subject: string;
  template: 'certificate_approved' | 'certificate_rejected' | 'certificate_auto_approved' | 'manual_review_required' | 'role_approved' | 'role_denied';
  data: {
    studentName?: string;
    certificateTitle?: string;
    institution?: string;
    confidenceScore?: number;
    verificationMethod?: string;
    portfolioUrl?: string;
    userName?: string;
    requestedRole?: string;
    adminNotes?: string;
    reason?: string;
    dashboardUrl?: string;
    supportUrl?: string;
  };
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Check if email feature is enabled
    if (!features.isEmailEnabled()) {
      logger.warn('Email service not configured - SMTP credentials missing');
      return;
    }

    const smtpConfig = config.getSmtpConfig();
    if (!smtpConfig) {
      logger.warn('Email service not configured - unable to get SMTP config');
      return;
    }

    // For development, use a test account or configure with real SMTP
    const emailConfig: EmailConfig = {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    };

    try {
      this.transporter = nodemailer.createTransport(emailConfig);
      this.isConfigured = true;
      logger.debug('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service', error);
    }
  }

  async sendNotification(notification: NotificationData): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured, skipping notification', {
        to: notification.to,
        template: notification.template,
        isConfigured: this.isConfigured,
        hasTransporter: !!this.transporter,
      });
      console.warn('[EmailService] Email service not configured - check SMTP environment variables');
      return false;
    }

    try {
      const html = this.generateEmailHTML(notification);
      
      const fromEmail = process.env.SMTP_FROM || config.getSmtpConfig()?.user || 'noreply@campussync.com';
      const mailOptions = {
        from: `"CampusSync" <${fromEmail}>`,
        to: notification.to,
        subject: notification.subject,
        html,
      };

      console.log('[EmailService] Attempting to send email:', {
        to: notification.to,
        subject: notification.subject,
        from: mailOptions.from,
      });

      const result = await this.transporter.sendMail(mailOptions);
      logger.debug('Email sent successfully', {
        to: notification.to,
        subject: notification.subject,
        messageId: result.messageId,
      });
      console.log('[EmailService] Email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      logger.error('Failed to send email', error);
      console.error('[EmailService] Failed to send email:', error);
      return false;
    }
  }

  private generateEmailHTML(notification: NotificationData): string {
    const { template, data } = notification;
    
    const baseStyles = `
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .certificate-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
        .approved { background: #d4edda; color: #155724; }
        .rejected { background: #f8d7da; color: #721c24; }
        .auto-approved { background: #d1ecf1; color: #0c5460; }
        .pending { background: #fff3cd; color: #856404; }
        .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    `;

    let content = '';

    switch (template) {
      case 'certificate_approved':
        content = `
          <div class="certificate-card">
            <h3>Certificate Approved!</h3>
            <p>Great news! Your certificate has been reviewed and approved by our faculty.</p>
            <p><strong>Certificate:</strong> ${data.certificateTitle}</p>
            <p><strong>Institution:</strong> ${data.institution}</p>
            <p><strong>Verification Method:</strong> ${data.verificationMethod || 'Manual Review'}</p>
            <span class="status-badge approved">Approved</span>
          </div>
        `;
        break;

      case 'certificate_auto_approved':
        content = `
          <div class="certificate-card">
            <h3>Certificate Auto-Approved!</h3>
            <p>Your certificate has been automatically verified and approved using our smart verification system.</p>
            <p><strong>Certificate:</strong> ${data.certificateTitle}</p>
            <p><strong>Institution:</strong> ${data.institution}</p>
            <p><strong>Confidence Score:</strong> ${Math.round((data.confidenceScore || 0) * 100)}%</p>
            <p><strong>Verification Method:</strong> ${data.verificationMethod || 'Automated Verification'}</p>
            <span class="status-badge auto-approved">Auto-Approved</span>
          </div>
        `;
        break;

      case 'certificate_rejected':
        content = `
          <div class="certificate-card">
            <h3>Certificate Rejected</h3>
            <p>Unfortunately, your certificate could not be verified and has been rejected.</p>
            <p><strong>Certificate:</strong> ${data.certificateTitle}</p>
            <p><strong>Institution:</strong> ${data.institution}</p>
            <p>Please ensure your certificate is clear, authentic, and meets our verification standards.</p>
            <span class="status-badge rejected">Rejected</span>
          </div>
        `;
        break;

      case 'manual_review_required':
        content = `
          <div class="certificate-card">
            <h3>Manual Review Required</h3>
            <p>Your certificate requires manual review by our faculty team.</p>
            <p><strong>Certificate:</strong> ${data.certificateTitle}</p>
            <p><strong>Institution:</strong> ${data.institution}</p>
            <p><strong>Confidence Score:</strong> ${Math.round((data.confidenceScore || 0) * 100)}%</p>
            <p>Our team will review your certificate and notify you of the decision soon.</p>
            <span class="status-badge pending">Pending Review</span>
          </div>
        `;
        break;

      case 'role_approved':
        content = `
          <div class="certificate-card">
            <h3>Role Request Approved!</h3>
            <p>Great news! Your role request has been approved by our admin team.</p>
            <p><strong>Requested Role:</strong> ${data.requestedRole}</p>
            <p><strong>Institution:</strong> ${data.institution}</p>
            <p><strong>Admin Notes:</strong> ${data.adminNotes}</p>
            <p>You can now access your new dashboard and features.</p>
            <a href="${data.dashboardUrl}" class="button">Access Dashboard</a>
            <span class="status-badge approved">Approved</span>
          </div>
        `;
        break;

      case 'role_denied':
        content = `
          <div class="certificate-card">
            <h3>Role Request Denied</h3>
            <p>Unfortunately, your role request has been denied.</p>
            <p><strong>Requested Role:</strong> ${data.requestedRole}</p>
            <p><strong>Reason:</strong> ${data.reason}</p>
            <p><strong>Admin Notes:</strong> ${data.adminNotes}</p>
            <p>If you have questions, please contact our support team.</p>
            <a href="${data.supportUrl}" class="button">Contact Support</a>
            <span class="status-badge rejected">Denied</span>
          </div>
        `;
        break;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${notification.subject}</title>
          ${baseStyles}
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>CampusSync</h1>
              <p>Secure Academic Credential Verification</p>
            </div>
            <div class="content">
              <h2>Hello ${data.studentName || 'Student'}!</h2>
              ${content}
              ${data.portfolioUrl ? `
                <p>
                  <a href="${data.portfolioUrl}" class="button">View Your Portfolio</a>
                </p>
              ` : ''}
              <p>Thank you for using CampusSync for your credential verification needs.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from CampusSync. Please do not reply to this email.</p>
              <p>© 2024 CampusSync. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // Convenience methods for different notification types
  async sendCertificateApproved(to: string, data: NotificationData['data']) {
    return this.sendNotification({
      to,
      subject: 'Certificate Approved - CampusSync',
      template: 'certificate_approved',
      data,
    });
  }

  async sendCertificateAutoApproved(to: string, data: NotificationData['data']) {
    return this.sendNotification({
      to,
      subject: 'Certificate Auto-Approved - CampusSync',
      template: 'certificate_auto_approved',
      data,
    });
  }

  async sendCertificateRejected(to: string, data: NotificationData['data']) {
    return this.sendNotification({
      to,
      subject: 'Certificate Rejected - CampusSync',
      template: 'certificate_rejected',
      data,
    });
  }

  async sendManualReviewRequired(to: string, data: NotificationData['data']) {
    return this.sendNotification({
      to,
      subject: 'Certificate Requires Review - CampusSync',
      template: 'manual_review_required',
      data,
    });
  }

  async sendRoleApproved(to: string, data: NotificationData['data']) {
    return this.sendNotification({
      to,
      subject: 'Role Request Approved - CampusSync',
      template: 'role_approved',
      data,
    });
  }

  async sendRoleDenied(to: string, data: NotificationData['data']) {
    return this.sendNotification({
      to,
      subject: 'Role Request Denied - CampusSync',
      template: 'role_denied',
      data,
    });
  }
}

export const emailService = new EmailService();
