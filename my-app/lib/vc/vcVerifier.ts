import { jwtVerify, importJWK } from 'jose';
import { VCValidator, type ValidationResult } from './vcValidator';
import { VCRevocationManager, type RevocationCheckResult } from './vcRevocationManager';
import type { VerifiableCredential } from '../../src/types/index';

export interface VerificationOptions {
  allowExpired?: boolean;
  strictMode?: boolean;
  checkRevocation?: boolean;
  requiredTypes?: string[];
  allowedIssuers?: string[];
  trustedKeys?: Map<string, any>;
}

export interface VerificationResult {
  isValid: boolean;
  credential: VerifiableCredential;
  errors: string[];
  warnings: string[];
  metadata: {
    issuer: string;
    subject: string;
    issuedAt: Date;
    expiresAt?: Date;
    credentialType: string[];
    keyId: string;
    verificationMethod: string;
  };
  revocationStatus?: RevocationCheckResult;
  validationDetails: ValidationResult;
}

export interface VerificationReport {
  credentialId: string;
  verifiedAt: Date;
  verifierId: string;
  result: VerificationResult;
  verificationMethod: string;
  processingTime: number; // milliseconds
}

export class ProductionVCVerifier {
  private static instance: ProductionVCVerifier;
  private revocationManager: VCRevocationManager;
  private verificationHistory: Map<string, VerificationReport> = new Map();
  private trustedKeys: Map<string, any> = new Map();

  constructor() {
    this.revocationManager = VCRevocationManager.getInstance();
  }

  static getInstance(): ProductionVCVerifier {
    if (!ProductionVCVerifier.instance) {
      ProductionVCVerifier.instance = new ProductionVCVerifier();
    }
    return ProductionVCVerifier.instance;
  }

  /**
   * Verify a Verifiable Credential
   */
  async verifyCredential(
    vc: VerifiableCredential,
    options: VerificationOptions = {},
    verifierId: string = 'system'
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: any = {};

    try {
      // 1. Basic structure validation
      const validationResult = await VCValidator.validateVC(vc, null, {
        allowExpired: options.allowExpired,
        strictMode: options.strictMode,
        requiredTypes: options.requiredTypes,
        allowedIssuers: options.allowedIssuers
      });

      if (!validationResult.isValid) {
        errors.push(...validationResult.errors);
      }

      warnings.push(...validationResult.warnings);

      // 2. Extract metadata
      metadata.issuer = vc.issuer;
      metadata.subject = vc.credentialSubject.id;
      metadata.issuedAt = new Date(vc.issuanceDate);
      metadata.credentialType = vc.type;
      
      if (vc.expirationDate) {
        metadata.expiresAt = new Date(vc.expirationDate);
      }

      if (vc.proof) {
        metadata.keyId = vc.proof.verificationMethod.split('#')[1];
        metadata.verificationMethod = vc.proof.verificationMethod;
      }

      // 3. Verify digital signature
      if (vc.proof && vc.proof.jws) {
        const signatureValid = await this.verifySignature(vc, options);
        if (!signatureValid) {
          errors.push('Digital signature verification failed');
        }
      } else {
        errors.push('Missing proof or JWS in Verifiable Credential');
      }

      // 4. Check revocation status
      let revocationStatus: RevocationCheckResult | undefined;
      if (options.checkRevocation !== false) {
        if (!vc.id) {
          errors.push('Credential is missing an id');
        } else {
          revocationStatus = await this.revocationManager.checkRevocationStatus(
            vc.id,
            vc.issuer
          );
          if (revocationStatus.isRevoked) {
            errors.push(`Credential has been revoked: ${revocationStatus.revocationRecord?.reason.description}`);
          }
        }
      }

      // 5. Verify issuer trust
      if (options.allowedIssuers && !options.allowedIssuers.includes(vc.issuer)) {
        errors.push(`Issuer ${vc.issuer} is not in the trusted issuers list`);
      }

      // 6. Verify credential schema
      const schemaValid = this.verifyCredentialSchema(vc);
      if (!schemaValid.valid) {
        errors.push(...schemaValid.errors);
        warnings.push(...schemaValid.warnings);
      }

      // 7. Check credential expiration
      if (vc.expirationDate && !options.allowExpired) {
        const now = new Date();
        const expiresAt = new Date(vc.expirationDate);
        if (expiresAt <= now) {
          errors.push('Credential has expired');
        }
      }

      // 8. Record verification
      const processingTime = Date.now() - startTime;
      const report: VerificationReport = {
        credentialId: vc.id || '',
        verifiedAt: new Date(),
        verifierId,
        result: {
          isValid: errors.length === 0,
          credential: vc,
          errors,
          warnings,
          metadata,
          revocationStatus,
          validationDetails: validationResult
        },
        verificationMethod: 'JsonWebSignature2020',
        processingTime
      };

      if (vc.id) {
        this.verificationHistory.set(vc.id, report);
      }

      return report.result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const report: VerificationReport = {
        credentialId: vc.id || '',
        verifiedAt: new Date(),
        verifierId,
        result: {
          isValid: false,
          credential: vc,
          errors: [`Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`],
          warnings: [],
          metadata: {
            issuer: '',
            subject: '',
            issuedAt: new Date(),
            credentialType: [],
            keyId: '',
            verificationMethod: ''
          },
          validationDetails: {
            isValid: false,
            errors: [`Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`],
            warnings: [],
            metadata: {
              issuer: '',
              subject: '',
              issuedAt: new Date(),
              credentialType: [],
              keyId: ''
            }
          }
        },
        verificationMethod: 'JsonWebSignature2020',
        processingTime
      };

      if (vc.id) {
        this.verificationHistory.set(vc.id, report);
      }

      return report.result;
    }
  }

  /**
   * Verify digital signature
   */
  private async verifySignature(vc: VerifiableCredential, options: VerificationOptions): Promise<boolean> {
    if (!vc.proof || !vc.proof.jws) {
      return false;
    }

    try {
      // Extract key ID from verification method
      const keyId = vc.proof.verificationMethod.split('#')[1];
      
      // Get the signing key
      let signingKey = options.trustedKeys?.get(keyId);
      
      if (!signingKey) {
        // Try to fetch key from issuer's key registry
        signingKey = await this.fetchIssuerKey(vc.issuer, keyId);
      }

      if (!signingKey) {
        throw new Error(`Signing key not found: ${keyId}`);
      }

      // Import the key
      const key = await importJWK(signingKey, signingKey.alg);

      // Verify the JWS
      const { payload } = await jwtVerify(vc.proof.jws, key);

      // Verify the payload matches the VC
      const vcFromPayload = payload.vc as VerifiableCredential;
      if (!vcFromPayload || JSON.stringify(vcFromPayload) !== JSON.stringify(vc)) {
        throw new Error('JWS payload does not match Verifiable Credential');
      }

      return true;

    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Fetch issuer key from key registry
   */
  private async fetchIssuerKey(issuer: string, keyId: string): Promise<any> {
    // In a production system, this would fetch from the issuer's key registry
    // For now, we'll return null and rely on trusted keys being provided
    return null;
  }

  /**
   * Verify credential schema
   */
  private verifyCredentialSchema(vc: VerifiableCredential): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!vc.id) {
      errors.push('Missing credential ID');
    }

    if (!vc.issuer) {
      errors.push('Missing issuer');
    }

    if (!vc.credentialSubject) {
      errors.push('Missing credential subject');
    }

    if (!vc.issuanceDate) {
      errors.push('Missing issuance date');
    }

    // Check credential subject structure
    if (vc.credentialSubject && typeof vc.credentialSubject === 'object') {
      const subject = vc.credentialSubject;
      
      if (!subject.id) {
        errors.push('Missing subject ID');
      }

      // Check for common certificate fields
      const commonFields = ['certificateId', 'title', 'institution', 'dateIssued'];
      const missingFields = commonFields.filter(field => !(field in subject));
      
      if (missingFields.length > 0) {
        warnings.push(`Missing common certificate fields: ${missingFields.join(', ')}`);
      }
    }

    // Check proof structure
    if (vc.proof) {
      if (!vc.proof.type) {
        errors.push('Missing proof type');
      }

      if (!vc.proof.verificationMethod) {
        errors.push('Missing verification method');
      }

      if (!vc.proof.jws) {
        errors.push('Missing JWS');
      }

      if (!vc.proof.created) {
        errors.push('Missing proof creation date');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Batch verify multiple credentials
   */
  async batchVerifyCredentials(
    credentials: VerifiableCredential[],
    options: VerificationOptions = {},
    verifierId: string = 'system'
  ): Promise<VerificationResult[]> {
    const results = await Promise.all(
      credentials.map(vc => this.verifyCredential(vc, options, verifierId))
    );

    return results;
  }

  /**
   * Get verification history
   */
  getVerificationHistory(credentialId?: string): VerificationReport[] {
    if (credentialId) {
      const report = this.verificationHistory.get(credentialId);
      return report ? [report] : [];
    }

    return Array.from(this.verificationHistory.values());
  }

  /**
   * Get verification statistics
   */
  getVerificationStats(): {
    totalVerifications: number;
    successfulVerifications: number;
    failedVerifications: number;
    averageProcessingTime: number;
    byVerifier: Record<string, number>;
  } {
    const reports = Array.from(this.verificationHistory.values());
    
    return {
      totalVerifications: reports.length,
      successfulVerifications: reports.filter(r => r.result.isValid).length,
      failedVerifications: reports.filter(r => !r.result.isValid).length,
      averageProcessingTime: reports.reduce((sum, r) => sum + r.processingTime, 0) / reports.length || 0,
      byVerifier: reports.reduce((acc, r) => {
        acc[r.verifierId] = (acc[r.verifierId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  /**
   * Add trusted key
   */
  addTrustedKey(keyId: string, key: any): void {
    this.trustedKeys.set(keyId, key);
  }

  /**
   * Remove trusted key
   */
  removeTrustedKey(keyId: string): void {
    this.trustedKeys.delete(keyId);
  }

  /**
   * Get all trusted keys
   */
  getTrustedKeys(): Map<string, any> {
    return new Map(this.trustedKeys);
  }

  /**
   * Clear verification history
   */
  clearVerificationHistory(): void {
    this.verificationHistory.clear();
  }
}
