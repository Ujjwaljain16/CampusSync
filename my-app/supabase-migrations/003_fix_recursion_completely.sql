-- Complete fix for infinite recursion in user_roles policies
-- This migration should be run if you're still getting recursion errors

-- Step 1: Drop all existing policies
DROP POLICY IF EXISTS "Users can read their own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;

-- Step 2: Disable RLS temporarily to break the recursion
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;

-- Step 3: Drop the problematic function if it exists
DROP FUNCTION IF EXISTS is_admin();

-- Step 4: Create a simple admin check function that doesn't cause recursion
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the user's role directly without using policies
  SELECT role INTO user_role 
  FROM user_roles 
  WHERE user_id = auth.uid();
  
  RETURN user_role = 'admin';
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Re-enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Step 6: Create simple, non-recursive policies
-- Policy: Users can read their own role
CREATE POLICY "Users can read their own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Admins can read all roles
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (is_admin());

-- Policy: Admins can insert roles
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (is_admin());

-- Policy: Admins can update roles
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (is_admin());

-- Policy: Admins can delete roles
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (is_admin());

-- Step 7: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON user_roles TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
