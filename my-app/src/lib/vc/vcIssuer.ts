import { SignJWT, importJWK } from 'jose';
import { randomUUID } from 'crypto';
import { ProductionKeyManager, type ProductionJWK } from './productionKeyManager';
import { VCValidator, type ValidationResult } from './vcValidator';
import type { VerifiableCredential, CredentialSubject } from '../../types/index';
import { getIssuerDID } from '../envValidator';

export interface IssuancePolicy {
  allowedTypes: string[];
  maxValidityPeriod: number; // days
  requiredFields: string[];
  allowedIssuers: string[];
  requiresApproval: boolean;
  maxCredentialsPerUser: number;
  cooldownPeriod: number; // minutes
}

export interface IssuanceRequest {
  credentialSubject: CredentialSubject;
  credentialType: string;
  validityPeriod?: number; // days
  customFields?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface IssuanceResult {
  success: boolean;
  credential?: VerifiableCredential;
  error?: string;
  validationResult?: ValidationResult;
  issuanceId: string;
  timestamp: Date;
}

export interface IssuanceAudit {
  issuanceId: string;
  issuerId: string;
  subjectId: string;
  credentialType: string;
  timestamp: Date;
  policyCompliance: boolean;
  validationPassed: boolean;
  keyId: string;
  metadata: Record<string, unknown>;
}

export class ProductionVCIssuer {
  private keyManager: ProductionKeyManager;
  private issuancePolicies: Map<string, IssuancePolicy> = new Map();
  private issuanceHistory: Map<string, IssuanceAudit> = new Map();
  private userCooldowns: Map<string, Date> = new Map();
  private userCredentialCounts: Map<string, number> = new Map();

  constructor() {
    this.keyManager = ProductionKeyManager.getInstance();
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default issuance policies
   */
  private initializeDefaultPolicies(): void {
    // Certificate issuance policy
    this.issuancePolicies.set('certificate', {
      allowedTypes: ['VerifiableCredential', 'AchievementCredential'],
      maxValidityPeriod: 365 * 10, // 10 years
      requiredFields: ['certificateId', 'title', 'institution', 'dateIssued'],
      allowedIssuers: [getIssuerDID()],
      requiresApproval: true,
      maxCredentialsPerUser: 100,
      cooldownPeriod: 5 // 5 minutes
    });

    // Degree issuance policy
    this.issuancePolicies.set('degree', {
      allowedTypes: ['VerifiableCredential', 'DegreeCredential'],
      maxValidityPeriod: 365 * 50, // 50 years
      requiredFields: ['degreeId', 'degreeName', 'institution', 'dateIssued', 'grade'],
      allowedIssuers: [getIssuerDID()],
      requiresApproval: true,
      maxCredentialsPerUser: 50,
      cooldownPeriod: 10
    });

    // Course completion policy
    this.issuancePolicies.set('course', {
      allowedTypes: ['VerifiableCredential', 'CourseCredential'],
      maxValidityPeriod: 365 * 5, // 5 years
      requiredFields: ['courseId', 'courseName', 'institution', 'dateIssued', 'grade'],
      allowedIssuers: [getIssuerDID()],
      requiresApproval: false,
      maxCredentialsPerUser: 200,
      cooldownPeriod: 1
    });
  }

  /**
   * Issue a Verifiable Credential
   */
  async issueCredential(
    request: IssuanceRequest,
    issuerId: string,
    approvedBy?: string
  ): Promise<IssuanceResult> {
    const issuanceId = randomUUID();
    const timestamp = new Date();

    try {
      // 1. Validate issuance policy
      const policy = this.issuancePolicies.get(request.credentialType);
      if (!policy) {
        return {
          success: false,
          error: `No issuance policy found for credential type: ${request.credentialType}`,
          issuanceId,
          timestamp
        };
      }

      // 2. Check cooldown period
      if (!this.checkCooldown(request.credentialSubject.id, policy.cooldownPeriod)) {
        return {
          success: false,
          error: `User is in cooldown period. Please wait ${policy.cooldownPeriod} minutes.`,
          issuanceId,
          timestamp
        };
      }

      // 3. Check credential limit
      if (!this.checkCredentialLimit(request.credentialSubject.id, policy.maxCredentialsPerUser)) {
        return {
          success: false,
          error: `User has reached maximum credential limit (${policy.maxCredentialsPerUser})`,
          issuanceId,
          timestamp
        };
      }

      // 4. Validate required fields
      const fieldValidation = this.validateRequiredFields(request.credentialSubject, policy.requiredFields);
      if (!fieldValidation.valid) {
        return {
          success: false,
          error: `Missing required fields: ${fieldValidation.missingFields.join(', ')}`,
          issuanceId,
          timestamp
        };
      }

      // 5. Check approval requirement
      if (policy.requiresApproval && !approvedBy) {
        return {
          success: false,
          error: 'This credential type requires approval',
          issuanceId,
          timestamp
        };
      }

      // 6. Get current signing key
      const currentKey = this.keyManager.getCurrentKey();
      if (!currentKey) {
        return {
          success: false,
          error: 'No active signing key available',
          issuanceId,
          timestamp
        };
      }

      // 7. Create the Verifiable Credential
      const credential = await this.createVerifiableCredential(
        request,
        currentKey,
        policy
      );

      // 8. Validate the created credential
      const validationResult = await VCValidator.validateVC(credential, currentKey, {
        strictMode: true,
        requiredTypes: policy.allowedTypes
      });

      if (!validationResult.isValid) {
        return {
          success: false,
          error: `Credential validation failed: ${validationResult.errors.join(', ')}`,
          issuanceId,
          timestamp,
          validationResult
        };
      }

      // 9. Record issuance audit
      const audit: IssuanceAudit = {
        issuanceId,
        issuerId,
        subjectId: request.credentialSubject.id,
        credentialType: request.credentialType,
        timestamp,
        policyCompliance: true,
        validationPassed: true,
        keyId: currentKey.kid,
        metadata: {
          approvedBy,
          customFields: request.customFields,
          validityPeriod: request.validityPeriod
        }
      };

      this.issuanceHistory.set(issuanceId, audit);
      this.updateUserCounts(request.credentialSubject.id);

      return {
        success: true,
        credential,
        issuanceId,
        timestamp,
        validationResult
      };

    } catch (error) {
      // Record failed issuance
      const audit: IssuanceAudit = {
        issuanceId,
        issuerId,
        subjectId: request.credentialSubject.id,
        credentialType: request.credentialType,
        timestamp,
        policyCompliance: false,
        validationPassed: false,
        keyId: '',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };

      this.issuanceHistory.set(issuanceId, audit);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        issuanceId,
        timestamp
      };
    }
  }

  /**
   * Create a Verifiable Credential
   */
  private async createVerifiableCredential(
    request: IssuanceRequest,
    key: ProductionJWK,
    policy: IssuancePolicy
  ): Promise<VerifiableCredential> {
    const now = new Date();
    const validityPeriod = request.validityPeriod || policy.maxValidityPeriod;
    const expiresAt = new Date(now.getTime() + validityPeriod * 24 * 60 * 60 * 1000);

    const issuerDid = getIssuerDID();
    const verificationMethod = `${issuerDid}#${key.kid}`;

    // Create the unsigned VC
    const unsignedVC: VerifiableCredential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        { [policy.allowedTypes[1]]: 'https://purl.imsglobal.org/pec/v1' }
      ],
      type: policy.allowedTypes,
      issuer: issuerDid,
      issuanceDate: now.toISOString(),
      id: `urn:uuid:${randomUUID()}`,
      credentialSubject: {
        ...request.credentialSubject,
        ...request.customFields
      },
      expirationDate: expiresAt.toISOString()
    };

    // Sign the VC
    const jwk = await importJWK(key, key.alg);
    const jws = await new SignJWT({ vc: unsignedVC })
      .setProtectedHeader({ alg: key.alg, kid: key.kid })
      .setIssuer(issuerDid)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(jwk);

    // Return the signed VC
    return {
      ...unsignedVC,
      proof: {
        type: 'JsonWebSignature2020',
        created: now.toISOString(),
        proofPurpose: 'assertionMethod',
        verificationMethod,
        jws
      }
    };
  }

  /**
   * Check cooldown period
   */
  private checkCooldown(userId: string, cooldownMinutes: number): boolean {
    const lastIssuance = this.userCooldowns.get(userId);
    if (!lastIssuance) return true;

    const cooldownEnd = new Date(lastIssuance.getTime() + cooldownMinutes * 60 * 1000);
    return new Date() >= cooldownEnd;
  }

  /**
   * Check credential limit
   */
  private checkCredentialLimit(userId: string, maxCredentials: number): boolean {
    const currentCount = this.userCredentialCounts.get(userId) || 0;
    return currentCount < maxCredentials;
  }

  /**
   * Validate required fields
   */
  private validateRequiredFields(
    subject: CredentialSubject, 
    requiredFields: string[]
  ): { valid: boolean; missingFields: string[] } {
    const missingFields = requiredFields.filter(field => !(field in subject));
    return {
      valid: missingFields.length === 0,
      missingFields
    };
  }

  /**
   * Update user counts and cooldowns
   */
  private updateUserCounts(userId: string): void {
    const currentCount = this.userCredentialCounts.get(userId) || 0;
    this.userCredentialCounts.set(userId, currentCount + 1);
    this.userCooldowns.set(userId, new Date());
  }

  /**
   * Get issuance statistics
   */
  getIssuanceStats(): {
    totalIssuances: number;
    successfulIssuances: number;
    failedIssuances: number;
    byType: Record<string, number>;
    byUser: Record<string, number>;
  } {
    const issuances = Array.from(this.issuanceHistory.values());
    
    return {
      totalIssuances: issuances.length,
      successfulIssuances: issuances.filter(i => i.validationPassed).length,
      failedIssuances: issuances.filter(i => !i.validationPassed).length,
      byType: issuances.reduce((acc, i) => {
        acc[i.credentialType] = (acc[i.credentialType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byUser: issuances.reduce((acc, i) => {
        acc[i.subjectId] = (acc[i.subjectId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  /**
   * Get user credential count
   */
  getUserCredentialCount(userId: string): number {
    return this.userCredentialCounts.get(userId) || 0;
  }

  /**
   * Add or update issuance policy
   */
  setIssuancePolicy(credentialType: string, policy: IssuancePolicy): void {
    this.issuancePolicies.set(credentialType, policy);
  }

  /**
   * Get issuance policy
   */
  getIssuancePolicy(credentialType: string): IssuancePolicy | undefined {
    return this.issuancePolicies.get(credentialType);
  }
}
