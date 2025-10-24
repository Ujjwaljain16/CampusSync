-- =====================================================
-- SIMPLE FIX FOR VERIFIABLE_CREDENTIALS TABLE
-- =====================================================
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Check current schema
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'verifiable_credentials'
ORDER BY ordinal_position;

-- =====================================================
-- If user_id exists and student_id doesn't exist:
-- =====================================================

-- Add student_id column (allow NULL temporarily)
ALTER TABLE verifiable_credentials 
ADD COLUMN IF NOT EXISTS student_id UUID;

-- Copy data from user_id to student_id
UPDATE verifiable_credentials 
SET student_id = user_id 
WHERE student_id IS NULL;

-- Make student_id NOT NULL
ALTER TABLE verifiable_credentials 
ALTER COLUMN student_id SET NOT NULL;

-- Add foreign key
ALTER TABLE verifiable_credentials 
ADD CONSTRAINT verifiable_credentials_student_id_fkey 
FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old user_id column
ALTER TABLE verifiable_credentials 
DROP COLUMN user_id CASCADE;

-- =====================================================
-- Add indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_student_id 
ON verifiable_credentials(student_id);

CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_status 
ON verifiable_credentials(status);

CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_student_status 
ON verifiable_credentials(student_id, status);

-- =====================================================
-- Verify final schema
-- =====================================================

SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'verifiable_credentials'
ORDER BY ordinal_position;

-- You should see:
-- student_id | uuid | NO
-- (no user_id column)
