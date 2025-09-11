// Global TypeScript type definitions for CredentiVault

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Certificate {
  id: string;
  title: string;
  institution: string;
  date_issued: string;
  description?: string;
  file_url?: string;
  verification_status: 'verified' | 'pending' | 'rejected';
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Roles within the system
export type UserRole = 'student' | 'faculty' | 'admin';

// OCR extraction result for a certificate image/PDF
export interface OcrExtractionResult {
  title?: string;
  institution?: string;
  date_issued?: string;
  description?: string;
  raw_text?: string;
  confidence?: number; // 0..1
}

// Faculty approval workflow entity
export interface ApprovalRequest {
  id: string;
  certificate_id: string;
  student_id: string;
  faculty_id?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note?: string;
  created_at: string;
  updated_at: string;
}

// Minimal W3C VC types used in issuance
export interface CredentialSubject {
  id: string; // subject DID or user id
  certificateId: string;
  title: string;
  institution: string;
  dateIssued: string; // ISO8601
  description?: string;
}

export interface DataIntegrityProof {
  type: string; // e.g., JsonWebSignature2020 or Ed25519Signature2020
  created: string; // ISO8601
  proofPurpose: 'assertionMethod';
  verificationMethod: string; // DID URL
  jws?: string; // compact JWS if using JOSE
}

export interface VerifiableCredential {
  '@context': (string | Record<string, unknown>)[];
  type: string[]; // e.g., ['VerifiableCredential', 'AchievementCredential']
  issuer: string; // issuer DID or URI
  issuanceDate: string; // ISO8601
  expirationDate?: string; // ISO8601
  id?: string; // VC id
  credentialSubject: CredentialSubject;
  proof?: DataIntegrityProof;
}

export interface AuthFormData {
  email: string;
  password: string;
}

export interface AuthError {
  message: string;
  code?: string;
}

export type AuthMode = 'login' | 'signup';

export interface NavigationItem {
  label: string;
  href: string;
  icon?: string;
}

export interface FeatureCard {
  title: string;
  description: string;
  icon: string;
  gradient: string;
  status?: 'verified' | 'pending' | 'live';
}

export interface Stats {
  certificates: number;
  institutions: number;
  accuracy: number;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form validation types
export interface ValidationError {
  field: string;
  message: string;
}

export interface FormState {
  isValid: boolean;
  errors: ValidationError[];
  isSubmitting: boolean;
}
