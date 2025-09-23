-- Disable RLS on user_roles table to prevent infinite recursion
-- This allows admin operations to work properly

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can read their own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Users can read all roles" ON user_roles;

-- Disable RLS on user_roles table
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;

-- Note: We're disabling RLS because:
-- 1. The admin client needs to query roles without RLS restrictions
-- 2. The policies were causing infinite recursion
-- 3. Role management is handled at the application level with proper authentication checks
