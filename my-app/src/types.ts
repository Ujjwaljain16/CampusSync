export interface OcrExtractionResult {
  title?: string;
  institution?: string;
  date_issued?: string;
  student_name?: string;
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
