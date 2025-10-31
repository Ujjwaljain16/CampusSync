export interface OcrExtractionResult {
  title?: string;
  institution?: string;
  date_issued?: string;
  student_name?: string;
  recipient?: string;
  description?: string;
  confidence: number;
  raw_text: string;
  extracted_fields: ExtractedFields;
}

export type ExtractedFields = {
  title?: string;
  institution?: string;
  recipient?: string;
  date_issued?: string;
  certificate_id?: string;
  description?: string;
  [key: string]: unknown;
};

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
  conditions: Record<string, unknown>;
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
  extracted_fields: ExtractedFields;
  verification_details: Record<string, unknown>;
  qr_code_data?: string;
  created_at: string;
  updated_at: string;
}


