-- =====================================================
-- CLEANUP DUPLICATE CONSTRAINT
-- =====================================================
-- Purpose: Remove old constraint name after rename
-- This is optional - doesn't affect functionality
-- =====================================================

DO $$
BEGIN
    -- Check if old constraint exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'audit_logs_user_id_fkey'
    ) THEN
        -- Drop the old constraint (it's a duplicate)
        ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_user_id_fkey;
        RAISE NOTICE '✅ Removed duplicate constraint audit_logs_user_id_fkey';
    ELSE
        RAISE NOTICE 'ℹ️  Constraint audit_logs_user_id_fkey already removed';
    END IF;
    
    -- Verify only one constraint remains
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'audit_logs_target_user_id_fkey'
    ) THEN
        RAISE NOTICE '✅ Constraint audit_logs_target_user_id_fkey exists (correct)';
    END IF;
END $$;
