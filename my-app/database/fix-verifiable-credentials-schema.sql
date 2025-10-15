-- =====================================================
-- FIX VERIFIABLE_CREDENTIALS TABLE SCHEMA
-- =====================================================
-- Purpose: Update verifiable_credentials table to use student_id instead of user_id
-- This matches the schema changes made to certificates table
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=== FIXING VERIFIABLE_CREDENTIALS TABLE ===';
    
    -- Step 1: Check if user_id column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'verifiable_credentials' AND column_name = 'user_id'
    ) THEN
        RAISE NOTICE 'Found user_id column, proceeding with migration...';
        
        -- Step 2: Add student_id column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'verifiable_credentials' AND column_name = 'student_id'
        ) THEN
            ALTER TABLE verifiable_credentials 
            ADD COLUMN student_id UUID;
            
            RAISE NOTICE '✓ Added student_id column';
        ELSE
            RAISE NOTICE '✓ student_id column already exists';
        END IF;
        
        -- Step 3: Copy data from user_id to student_id
        UPDATE verifiable_credentials 
        SET student_id = user_id 
        WHERE student_id IS NULL AND user_id IS NOT NULL;
        
        RAISE NOTICE '✓ Copied data from user_id to student_id';
        
        -- Step 4: Make student_id NOT NULL
        ALTER TABLE verifiable_credentials 
        ALTER COLUMN student_id SET NOT NULL;
        
        RAISE NOTICE '✓ Set student_id as NOT NULL';
        
        -- Step 5: Add foreign key constraint to student_id
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'verifiable_credentials_student_id_fkey'
        ) THEN
            ALTER TABLE verifiable_credentials 
            ADD CONSTRAINT verifiable_credentials_student_id_fkey 
            FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
            
            RAISE NOTICE '✓ Added foreign key constraint on student_id';
        ELSE
            RAISE NOTICE '✓ Foreign key constraint already exists';
        END IF;
        
        -- Step 6: Drop the old user_id column
        ALTER TABLE verifiable_credentials 
        DROP COLUMN user_id CASCADE;
        
        RAISE NOTICE '✓ Dropped user_id column';
        
        -- Step 7: Add helpful comment
        COMMENT ON COLUMN verifiable_credentials.student_id IS 
            'UUID reference to the student who owns this credential (references auth.users.id)';
        
        RAISE NOTICE '✓ Added column comment';
        
    ELSE
        RAISE NOTICE '✓ user_id column does not exist, table already migrated';
    END IF;
    
    -- Step 8: Verify final state
    RAISE NOTICE '';
    RAISE NOTICE '=== VERIFICATION ===';
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'verifiable_credentials' AND column_name = 'student_id'
    ) THEN
        RAISE NOTICE '✅ student_id column exists';
    ELSE
        RAISE WARNING '❌ student_id column MISSING!';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'verifiable_credentials' AND column_name = 'user_id'
    ) THEN
        RAISE NOTICE '✅ user_id column removed';
    ELSE
        RAISE WARNING '❌ user_id column still exists!';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'verifiable_credentials_student_id_fkey'
    ) THEN
        RAISE NOTICE '✅ Foreign key constraint exists';
    ELSE
        RAISE WARNING '❌ Foreign key constraint MISSING!';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== MIGRATION COMPLETE ===';
    RAISE NOTICE 'verifiable_credentials table now uses student_id';
    
END $$;

-- =====================================================
-- CREATE INDEX FOR PERFORMANCE
-- =====================================================

DO $$
BEGIN
    -- Index for querying VCs by student
    CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_student_id 
    ON verifiable_credentials(student_id);

    -- Index for querying VCs by status
    CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_status 
    ON verifiable_credentials(status);

    -- Composite index for common queries
    CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_student_status 
    ON verifiable_credentials(student_id, status);

    RAISE NOTICE '✓ Created performance indexes';
END $$;

-- =====================================================
-- UPDATE RLS POLICIES (if any exist)
-- =====================================================

DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    -- Count existing policies on verifiable_credentials
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'verifiable_credentials';
    
    IF policy_count > 0 THEN
        RAISE NOTICE 'Found % existing policies on verifiable_credentials', policy_count;
        RAISE NOTICE 'You may need to manually update RLS policies to use student_id';
    ELSE
        RAISE NOTICE 'No RLS policies found on verifiable_credentials';
    END IF;
END $$;

-- =====================================================
-- FINAL SUMMARY
-- =====================================================

DO $$
DECLARE
    vc_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO vc_count FROM verifiable_credentials;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== SUMMARY ===';
    RAISE NOTICE 'Total verifiable credentials: %', vc_count;
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Code already updated to use student_id';
    RAISE NOTICE '2. Test VC issuance: POST /api/certificates/issue';
    RAISE NOTICE '3. Verify no database errors in logs';
    RAISE NOTICE '4. Test VC verification';
    RAISE NOTICE '';
END $$;
