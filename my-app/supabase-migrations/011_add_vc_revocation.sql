-- Add revocation support for verifiable credentials

-- Ensure verifiable_credentials table has required columns
ALTER TABLE IF EXISTS verifiable_credentials
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

-- Create revocation_list table to track revocations
CREATE TABLE IF NOT EXISTS revocation_list (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id TEXT NOT NULL,
  reason TEXT,
  revoked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revocation_list_credential_id ON revocation_list(credential_id);

-- Basic RLS setup (allow read to all, writes typically by service/admin)
ALTER TABLE revocation_list ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY revocation_list_read ON revocation_list
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


