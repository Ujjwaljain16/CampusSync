-- Make assign_default_role robust when user_roles is not yet created
CREATE OR REPLACE FUNCTION assign_default_role()
RETURNS TRIGGER AS $func$
BEGIN
  -- Guard in case migrations reorder or table temporarily missing
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role, created_at, updated_at)
    VALUES (NEW.id, 'student', NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

