import type { VerifiableCredential } from '@/types/index';

export function isVerifiableCredential(obj: unknown): obj is VerifiableCredential {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  
  const record = obj as Record<string, unknown>;
  return (
    Array.isArray(record['@context']) &&
    Array.isArray(record.type) &&
    typeof record.issuer === 'string' &&
    typeof record.issuanceDate === 'string' &&
    typeof record.credentialSubject === 'object' &&
    record.credentialSubject !== null
  );
}
