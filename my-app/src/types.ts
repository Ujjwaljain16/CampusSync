export interface OcrExtractionResult {
  title?: string;
  institution?: string;
  date_issued?: string;
  student_name?: string;
  recipient?: string;
  description?: string;
  confidence: number;
  raw_text: string;
  extracted_fields: Record<string, any>;
}

export interface CertificateData {
  title: string;
  institution: string;
  date_issued: string;
  student_name?: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  confidence_score: number;
  verification_method: string;
}

export interface User {
  id: string;
  email: string;
  role: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
}

export interface TrustedIssuer {
  id: string;
  name: string;
  domain: string;
  public_key?: string;
  verification_url?: string;
  qr_verification_url?: string;
  logo_hash?: string;
  template_patterns?: string[];
  created_at: string;
  updated_at: string;
}

export interface VerificationRule {
  id: string;
  name: string;
  description: string;
  conditions: Record<string, any>;
  action: 'approve' | 'reject' | 'manual_review';
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CertificateMetadata {
  id: string;
  certificate_id: string;
  ocr_text: string;
  ocr_confidence: number;
  extracted_fields: Record<string, any>;
  verification_details: Record<string, any>;
  qr_code_data?: string;
  created_at: string;
  updated_at: string;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  method: string;
  details: Record<string, any>;
  certificate_id?: string;
  errors?: string[];
  warnings?: string[];
}
