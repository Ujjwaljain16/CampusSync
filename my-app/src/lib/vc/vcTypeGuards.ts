import type { VerifiableCredential } from '@/types/index';

export function isVerifiableCredential(obj: any): obj is VerifiableCredential {
  return (
    obj &&
    typeof obj === 'object' &&
    Array.isArray(obj['@context']) &&
    Array.isArray(obj.type) &&
    typeof obj.issuer === 'string' &&
    typeof obj.issuanceDate === 'string' &&
    typeof obj.credentialSubject === 'object' &&
    obj.credentialSubject !== null
  );
}
