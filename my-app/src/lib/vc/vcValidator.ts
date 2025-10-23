import { jwtVerify, importJWK } from 'jose';
import type { VerifiableCredential } from '../../types/index';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    issuer: string;
    subject: string;
    issuedAt: Date;
    expiresAt?: Date;
    credentialType: string[];
    keyId: string;
  };
}

export interface ValidationOptions {
  allowExpired?: boolean;
  strictMode?: boolean;
  requiredTypes?: string[];
  allowedIssuers?: string[];
}

export class VCValidator {
  private static readonly SUPPORTED_ALGORITHMS = ['RS256', 'ES256'];
  private static readonly REQUIRED_CONTEXTS = [
    'https://www.w3.org/2018/credentials/v1'
  ];
  private static readonly REQUIRED_TYPES = ['VerifiableCredential'];

  /**
   * Validate a Verifiable Credential
   */
  static async validateVC(
    vc: VerifiableCredential,
    issuerJWK: any,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: any = {};

    try {
      // 1. Basic structure validation
      this.validateBasicStructure(vc, errors);

      // 2. Context validation
      this.validateContexts(vc, errors, warnings);

      // 3. Type validation
      this.validateTypes(vc, errors, options);

      // 4. Issuer validation
      this.validateIssuer(vc, errors, options);

      // 5. Subject validation
      this.validateSubject(vc, errors, metadata);

      // 6. Date validation
      this.validateDates(vc, errors, warnings, options, metadata);

      // 7. Proof validation
      if (vc.proof) {
        await this.validateProof(vc, issuerJWK, errors, metadata);
      } else {
        errors.push('Missing proof in Verifiable Credential');
      }

      // 8. Schema validation
      this.validateSchema(vc, errors, warnings);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        metadata
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        metadata: {
          issuer: '',
          subject: '',
          issuedAt: new Date(0),
          credentialType: [],
          keyId: ''
        }
      };
    }
  }

  /**
   * Validate basic VC structure
   */
  private static validateBasicStructure(vc: VerifiableCredential, errors: string[]): void {
    if (!vc['@context']) {
      errors.push('Missing @context');
    }

    if (!vc.type) {
      errors.push('Missing type');
    }

    if (!vc.issuer) {
      errors.push('Missing issuer');
    }

    if (!vc.credentialSubject) {
      errors.push('Missing credentialSubject');
    }

    if (!vc.issuanceDate) {
      errors.push('Missing issuanceDate');
    }

    if (!vc.id) {
      errors.push('Missing credential ID');
    }
  }

  /**
   * Validate contexts
   */
  private static validateContexts(vc: VerifiableCredential, errors: string[], warnings: string[]): void {
    if (!Array.isArray(vc['@context'])) {
      errors.push('@context must be an array');
      return;
    }

    const contexts = vc['@context'];
    const hasRequiredContext = contexts.some(ctx => 
      typeof ctx === 'string' && ctx.includes('credentials/v1')
    );

    if (!hasRequiredContext) {
      errors.push('Missing required W3C Verifiable Credentials context');
    }

    // Check for additional contexts
    const additionalContexts = contexts.filter(ctx => 
      typeof ctx === 'string' && !ctx.includes('credentials/v1')
    );

    if (additionalContexts.length > 0) {
      warnings.push(`Additional contexts found: ${additionalContexts.join(', ')}`);
    }
  }

  /**
   * Validate types
   */
  private static validateTypes(vc: VerifiableCredential, errors: string[], options: ValidationOptions): void {
    if (!Array.isArray(vc.type)) {
      errors.push('type must be an array');
      return;
    }

    const types = vc.type;
    const hasRequiredType = types.includes('VerifiableCredential');

    if (!hasRequiredType) {
      errors.push('Missing required VerifiableCredential type');
    }

    // Check required types
    if (options.requiredTypes) {
      const missingTypes = options.requiredTypes.filter(requiredType => 
        !types.includes(requiredType)
      );
      if (missingTypes.length > 0) {
        errors.push(`Missing required types: ${missingTypes.join(', ')}`);
      }
    }
  }

  /**
   * Validate issuer
   */
  private static validateIssuer(vc: VerifiableCredential, errors: string[], options: ValidationOptions): void {
    if (typeof vc.issuer !== 'string') {
      errors.push('Issuer must be a string');
      return;
    }

    // Check if issuer is in allowed list
    if (options.allowedIssuers && !options.allowedIssuers.includes(vc.issuer)) {
      errors.push(`Issuer ${vc.issuer} is not in the allowed issuers list`);
    }

    // Validate DID format
    if (!vc.issuer.startsWith('did:')) {
      errors.push('Issuer must be a valid DID');
    }
  }

  /**
   * Validate subject
   */
  private static validateSubject(vc: VerifiableCredential, errors: string[], metadata: any): void {
    const subject = vc.credentialSubject;

    if (typeof subject !== 'object' || subject === null) {
      errors.push('credentialSubject must be an object');
      return;
    }

    if (!subject.id) {
      errors.push('credentialSubject must have an id');
      return;
    }

    metadata.subject = subject.id;

    // Validate subject ID format
    if (typeof subject.id !== 'string') {
      errors.push('credentialSubject.id must be a string');
    } else if (!subject.id.startsWith('did:') && !subject.id.startsWith('http')) {
      errors.push('credentialSubject.id must be a valid DID or URI');
    }
  }

  /**
   * Validate dates
   */
  private static validateDates(
    vc: VerifiableCredential, 
    errors: string[], 
    warnings: string[], 
    options: ValidationOptions,
    metadata: any
  ): void {
    const now = new Date();
    
    // Validate issuance date
    try {
      const issuedAt = new Date(vc.issuanceDate);
      if (isNaN(issuedAt.getTime())) {
        errors.push('Invalid issuanceDate format');
      } else {
        metadata.issuedAt = issuedAt;
        
        // Check if issued in the future
        if (issuedAt > now) {
          errors.push('issuanceDate cannot be in the future');
        }
      }
    } catch (error) {
      errors.push('Invalid issuanceDate format');
    }

    // Validate expiration date
    if (vc.expirationDate) {
      try {
        const expiresAt = new Date(vc.expirationDate);
        if (isNaN(expiresAt.getTime())) {
          errors.push('Invalid expirationDate format');
        } else {
          metadata.expiresAt = expiresAt;
          
          // Check if expired
          if (expiresAt <= now && !options.allowExpired) {
            errors.push('Credential has expired');
          }
        }
      } catch (error) {
        errors.push('Invalid expirationDate format');
      }
    }
  }

  /**
   * Validate proof
   */
  private static async validateProof(
    vc: VerifiableCredential, 
    issuerJWK: any, 
    errors: string[], 
    metadata: any
  ): Promise<void> {
    const proof = vc.proof;
    if (!proof) {
      errors.push('Missing proof object');
      return;
    }
    if (!proof.type) {
      errors.push('Proof missing type');
      return;
    }
    if (!proof.verificationMethod) {
      errors.push('Proof missing verificationMethod');
      return;
    }
    if (!proof.jws) {
      errors.push('Proof missing jws');
      return;
    }
    // Extract key ID from verification method
    const keyId = proof.verificationMethod.split('#')[1];
    metadata.keyId = keyId;
    // Validate JWS signature
    try {
      const key = await importJWK(issuerJWK, issuerJWK.alg);
      const { payload } = await jwtVerify(proof.jws, key);
      // Verify the payload matches the VC
      if (JSON.stringify(payload.vc) !== JSON.stringify(vc)) {
        errors.push('JWS payload does not match Verifiable Credential');
      }
    } catch (error) {
      errors.push(`JWS verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate schema compliance
   */
  private static validateSchema(vc: VerifiableCredential, errors: string[], warnings: string[]): void {
    // Check for required fields in credentialSubject
    const subject = vc.credentialSubject;
    
    if (subject && typeof subject === 'object') {
      // Check for common certificate fields
      const commonFields = ['certificateId', 'title', 'institution', 'dateIssued'];
      const missingFields = commonFields.filter(field => !(field in subject));
      
      if (missingFields.length > 0) {
        warnings.push(`Missing common certificate fields: ${missingFields.join(', ')}`);
      }
    }

    // Check for proper credential ID format
    if (vc.id && !vc.id.startsWith('urn:uuid:')) {
      warnings.push('Credential ID should follow urn:uuid: format');
    }
  }

  /**
   * Validate VC against a specific schema
   */
  static validateAgainstSchema(vc: VerifiableCredential, schema: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Implement schema validation logic here
    // This would typically use a JSON Schema validator

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        issuer: '',
        subject: '',
        issuedAt: new Date(0),
        credentialType: [],
        keyId: ''
      }
    };
  }
}
