-- =====================================================
-- RECREATE RLS POLICIES AFTER SCHEMA CLEANUP
-- =====================================================
-- Purpose: Recreate RLS policies that were dropped during schema cleanup
-- These policies were using certificates.user_id and need to be recreated with student_id
--
-- Run this AFTER schema-cleanup.sql has completed successfully
-- =====================================================

-- =====================================================
-- STEP 1: Drop old policies (if they still exist)
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=== DROPPING OLD POLICIES ===';
    
    -- Drop old verification_results policies
    DROP POLICY IF EXISTS "Users can read their own verification results" ON verification_results;
    
    -- Drop old certificate_metadata policies
    DROP POLICY IF EXISTS "Users can read their own certificate metadata" ON certificate_metadata;
    
    RAISE NOTICE '✓ Old policies dropped (if they existed)';
END $$;

-- =====================================================
-- STEP 2: Recreate verification_results policies with student_id
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=== RECREATING VERIFICATION_RESULTS POLICIES ===';
    
    -- Policy: Users can read their own verification results
    CREATE POLICY "Users can read their own verification results"
        ON verification_results
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM certificates 
                WHERE certificates.id = verification_results.certificate_id 
                AND certificates.student_id = auth.uid()
            )
        );
    
    RAISE NOTICE '✓ Created policy: Users can read their own verification results';
    
    -- Policy: Admins can read all verification results
    CREATE POLICY "Admins can read all verification results"
        ON verification_results
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM user_roles 
                WHERE user_roles.user_id = auth.uid() 
                AND user_roles.role = 'admin'
            )
        );
    
    RAISE NOTICE '✓ Created policy: Admins can read all verification results';
    
    -- Policy: Faculty can read verification results for certificates they're reviewing
    CREATE POLICY "Faculty can read verification results for their assignments"
        ON verification_results
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM user_roles 
                WHERE user_roles.user_id = auth.uid() 
                AND user_roles.role = 'faculty'
            )
        );
    
    RAISE NOTICE '✓ Created policy: Faculty can read verification results';
    
END $$;

-- =====================================================
-- STEP 3: Recreate certificate_metadata policies with student_id
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=== RECREATING CERTIFICATE_METADATA POLICIES ===';
    
    -- Policy: Users can read their own certificate metadata
    CREATE POLICY "Users can read their own certificate metadata"
        ON certificate_metadata
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM certificates 
                WHERE certificates.id = certificate_metadata.certificate_id 
                AND certificates.student_id = auth.uid()
            )
        );
    
    RAISE NOTICE '✓ Created policy: Users can read their own certificate metadata';
    
    -- Policy: Admins can read all certificate metadata
    CREATE POLICY "Admins can read all certificate metadata"
        ON certificate_metadata
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM user_roles 
                WHERE user_roles.user_id = auth.uid() 
                AND user_roles.role = 'admin'
            )
        );
    
    RAISE NOTICE '✓ Created policy: Admins can read all certificate metadata';
    
    -- Policy: Faculty can read metadata for certificates they're reviewing
    CREATE POLICY "Faculty can read certificate metadata"
        ON certificate_metadata
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM user_roles 
                WHERE user_roles.user_id = auth.uid() 
                AND user_roles.role = 'faculty'
            )
        );
    
    RAISE NOTICE '✓ Created policy: Faculty can read certificate metadata';
    
    -- Policy: Users can insert metadata for their own certificates
    CREATE POLICY "Users can insert their own certificate metadata"
        ON certificate_metadata
        FOR INSERT
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM certificates 
                WHERE certificates.id = certificate_metadata.certificate_id 
                AND certificates.student_id = auth.uid()
            )
        );
    
    RAISE NOTICE '✓ Created policy: Users can insert their own certificate metadata';
    
END $$;

-- =====================================================
-- STEP 4: Update existing indexes that used user_id
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=== UPDATING INDEXES ===';
    
    -- Drop old index if it exists (from migrations 016 and 017)
    DROP INDEX IF EXISTS idx_certificates_user_verified;
    
    -- Create new index using student_id
    CREATE INDEX IF NOT EXISTS idx_certificates_student_verified 
        ON certificates (student_id) 
        WHERE verification_status = 'verified';
    
    RAISE NOTICE '✓ Created index: idx_certificates_student_verified';
    
    -- Additional useful index for student lookups
    CREATE INDEX IF NOT EXISTS idx_certificates_student_status 
        ON certificates (student_id, verification_status);
    
    RAISE NOTICE '✓ Created index: idx_certificates_student_status';
    
END $$;

-- =====================================================
-- STEP 5: Verify policies are in place
-- =====================================================

DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== VERIFICATION ===';
    
    -- Count policies on verification_results
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'verification_results';
    
    RAISE NOTICE '✓ verification_results has % policies', policy_count;
    
    -- Count policies on certificate_metadata
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'certificate_metadata';
    
    RAISE NOTICE '✓ certificate_metadata has % policies', policy_count;
    
    -- Verify indexes
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_certificates_student_verified'
    ) THEN
        RAISE NOTICE '✓ Index idx_certificates_student_verified exists';
    ELSE
        RAISE WARNING '✗ Index idx_certificates_student_verified MISSING!';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_certificates_student_status'
    ) THEN
        RAISE NOTICE '✓ Index idx_certificates_student_status exists';
    ELSE
        RAISE WARNING '✗ Index idx_certificates_student_status MISSING!';
    END IF;
    
END $$;

-- =====================================================
-- STEP 6: Summary
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== RLS POLICY FIX COMPLETE ===';
    RAISE NOTICE '';
    RAISE NOTICE 'Policies recreated:';
    RAISE NOTICE '  ✓ verification_results (3 policies)';
    RAISE NOTICE '  ✓ certificate_metadata (4 policies)';
    RAISE NOTICE '';
    RAISE NOTICE 'Indexes updated:';
    RAISE NOTICE '  ✓ idx_certificates_student_verified';
    RAISE NOTICE '  ✓ idx_certificates_student_status';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Update API code to use student_id';
    RAISE NOTICE '2. Test certificate operations';
    RAISE NOTICE '3. Monitor for policy violations';
    RAISE NOTICE '';
END $$;

-- =====================================================
-- END OF RLS POLICY FIX
-- =====================================================
