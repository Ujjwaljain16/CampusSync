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
  organization_id: string;
  created_at: string;
}

// Organization types for multi-tenancy
export interface Organization {
  id: string;
  name: string;
  slug: string;
  subdomain?: string;
  custom_domain?: string;
  type: 'university' | 'college' | 'school' | 'institute' | 'enterprise';
  email: string;
  phone?: string;
  address?: OrganizationAddress;
  branding: OrganizationBranding;
  settings: OrganizationSettings;
  subscription: OrganizationSubscription;
  usage_stats: OrganizationUsageStats;
  is_active: boolean;
  is_verified: boolean;
  verified_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
}

export interface OrganizationBranding {
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  favicon_url?: string;
}

export interface OrganizationSettings {
  timezone: string;
  date_format: string;
  language: string;
  allowed_email_domains: string[];
  require_email_verification: boolean;
  enable_sso: boolean;
  sso_provider?: string;
  features: OrganizationFeatures;
}

export interface OrganizationFeatures {
  document_verification: boolean;
  certificate_issuance: boolean;
  student_profiles: boolean;
  recruiter_access: boolean;
  analytics: boolean;
}

export interface OrganizationSubscription {
  plan: 'free' | 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'inactive' | 'suspended' | 'trial';
  billing_email?: string;
  max_users: number;
  max_documents_per_month: number;
  max_storage_gb: number;
  started_at?: string;
  expires_at?: string;
  trial_ends_at?: string;
}

export interface OrganizationUsageStats {
  total_users: number;
  total_documents: number;
  total_storage_bytes: number;
  monthly_api_calls: number;
  last_calculated_at?: string;
}

export interface UserWithOrganization extends User {
  organization_id: string;
  organization?: Organization;
  role: 'student' | 'faculty' | 'admin' | 'recruiter' | 'org_admin' | 'super_admin';
}

export interface OrganizationContext {
  currentOrganization: Organization | null;
  organizations: Organization[];
  switchOrganization: (orgId: string) => Promise<void>;
  refreshOrganization: () => Promise<void>;
  isLoading: boolean;
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


