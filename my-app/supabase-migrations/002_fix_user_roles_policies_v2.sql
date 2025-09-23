-- Fix the infinite recursion issue in user_roles policies
-- Drop all existing policies first
DROP POLICY IF EXISTS "Users can read their own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;

-- Temporarily disable RLS to avoid recursion issues
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;

-- Create a function to check if current user is admin (without recursion)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if current user has admin role
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Create simple policies that don't cause recursion
-- Policy: Users can read their own role
CREATE POLICY "Users can read their own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Admins can read all roles (using the function)
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (is_admin());

-- Policy: Admins can insert roles (using the function)
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (is_admin());

-- Policy: Admins can update roles (using the function)
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (is_admin());

-- Policy: Admins can delete roles (using the function)
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (is_admin());
