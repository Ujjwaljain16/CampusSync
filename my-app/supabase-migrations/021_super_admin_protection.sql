-- Add super admin protection to prevent demotion of the original admin
-- This ensures the system always has a way to recover admin access

-- Add a column to track if a user is the super admin (original admin)
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- Add a constraint to ensure only one super admin exists
CREATE UNIQUE INDEX IF NOT EXISTS unique_super_admin ON public.user_roles (is_super_admin) WHERE is_super_admin = TRUE;

-- Add a comment explaining the super admin concept
COMMENT ON COLUMN public.user_roles.is_super_admin IS 'Marks the original/founder admin who cannot be demoted. Only one super admin can exist.';

-- Create a function to get the super admin
CREATE OR REPLACE FUNCTION public.get_super_admin()
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ur.user_id,
    au.email
  FROM public.user_roles ur
  JOIN auth.users au ON ur.user_id = au.id
  WHERE ur.is_super_admin = TRUE
  LIMIT 1;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_super_admin() TO authenticated;

-- Create a function to check if a user is the super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = p_user_id 
    AND is_super_admin = TRUE
  );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;

-- Automatically designate the first admin as super admin
-- This ensures the very first admin becomes the super admin by default
DO $$
BEGIN
  -- Only run if no super admin exists yet
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE is_super_admin = TRUE) THEN
    -- Find the first admin by creation date and make them super admin
    UPDATE public.user_roles 
    SET is_super_admin = TRUE
    WHERE user_id = (
      SELECT user_id 
      FROM public.user_roles 
      WHERE role = 'admin' 
      ORDER BY created_at ASC 
      LIMIT 1
    );
    
    -- Log the designation
    RAISE NOTICE 'First admin automatically designated as super admin';
  END IF;
END $$;

-- Create a trigger function to automatically designate the first admin as super admin
CREATE OR REPLACE FUNCTION public.auto_designate_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only run if this is an admin role being inserted
  IF NEW.role = 'admin' THEN
    -- Check if this is the first admin (no other admins exist)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE role = 'admin' AND user_id != NEW.user_id
    ) THEN
      -- This is the first admin, make them super admin
      NEW.is_super_admin := TRUE;
      RAISE NOTICE 'First admin automatically designated as super admin: %', NEW.user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS auto_designate_first_admin_trigger ON public.user_roles;
CREATE TRIGGER auto_designate_first_admin_trigger
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_designate_first_admin();
