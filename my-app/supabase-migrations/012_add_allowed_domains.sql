-- Create allowed_domains table for flexible email validation
CREATE TABLE IF NOT EXISTS allowed_domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_allowed_domains_domain ON allowed_domains(domain);
CREATE INDEX IF NOT EXISTS idx_allowed_domains_active ON allowed_domains(is_active);

-- Insert common educational domains
INSERT INTO allowed_domains (domain, description) VALUES
  ('.edu', 'Generic .edu domains'),
  ('.ac.uk', 'UK universities'),
  ('.ac.in', 'Indian universities'),
  ('.ac.jp', 'Japanese universities'),
  ('.ac.au', 'Australian universities'),
  ('.ac.nz', 'New Zealand universities'),
  ('.ac.za', 'South African universities'),
  ('university.', 'Contains university'),
  ('college.', 'Contains college'),
  ('institute.', 'Contains institute'),
  ('school.', 'Contains school'),
  ('campus.', 'Contains campus'),
  ('.edu.', 'Edu subdomains')
ON CONFLICT (domain) DO NOTHING;

-- Enable RLS
ALTER TABLE allowed_domains ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active domains
CREATE POLICY "Anyone can read active domains" ON allowed_domains
  FOR SELECT USING (is_active = true);

-- Policy: Only admins can manage domains
CREATE POLICY "Admins can manage domains" ON allowed_domains
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );
