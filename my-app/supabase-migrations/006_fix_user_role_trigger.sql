-- Migration 006: Fix user role trigger to handle conflicts
-- This fixes the "duplicate key value violates unique constraint" error

-- Update the function to handle conflicts gracefully
CREATE OR REPLACE FUNCTION assign_default_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_roles (user_id, role, created_at, updated_at)
  VALUES (NEW.id, 'student', NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The trigger is already created, so no need to recreate it
