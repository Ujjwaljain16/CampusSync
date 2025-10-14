-- Fix profiles table schema - add missing columns
-- This script adds the missing columns that the authenticated test needs

-- Add email column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'email') THEN
        ALTER TABLE profiles ADD COLUMN email TEXT;
    END IF;
END $$;

-- Add department column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'department') THEN
        ALTER TABLE profiles ADD COLUMN department TEXT;
    END IF;
END $$;

-- Add company column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'company') THEN
        ALTER TABLE profiles ADD COLUMN company TEXT;
    END IF;
END $$;

-- Add university column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'university') THEN
        ALTER TABLE profiles ADD COLUMN university TEXT;
    END IF;
END $$;

-- Add major column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'major') THEN
        ALTER TABLE profiles ADD COLUMN major TEXT;
    END IF;
END $$;

-- Add gpa column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'gpa') THEN
        ALTER TABLE profiles ADD COLUMN gpa DECIMAL(3,2);
    END IF;
END $$;

-- Update existing profiles to have email from auth.users
UPDATE profiles 
SET email = auth.users.email 
FROM auth.users 
WHERE profiles.id = auth.users.id 
AND profiles.email IS NULL;

-- Create index on email for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Add RLS policy for email access
DROP POLICY IF EXISTS "Users can view own profile email" ON profiles;
CREATE POLICY "Users can view own profile email" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Add RLS policy for email updates
DROP POLICY IF EXISTS "Users can update own profile email" ON profiles;
CREATE POLICY "Users can update own profile email" ON profiles
    FOR UPDATE USING (auth.uid() = id);

COMMIT;
