-- Verification Engine Database Schema
-- This migration creates all tables needed for the Smart Verification Engine
-- Using DROP/CREATE approach to ensure clean table creation

-- Drop and recreate verification_results table to ensure clean creation
DROP TABLE IF EXISTS verification_results CASCADE;

-- Create verification_results table
CREATE TABLE verification_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  confidence_score DECIMAL(3,2) NOT NULL DEFAULT 0.0,
  verification_method TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  auto_approved BOOLEAN NOT NULL DEFAULT false,
  requires_manual_review BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_verification_results_certificate_id ON verification_results(certificate_id);
CREATE INDEX IF NOT EXISTS idx_verification_results_confidence_score ON verification_results(confidence_score);
CREATE INDEX IF NOT EXISTS idx_verification_results_auto_approved ON verification_results(auto_approved);

-- Drop and recreate trusted_issuers table to ensure clean creation
DROP TABLE IF EXISTS trusted_issuers CASCADE;

-- Create trusted_issuers table
CREATE TABLE trusted_issuers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  logo_hash TEXT,
  template_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.9,
  qr_verification_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drop verification_rules table if it exists (to ensure clean creation)
DROP TABLE IF EXISTS verification_rules CASCADE;

-- Create verification_rules table
CREATE TABLE verification_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('qr_verification', 'logo_match', 'template_match', 'ai_confidence')),
  weight DECIMAL(3,2) NOT NULL DEFAULT 0.0,
  threshold DECIMAL(3,2) NOT NULL DEFAULT 0.0,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drop and recreate certificate_metadata table to ensure clean creation
DROP TABLE IF EXISTS certificate_metadata CASCADE;

-- Create certificate_metadata table
CREATE TABLE certificate_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  qr_code_data TEXT,
  qr_verified BOOLEAN NOT NULL DEFAULT false,
  logo_hash TEXT,
  logo_match_score DECIMAL(3,2),
  template_match_score DECIMAL(3,2),
  ai_confidence_score DECIMAL(3,2),
  verification_method TEXT,
  verification_details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(certificate_id)
);

-- Insert sample trusted issuers
INSERT INTO trusted_issuers (name, domain, template_patterns, confidence_threshold, qr_verification_url, is_active) VALUES
('Coursera', 'coursera.org', '["This is to certify that", "has successfully completed", "Coursera", "certificate of completion"]'::jsonb, 0.9, 'https://coursera.org/verify/', true),

('edX', 'edx.org', '["This is to certify that", "has successfully completed", "edX", "certificate of achievement"]'::jsonb, 0.9, 'https://credentials.edx.org/credentials/', true),

('Udemy', 'udemy.com', '["Certificate of Completion", "has successfully completed", "Udemy", "course completion"]'::jsonb, 0.85, 'https://udemy.com/certificate/', true),

('NPTEL', 'nptel.ac.in', '["National Programme on Technology Enhanced Learning", "Indian Institute of Technology", "NPTEL", "certificate of completion"]'::jsonb, 0.95, 'https://nptel.ac.in/verify/', true),

('Google', 'google.com', '["Google", "certificate of completion", "has successfully completed", "Google Career Certificates"]'::jsonb, 0.9, 'https://www.credly.com/badges/', true),

('Microsoft', 'microsoft.com', '["Microsoft", "certificate of completion", "Microsoft Learn", "has successfully completed"]'::jsonb, 0.9, 'https://learn.microsoft.com/api/credentials/', true),

('AWS', 'amazon.com', '["Amazon Web Services", "AWS", "certificate of completion", "has successfully completed"]'::jsonb, 0.9, 'https://aws.amazon.com/verification/', true),

('IBM', 'ibm.com', '["IBM", "certificate of completion", "has successfully completed", "IBM SkillsBuild"]'::jsonb, 0.9, 'https://skillsbuild.org/verify/', true),

('University Event', 'university.edu', '["This is to certify that", "has participated in", "workshop", "seminar", "conference", "event"]'::jsonb, 0.7, NULL, true),

('College Event', 'college.edu', '["Certificate of Participation", "has participated in", "college", "institute", "event"]'::jsonb, 0.7, NULL, true)

ON CONFLICT (name) DO NOTHING;

-- Insert verification rules
INSERT INTO verification_rules (name, rule_type, weight, threshold, config, is_active) VALUES
('QR Code Verification', 'qr_verification', 1.0, 0.99, '{"priority": 1}', true),
('Logo Matching', 'logo_match', 0.25, 0.8, '{"hamming_threshold": 8}', true),
('Template Matching', 'template_match', 0.30, 0.6, '{"min_patterns": 1}', true),
('AI Confidence', 'ai_confidence', 0.45, 0.7, '{"min_factors": 2}', true)

ON CONFLICT (name) DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificate_metadata ENABLE ROW LEVEL SECURITY;

-- RLS Policies for verification_results
CREATE POLICY "Users can read their own verification results" ON verification_results
  FOR SELECT USING (
    certificate_id IN (
      SELECT id FROM certificates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Faculty can read all verification results" ON verification_results
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role IN ('faculty', 'admin')
    )
  );

-- RLS Policies for trusted_issuers (public read)
CREATE POLICY "Anyone can read trusted issuers" ON trusted_issuers
  FOR SELECT USING (is_active = true);

-- RLS Policies for verification_rules (public read)
CREATE POLICY "Anyone can read verification rules" ON verification_rules
  FOR SELECT USING (is_active = true);

-- RLS Policies for certificate_metadata
CREATE POLICY "Users can read their own certificate metadata" ON certificate_metadata
  FOR SELECT USING (
    certificate_id IN (
      SELECT id FROM certificates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Faculty can read all certificate metadata" ON certificate_metadata
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role IN ('faculty', 'admin')
    )
  );
