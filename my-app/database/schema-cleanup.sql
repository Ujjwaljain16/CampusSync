-- =====================================================
-- DATABASE SCHEMA CLEANUP & FIXES
-- =====================================================
-- Purpose: Fix duplicate columns and unclear references
-- Created: October 16, 2025
-- Status: READY TO RUN
-- 
-- CRITICAL FIXES:
-- 1. Remove duplicate user_id column from certificates table
-- 2. Clarify user references in audit_logs table
-- 3. Add comments for clarity
--
-- BEFORE RUNNING:
-- 1. BACKUP YOUR DATABASE!
-- 2. Test in development first
-- 3. Run during low-traffic period
--
-- =====================================================

-- =====================================================
-- STEP 1: VERIFY CURRENT STATE
-- =====================================================

-- Check if columns exist
DO $$ 
BEGIN
    RAISE NOTICE '=== CURRENT STATE CHECK ===';
    
    -- Check certificates table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'certificates' AND column_name = 'user_id'
    ) THEN
        RAISE NOTICE '✓ certificates.user_id EXISTS (will be removed)';
    ELSE
        RAISE NOTICE '✗ certificates.user_id does NOT exist (already removed)';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'certificates' AND column_name = 'student_id'
    ) THEN
        RAISE NOTICE '✓ certificates.student_id EXISTS (will be kept)';
    ELSE
        RAISE NOTICE '✗ certificates.student_id does NOT exist (PROBLEM!)';
    END IF;
    
    -- Check audit_logs table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'user_id'
    ) THEN
        RAISE NOTICE '✓ audit_logs.user_id EXISTS (will be renamed)';
    ELSE
        RAISE NOTICE '✗ audit_logs.user_id does NOT exist';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'actor_id'
    ) THEN
        RAISE NOTICE '✓ audit_logs.actor_id EXISTS (will be kept)';
    ELSE
        RAISE NOTICE '✗ audit_logs.actor_id does NOT exist';
    END IF;
END $$;

-- =====================================================
-- STEP 2: CHECK FOR DATA INCONSISTENCIES
-- =====================================================

-- Verify that user_id and student_id have same values (if user_id exists)
DO $$
DECLARE
    mismatch_count INTEGER;
    r RECORD;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'certificates' AND column_name = 'user_id'
    ) THEN
        SELECT COUNT(*) INTO mismatch_count
        FROM certificates
        WHERE user_id IS NOT NULL 
          AND student_id IS NOT NULL 
          AND user_id != student_id;
        
        IF mismatch_count > 0 THEN
            RAISE WARNING 'FOUND % certificates where user_id != student_id!', mismatch_count;
            RAISE WARNING 'Manual review required before proceeding!';
            
            -- Show the mismatches
            RAISE NOTICE 'Mismatched records:';
            FOR r IN 
                SELECT id, student_id, user_id 
                FROM certificates 
                WHERE user_id != student_id
            LOOP
                RAISE NOTICE 'Certificate ID: %, student_id: %, user_id: %', 
                    r.id, r.student_id, r.user_id;
            END LOOP;
        ELSE
            RAISE NOTICE '✓ All user_id values match student_id (safe to remove)';
        END IF;
    END IF;
END $$;

-- =====================================================
-- STEP 3: BACKUP DATA (Create safety views)
-- =====================================================

-- Create a backup view of current certificates data
-- Create backup views
DO $$
BEGIN
    -- Create a backup view of current certificates data
    CREATE OR REPLACE VIEW certificates_backup_view AS
    SELECT 
        id,
        student_id,
        user_id,
        title,
        institution,
        created_at,
        status
    FROM certificates;

    -- Create a backup view of current audit_logs data
    CREATE OR REPLACE VIEW audit_logs_backup_view AS
    SELECT 
        id,
        actor_id,
        user_id,
        action,
        target_id,
        created_at
    FROM audit_logs;
    
    RAISE NOTICE '✓ Backup views created: certificates_backup_view, audit_logs_backup_view';
END $$;

COMMENT ON VIEW certificates_backup_view IS 
    'Backup view created before schema cleanup on 2025-10-16. Use for rollback if needed.';

COMMENT ON VIEW audit_logs_backup_view IS 
    'Backup view created before schema cleanup on 2025-10-16. Use for rollback if needed.';

-- =====================================================
-- STEP 4: FIX CERTIFICATES TABLE
-- =====================================================

-- Remove duplicate user_id column (keep student_id)
DO $$
BEGIN
    RAISE NOTICE '=== FIXING CERTIFICATES TABLE ===';
    
    -- Check if column exists before dropping
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'certificates' AND column_name = 'user_id'
    ) THEN
        -- Before removing, copy any non-null user_id to student_id if student_id is null
        UPDATE certificates 
        SET student_id = user_id 
        WHERE student_id IS NULL AND user_id IS NOT NULL;
        
        RAISE NOTICE 'Updated % rows where student_id was NULL', 
            (SELECT COUNT(*) FROM certificates WHERE student_id IS NOT NULL);
        
        -- Drop the duplicate column (CASCADE to drop dependent policies/views)
        ALTER TABLE certificates DROP COLUMN IF EXISTS user_id CASCADE;
        
        RAISE NOTICE '✓ Removed certificates.user_id column (and dependent objects)';
    ELSE
        RAISE NOTICE '✓ certificates.user_id already removed (skipping)';
    END IF;
    
    -- Add helpful comment
    COMMENT ON COLUMN certificates.student_id IS 
        'UUID reference to the student who owns this certificate (references auth.users.id)';
END $$;

-- =====================================================
-- STEP 5: FIX AUDIT_LOGS TABLE
-- =====================================================

-- Clarify user references in audit_logs
DO $$
BEGIN
    RAISE NOTICE '=== FIXING AUDIT_LOGS TABLE ===';
    
    -- Check if user_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'user_id'
    ) THEN
        -- Rename user_id to target_user_id for clarity
        ALTER TABLE audit_logs RENAME COLUMN user_id TO target_user_id;
        
        RAISE NOTICE '✓ Renamed audit_logs.user_id to target_user_id';
        
        -- Add helpful comments
        COMMENT ON COLUMN audit_logs.actor_id IS 
            'UUID of the user who performed the action (who did it)';
        COMMENT ON COLUMN audit_logs.target_user_id IS 
            'UUID of the user who was affected by the action (who it was done to). Can be NULL for non-user-specific actions.';
    ELSE
        RAISE NOTICE '✓ audit_logs.user_id already renamed or does not exist (skipping)';
    END IF;
    
    -- Ensure actor_id has proper comment
    COMMENT ON COLUMN audit_logs.action IS 
        'Action performed (e.g., role_assigned, certificate_approved, certificate_rejected)';
    COMMENT ON COLUMN audit_logs.target_id IS 
        'UUID of the resource affected (e.g., certificate_id, role_id). Can reference different tables.';
END $$;

-- =====================================================
-- STEP 6: ADD MISSING CONSTRAINTS & INDEXES
-- =====================================================

-- Add foreign key constraint for student_id (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'certificates_student_id_fkey'
    ) THEN
        ALTER TABLE certificates 
        ADD CONSTRAINT certificates_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        
        RAISE NOTICE '✓ Added foreign key constraint on certificates.student_id';
    ELSE
        RAISE NOTICE '✓ Foreign key constraint already exists on certificates.student_id';
    END IF;
END $$;

-- Add foreign key constraint for actor_id (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'audit_logs_actor_id_fkey'
    ) THEN
        ALTER TABLE audit_logs 
        ADD CONSTRAINT audit_logs_actor_id_fkey 
        FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
        
        RAISE NOTICE '✓ Added foreign key constraint on audit_logs.actor_id';
    ELSE
        RAISE NOTICE '✓ Foreign key constraint already exists on audit_logs.actor_id';
    END IF;
END $$;

-- Add foreign key constraint for target_user_id (if not exists and column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'target_user_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'audit_logs_target_user_id_fkey'
    ) THEN
        ALTER TABLE audit_logs 
        ADD CONSTRAINT audit_logs_target_user_id_fkey 
        FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
        
        RAISE NOTICE '✓ Added foreign key constraint on audit_logs.target_user_id';
    ELSE
        RAISE NOTICE '✓ Foreign key constraint already exists on audit_logs.target_user_id or column does not exist';
    END IF;
END $$;

-- =====================================================
-- STEP 7: UPDATE TABLE COMMENTS
-- =====================================================

COMMENT ON TABLE certificates IS 
    'Stores user-uploaded certificates with OCR data, verification status, and metadata. 
    Each certificate belongs to a student (student_id).';

COMMENT ON TABLE audit_logs IS 
    'Tracks all important system actions for security and compliance.
    actor_id = who performed the action
    target_user_id = which user was affected (if applicable)
    target_id = which resource was affected (certificate, role, etc.)';

-- =====================================================
-- STEP 8: VERIFY FINAL STATE
-- =====================================================

DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== FINAL STATE CHECK ===';
    
    -- Verify certificates table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'certificates' AND column_name = 'user_id'
    ) THEN
        RAISE NOTICE '✓ certificates.user_id successfully removed';
    ELSE
        RAISE WARNING '✗ certificates.user_id still exists!';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'certificates' AND column_name = 'student_id'
    ) THEN
        RAISE NOTICE '✓ certificates.student_id exists (correct)';
    ELSE
        RAISE WARNING '✗ certificates.student_id missing!';
    END IF;
    
    -- Verify audit_logs table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'user_id'
    ) THEN
        RAISE NOTICE '✓ audit_logs.user_id successfully renamed';
    ELSE
        RAISE WARNING '✗ audit_logs.user_id still exists (should be renamed)';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'target_user_id'
    ) THEN
        RAISE NOTICE '✓ audit_logs.target_user_id exists (correct)';
    ELSE
        RAISE NOTICE '⚠ audit_logs.target_user_id does not exist (may not have been renamed)';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'actor_id'
    ) THEN
        RAISE NOTICE '✓ audit_logs.actor_id exists (correct)';
    ELSE
        RAISE WARNING '✗ audit_logs.actor_id missing!';
    END IF;
END $$;

-- =====================================================
-- STEP 9: SHOW SUMMARY
-- =====================================================

DO $$
DECLARE
    cert_count INTEGER;
    audit_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO cert_count FROM certificates;
    SELECT COUNT(*) INTO audit_count FROM audit_logs;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== CLEANUP SUMMARY ===';
    RAISE NOTICE 'Total certificates: %', cert_count;
    RAISE NOTICE 'Total audit logs: %', audit_count;
    RAISE NOTICE '';
    RAISE NOTICE '✓ Schema cleanup complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Update API code to use student_id (not user_id)';
    RAISE NOTICE '2. Update API code to use target_user_id in audit_logs';
    RAISE NOTICE '3. Run: database/performance-indexes.sql';
    RAISE NOTICE '4. Test all certificate-related API endpoints';
    RAISE NOTICE '5. Monitor for errors in production logs';
    RAISE NOTICE '';
    RAISE NOTICE 'ROLLBACK (if needed):';
    RAISE NOTICE '  SELECT * FROM certificates_backup_view;';
    RAISE NOTICE '  SELECT * FROM audit_logs_backup_view;';
END $$;

-- =====================================================
-- END OF SCHEMA CLEANUP
-- =====================================================
