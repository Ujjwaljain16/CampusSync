-- =====================================================
-- DATABASE SCHEMA VERIFICATION SCRIPT
-- =====================================================
-- Purpose: Verify that schema cleanup was successful
-- Run this AFTER schema-cleanup.sql and fix-rls-policies.sql
-- =====================================================

DO $$
DECLARE
    v_cert_has_user_id BOOLEAN;
    v_cert_has_student_id BOOLEAN;
    v_audit_has_user_id BOOLEAN;
    v_audit_has_target_user_id BOOLEAN;
    v_verification_policy_count INTEGER;
    v_metadata_policy_count INTEGER;
    v_index_student_verified BOOLEAN;
    v_index_student_status BOOLEAN;
    v_cert_count INTEGER;
    v_audit_count INTEGER;
BEGIN
    RAISE NOTICE '╔════════════════════════════════════════════════╗';
    RAISE NOTICE '║   DATABASE SCHEMA VERIFICATION                 ║';
    RAISE NOTICE '╚════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    
    -- =============================================
    -- STEP 1: Verify Column Changes
    -- =============================================
    RAISE NOTICE '1️⃣  COLUMN VERIFICATION';
    RAISE NOTICE '────────────────────────────────────────────────';
    
    -- Check certificates table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'certificates' AND column_name = 'user_id'
    ) INTO v_cert_has_user_id;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'certificates' AND column_name = 'student_id'
    ) INTO v_cert_has_student_id;
    
    IF v_cert_has_user_id THEN
        RAISE WARNING '❌ certificates.user_id STILL EXISTS (should be dropped)';
    ELSE
        RAISE NOTICE '✅ certificates.user_id successfully removed';
    END IF;
    
    IF v_cert_has_student_id THEN
        RAISE NOTICE '✅ certificates.student_id exists (correct)';
    ELSE
        RAISE WARNING '❌ certificates.student_id MISSING (critical error!)';
    END IF;
    
    -- Check audit_logs table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'user_id'
    ) INTO v_audit_has_user_id;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'target_user_id'
    ) INTO v_audit_has_target_user_id;
    
    IF v_audit_has_user_id THEN
        RAISE WARNING '❌ audit_logs.user_id STILL EXISTS (should be renamed)';
    ELSE
        RAISE NOTICE '✅ audit_logs.user_id successfully renamed';
    END IF;
    
    IF v_audit_has_target_user_id THEN
        RAISE NOTICE '✅ audit_logs.target_user_id exists (correct)';
    ELSE
        RAISE WARNING '⚠️  audit_logs.target_user_id MISSING';
    END IF;
    
    RAISE NOTICE '';
    
    -- =============================================
    -- STEP 2: Verify Foreign Key Constraints
    -- =============================================
    RAISE NOTICE '2️⃣  FOREIGN KEY CONSTRAINTS';
    RAISE NOTICE '────────────────────────────────────────────────';
    
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'certificates_student_id_fkey'
    ) THEN
        RAISE NOTICE '✅ certificates.student_id has foreign key constraint';
    ELSE
        RAISE WARNING '❌ certificates.student_id MISSING foreign key';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'audit_logs_actor_id_fkey'
    ) THEN
        RAISE NOTICE '✅ audit_logs.actor_id has foreign key constraint';
    ELSE
        RAISE WARNING '❌ audit_logs.actor_id MISSING foreign key';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'audit_logs_target_user_id_fkey'
    ) THEN
        RAISE NOTICE '✅ audit_logs.target_user_id has foreign key constraint';
    ELSE
        RAISE WARNING '⚠️  audit_logs.target_user_id MISSING foreign key';
    END IF;
    
    RAISE NOTICE '';
    
    -- =============================================
    -- STEP 3: Verify RLS Policies
    -- =============================================
    RAISE NOTICE '3️⃣  RLS POLICY VERIFICATION';
    RAISE NOTICE '────────────────────────────────────────────────';
    
    -- Count policies on verification_results
    SELECT COUNT(*) INTO v_verification_policy_count
    FROM pg_policies
    WHERE tablename = 'verification_results';
    
    IF v_verification_policy_count >= 3 THEN
        RAISE NOTICE '✅ verification_results has % policies (expected ≥3)', v_verification_policy_count;
    ELSE
        RAISE WARNING '❌ verification_results has only % policies (expected ≥3)', v_verification_policy_count;
    END IF;
    
    -- Count policies on certificate_metadata
    SELECT COUNT(*) INTO v_metadata_policy_count
    FROM pg_policies
    WHERE tablename = 'certificate_metadata';
    
    IF v_metadata_policy_count >= 4 THEN
        RAISE NOTICE '✅ certificate_metadata has % policies (expected ≥4)', v_metadata_policy_count;
    ELSE
        RAISE WARNING '❌ certificate_metadata has only % policies (expected ≥4)', v_metadata_policy_count;
    END IF;
    
    RAISE NOTICE '';
    
    -- =============================================
    -- STEP 4: Verify Indexes
    -- =============================================
    RAISE NOTICE '4️⃣  INDEX VERIFICATION';
    RAISE NOTICE '────────────────────────────────────────────────';
    
    -- Check new indexes
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_certificates_student_verified'
    ) INTO v_index_student_verified;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_certificates_student_status'
    ) INTO v_index_student_status;
    
    IF v_index_student_verified THEN
        RAISE NOTICE '✅ Index idx_certificates_student_verified exists';
    ELSE
        RAISE WARNING '❌ Index idx_certificates_student_verified MISSING';
    END IF;
    
    IF v_index_student_status THEN
        RAISE NOTICE '✅ Index idx_certificates_student_status exists';
    ELSE
        RAISE WARNING '❌ Index idx_certificates_student_status MISSING';
    END IF;
    
    -- Check old index is gone
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_certificates_user_verified'
    ) THEN
        RAISE NOTICE '✅ Old index idx_certificates_user_verified removed';
    ELSE
        RAISE WARNING '⚠️  Old index idx_certificates_user_verified still exists';
    END IF;
    
    RAISE NOTICE '';
    
    -- =============================================
    -- STEP 5: Data Integrity Check
    -- =============================================
    RAISE NOTICE '5️⃣  DATA INTEGRITY CHECK';
    RAISE NOTICE '────────────────────────────────────────────────';
    
    -- Count certificates
    SELECT COUNT(*) INTO v_cert_count FROM certificates;
    RAISE NOTICE 'ℹ️  Total certificates: %', v_cert_count;
    
    -- Check for NULL student_ids
    IF EXISTS (SELECT 1 FROM certificates WHERE student_id IS NULL) THEN
        RAISE WARNING '❌ Found certificates with NULL student_id!';
    ELSE
        RAISE NOTICE '✅ All certificates have valid student_id';
    END IF;
    
    -- Count audit logs
    SELECT COUNT(*) INTO v_audit_count FROM audit_logs;
    RAISE NOTICE 'ℹ️  Total audit logs: %', v_audit_count;
    
    RAISE NOTICE '';
    
    -- =============================================
    -- STEP 6: Final Summary
    -- =============================================
    RAISE NOTICE '╔════════════════════════════════════════════════╗';
    RAISE NOTICE '║   VERIFICATION SUMMARY                         ║';
    RAISE NOTICE '╚════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    
    IF NOT v_cert_has_user_id AND v_cert_has_student_id AND 
       NOT v_audit_has_user_id AND v_audit_has_target_user_id AND
       v_verification_policy_count >= 3 AND v_metadata_policy_count >= 4 AND
       v_index_student_verified AND v_index_student_status THEN
        RAISE NOTICE '✅ ✅ ✅ ALL CHECKS PASSED! ✅ ✅ ✅';
        RAISE NOTICE '';
        RAISE NOTICE 'Schema cleanup successful!';
        RAISE NOTICE 'Your database is now ready for testing.';
    ELSE
        RAISE WARNING '⚠️  SOME CHECKS FAILED!';
        RAISE WARNING 'Review the warnings above and fix issues.';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Test certificate upload (student)';
    RAISE NOTICE '2. Test certificate approval (faculty)';
    RAISE NOTICE '3. Test student search (recruiter)';
    RAISE NOTICE '4. Monitor Supabase logs for errors';
    RAISE NOTICE '';
    
END $$;

-- =====================================================
-- Additional Diagnostic Queries
-- =====================================================

-- Show all policies on verification_results
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    cmd
FROM pg_policies
WHERE tablename IN ('verification_results', 'certificate_metadata')
ORDER BY tablename, policyname;

-- Show all indexes on certificates
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'certificates'
ORDER BY indexname;

-- Show foreign key constraints
SELECT
    con.conname AS constraint_name,
    rel.relname AS table_name,
    att.attname AS column_name,
    ref.relname AS referenced_table
FROM pg_constraint con
JOIN pg_class rel ON con.conrelid = rel.oid
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
JOIN pg_class ref ON con.confrelid = ref.oid
WHERE con.contype = 'f'
AND rel.relname IN ('certificates', 'audit_logs')
ORDER BY rel.relname, con.conname;
