-- Create user_roles table for role-based access control
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id) -- Each user can only have one role
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Enable RLS (Row Level Security)
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own role
CREATE POLICY "Users can read their own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Admins can read all roles (using auth.jwt() to avoid recursion)
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (
    (auth.jwt() ->> 'role')::text = 'admin'
  );

-- Policy: Admins can insert roles (using auth.jwt() to avoid recursion)
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (
    (auth.jwt() ->> 'role')::text = 'admin'
  );

-- Policy: Admins can update roles (using auth.jwt() to avoid recursion)
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (
    (auth.jwt() ->> 'role')::text = 'admin'
  );

-- Policy: Admins can delete roles (using auth.jwt() to avoid recursion)
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (
    (auth.jwt() ->> 'role')::text = 'admin'
  );

-- Function to automatically assign 'student' role to new users
CREATE OR REPLACE FUNCTION assign_default_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_roles (user_id, role, created_at, updated_at)
  VALUES (NEW.id, 'student', NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to assign default role on user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION assign_default_role();

-- Insert a default admin user (you'll need to replace this with actual admin user ID)
-- This is just a placeholder - you should replace 'your-admin-user-id' with actual UUID
-- INSERT INTO user_roles (user_id, role) VALUES ('your-admin-user-id', 'admin');
