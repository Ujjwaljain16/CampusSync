-- Fix the infinite recursion issue in user_roles policies
-- Drop the problematic policies first
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;

-- Create simpler policies that don't cause recursion
-- Policy: Users can read their own role (keep this one)
-- Policy: Admins can read all roles (simplified)
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles 
      WHERE role = 'admin' 
      AND user_id = auth.uid()
    )
  );

-- Policy: Admins can insert roles (simplified)
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM user_roles 
      WHERE role = 'admin' 
      AND user_id = auth.uid()
    )
  );

-- Policy: Admins can update roles (simplified)
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles 
      WHERE role = 'admin' 
      AND user_id = auth.uid()
    )
  );

-- Policy: Admins can delete roles (simplified)
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles 
      WHERE role = 'admin' 
      AND user_id = auth.uid()
    )
  );
