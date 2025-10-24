-- ============================================================
-- RECRUITER DASHBOARD DATABASE TABLES
-- ============================================================
-- Run these SQL commands in your Supabase SQL Editor
-- ============================================================

-- 1. RECRUITER FAVORITES TABLE
-- Stores bookmarked/favorite students per recruiter
-- ============================================================
CREATE TABLE IF NOT EXISTS recruiter_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_recruiter_favorite UNIQUE(recruiter_id, student_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_recruiter_favorites_recruiter 
  ON recruiter_favorites(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_favorites_student 
  ON recruiter_favorites(student_id);

-- Enable Row Level Security
ALTER TABLE recruiter_favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Recruiters can only manage their own favorites
CREATE POLICY "Recruiters manage their favorites" 
  ON recruiter_favorites
  FOR ALL 
  USING (auth.uid() = recruiter_id)
  WITH CHECK (auth.uid() = recruiter_id);

COMMENT ON TABLE recruiter_favorites IS 'Tracks which students each recruiter has favorited/bookmarked';

-- ============================================================
-- 2. RECRUITER PIPELINE TABLE
-- Tracks recruitment stage for each student per recruiter
-- ============================================================
CREATE TABLE IF NOT EXISTS recruiter_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('shortlisted', 'contacted', 'interviewed', 'offered', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_recruiter_pipeline UNIQUE(recruiter_id, student_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_recruiter_pipeline_recruiter 
  ON recruiter_pipeline(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_pipeline_student 
  ON recruiter_pipeline(student_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_pipeline_stage 
  ON recruiter_pipeline(stage);

-- Enable Row Level Security
ALTER TABLE recruiter_pipeline ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Recruiters can only manage their own pipeline
CREATE POLICY "Recruiters manage their pipeline" 
  ON recruiter_pipeline
  FOR ALL 
  USING (auth.uid() = recruiter_id)
  WITH CHECK (auth.uid() = recruiter_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_recruiter_pipeline_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_update_recruiter_pipeline_updated_at
  BEFORE UPDATE ON recruiter_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION update_recruiter_pipeline_updated_at();

COMMENT ON TABLE recruiter_pipeline IS 'Tracks recruitment stage (shortlisted, contacted, etc.) for each student';

-- ============================================================
-- 3. RECRUITER CONTACTS TABLE
-- Logs all contact attempts and responses
-- ============================================================
CREATE TABLE IF NOT EXISTS recruiter_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacted_at TIMESTAMPTZ DEFAULT NOW(),
  method TEXT DEFAULT 'email' CHECK (method IN ('email', 'phone', 'linkedin', 'other')),
  notes TEXT,
  response_received BOOLEAN DEFAULT FALSE,
  response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_recruiter_contacts_recruiter 
  ON recruiter_contacts(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_contacts_student 
  ON recruiter_contacts(student_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_contacts_date 
  ON recruiter_contacts(contacted_at);

-- Enable Row Level Security
ALTER TABLE recruiter_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Recruiters can only manage their own contacts
CREATE POLICY "Recruiters manage their contacts" 
  ON recruiter_contacts
  FOR ALL 
  USING (auth.uid() = recruiter_id)
  WITH CHECK (auth.uid() = recruiter_id);

COMMENT ON TABLE recruiter_contacts IS 'Logs all contact attempts with students including responses';

-- ============================================================
-- HELPER VIEWS (Optional but useful)
-- ============================================================

-- View: Recruiter statistics per student
CREATE OR REPLACE VIEW recruiter_student_stats AS
SELECT 
  rp.recruiter_id,
  rp.student_id,
  rp.stage,
  rp.updated_at as stage_updated_at,
  EXISTS(SELECT 1 FROM recruiter_favorites rf 
         WHERE rf.recruiter_id = rp.recruiter_id 
         AND rf.student_id = rp.student_id) as is_favorite,
  COUNT(rc.id) as contact_count,
  MAX(rc.contacted_at) as last_contact_at,
  COUNT(CASE WHEN rc.response_received THEN 1 END) as response_count
FROM recruiter_pipeline rp
LEFT JOIN recruiter_contacts rc 
  ON rc.recruiter_id = rp.recruiter_id 
  AND rc.student_id = rp.student_id
GROUP BY rp.recruiter_id, rp.student_id, rp.stage, rp.updated_at;

COMMENT ON VIEW recruiter_student_stats IS 'Aggregated statistics for each recruiter-student relationship';

-- ============================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================

-- Uncomment to insert sample data
-- INSERT INTO recruiter_pipeline (recruiter_id, student_id, stage, notes)
-- VALUES 
--   ('your-recruiter-uuid', 'student-uuid-1', 'shortlisted', 'Strong ML background'),
--   ('your-recruiter-uuid', 'student-uuid-2', 'contacted', 'Sent initial email');

-- INSERT INTO recruiter_favorites (recruiter_id, student_id)
-- VALUES 
--   ('your-recruiter-uuid', 'student-uuid-1');

-- INSERT INTO recruiter_contacts (recruiter_id, student_id, method, notes)
-- VALUES 
--   ('your-recruiter-uuid', 'student-uuid-2', 'email', 'Initial outreach about internship');

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check if tables were created successfully
SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
  AND tablename LIKE 'recruiter_%';

-- Check RLS policies
SELECT tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename LIKE 'recruiter_%';

-- ============================================================
-- CLEANUP (USE WITH CAUTION!)
-- ============================================================

-- Uncomment ONLY if you need to drop and recreate tables
-- DROP TABLE IF EXISTS recruiter_contacts CASCADE;
-- DROP TABLE IF EXISTS recruiter_pipeline CASCADE;
-- DROP TABLE IF EXISTS recruiter_favorites CASCADE;
-- DROP VIEW IF EXISTS recruiter_student_stats CASCADE;
-- DROP FUNCTION IF EXISTS update_recruiter_pipeline_updated_at() CASCADE;
