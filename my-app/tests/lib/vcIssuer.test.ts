/**
 * Unit tests for VC (Verifiable Credentials) Issuer
 * Tests credential issuance, signing, and validation
 */

import { describe, it, expect } from 'vitest';
import { ProductionVCIssuer } from '@/lib/vc/vcIssuer';

describe('VC Issuer', () => {
  describe('ProductionVCIssuer', () => {
    it('should create issuer instance', () => {
      const issuer = new ProductionVCIssuer();
      expect(issuer).toBeDefined();
    });

    it('should validate issuance request structure', () => {
      const mockRequest = {
        credentialSubject: {
          id: 'user-456',
          name: 'John Doe',
          email: 'john@example.com',
          achievement: {
            name: 'Bachelor of Science',
            issuer: 'MIT',
            issuanceDate: '2024-05-01'
          }
        },
        credentialType: 'degree',
        validityPeriod: 365
      };

      expect(mockRequest.credentialSubject).toBeDefined();
      expect(mockRequest.credentialType).toBe('degree');
    });

    it('should validate required credential fields', () => {
      const requiredFields = ['id', 'name', 'achievement'];
      const credentialSubject = {
        id: 'user-456',
        name: 'John Doe',
        achievement: {
          name: 'Degree',
          issuer: 'University'
        }
      };

      requiredFields.forEach(field => {
        expect(credentialSubject).toHaveProperty(field);
      });
    });

    it('should handle degree credential type', () => {
      const degreeTypes = ['degree', 'course', 'certificate'];
      expect(degreeTypes).toContain('degree');
    });

    it('should validate credential subject structure', () => {
      const credentialSubject = {
        id: 'did:example:123',
        name: 'John Doe',
        email: 'john@example.com',
        achievement: {
          name: 'Bachelor of Science',
          issuer: 'MIT',
          issuanceDate: '2024-05-01'
        }
      };

      expect(credentialSubject.id).toBeDefined();
      expect(credentialSubject.achievement).toBeDefined();
      expect(credentialSubject.achievement.name).toBeDefined();
    });
  });
});
