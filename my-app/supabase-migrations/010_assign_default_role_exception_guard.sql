-- Add exception guard so trigger never fails if user_roles missing
CREATE OR REPLACE FUNCTION assign_default_role()
RETURNS TRIGGER AS $func$
BEGIN
  BEGIN
    IF to_regclass('public.user_roles') IS NOT NULL THEN
      INSERT INTO user_roles (user_id, role, created_at, updated_at)
      VALUES (NEW.id, 'student', NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- Safely ignore if user_roles doesn't exist yet
    NULL;
  END;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;


