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
