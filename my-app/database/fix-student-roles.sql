-- ============================================================
-- FIX: Assign Student Role to Certificate Owners
-- ============================================================
-- This fixes the issue where total_students shows 0
-- even though verified certificates exist.
-- 
-- PROBLEM: Users with certificates don't have role='student' 
-- in user_roles table, so analytics can't count them.
--
-- SOLUTION: Automatically assign 'student' role to anyone 
-- who has uploaded certificates.
-- ============================================================

-- Step 1: Find all users who have certificates but no student role
-- (This is just for checking)
SELECT DISTINCT 
  c.student_id,
  p.full_name,
  p.email,
  COUNT(c.id) as cert_count
FROM certificates c
JOIN profiles p ON p.id = c.student_id
LEFT JOIN user_roles ur ON ur.user_id = c.student_id AND ur.role = 'student'
WHERE ur.id IS NULL -- No student role assigned
GROUP BY c.student_id, p.full_name, p.email;

-- Step 2: Assign 'student' role to all certificate owners
-- Run this to fix the issue!
INSERT INTO user_roles (user_id, role)
SELECT DISTINCT student_id, 'student'
FROM certificates
WHERE student_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 3: Verify the fix
-- After running Step 2, this should return the count > 0
SELECT COUNT(*) as total_students
FROM user_roles
WHERE role = 'student';

-- Step 4: Double-check - Students with verified certificates
SELECT 
  ur.user_id,
  p.full_name,
  p.email,
  COUNT(c.id) FILTER (WHERE c.verification_status = 'verified') as verified_certs,
  COUNT(c.id) as total_certs
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
LEFT JOIN certificates c ON c.student_id = ur.user_id
WHERE ur.role = 'student'
GROUP BY ur.user_id, p.full_name, p.email
ORDER BY verified_certs DESC;

-- ============================================================
-- EXPECTED RESULT:
-- After running Step 2, your analytics should show:
-- {
--   "total_students": 1 (or more),  ← FIXED!
--   "verified_certifications": 1,
--   ...
-- }
-- ============================================================

-- Alternative: Assign role to specific user (if you know their ID)
-- INSERT INTO user_roles (user_id, role)
-- VALUES ('21aa61ab-e3ca-4b40-85e7-9a79daed5cae', 'student')
-- ON CONFLICT (user_id, role) DO NOTHING;
