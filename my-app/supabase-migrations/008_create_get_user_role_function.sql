-- Create a function to get user role that bypasses RLS
-- This function uses SECURITY DEFINER to run with elevated privileges

CREATE OR REPLACE FUNCTION get_user_role(user_id_param UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Query user_roles table directly without RLS restrictions
    SELECT role INTO user_role
    FROM user_roles
    WHERE user_id = user_id_param;
    
    -- Return the role or 'student' as default
    RETURN COALESCE(user_role, 'student');
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_role(UUID) TO authenticated;
