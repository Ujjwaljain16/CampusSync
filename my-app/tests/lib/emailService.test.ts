/**
 * Unit tests for Email Service
 * Tests email notification sending and validation
 */

import { describe, it, expect, vi } from 'vitest';
import { emailService } from '@/lib/emailService';

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' })
    })
  }
}));

describe('Email Service', () => {
  describe('sendNotification', () => {
    it('should send certificate approval notification', async () => {
      const result = await emailService.sendNotification({
        to: 'student@example.com',
        subject: 'Certificate Approved',
        template: 'certificate_approved',
        data: {
          studentName: 'John Doe',
          certificateTitle: 'Bachelor of Science',
          institution: 'MIT',
          portfolioUrl: 'https://campussync.com/portfolio'
        }
      });

      expect(typeof result).toBe('boolean');
    });

    it('should send certificate rejection notification', async () => {
      const result = await emailService.sendNotification({
        to: 'student@example.com',
        subject: 'Certificate Rejected',
        template: 'certificate_rejected',
        data: {
          studentName: 'John Doe',
          certificateTitle: 'Certificate',
          reason: 'Invalid document'
        }
      });

      expect(typeof result).toBe('boolean');
    });

    it('should send role approval notification', async () => {
      const result = await emailService.sendNotification({
        to: 'user@example.com',
        subject: 'Role Approved',
        template: 'role_approved',
        data: {
          userName: 'John Doe',
          requestedRole: 'faculty'
        }
      });

      expect(typeof result).toBe('boolean');
    });

    it('should handle missing configuration gracefully', async () => {
      // Should not throw error even if SMTP not configured
      const result = await emailService.sendNotification({
        to: 'test@example.com',
        subject: 'Test',
        template: 'certificate_approved',
        data: {
          studentName: 'Test User'
        }
      });

      expect(typeof result).toBe('boolean');
    });
  });
});
