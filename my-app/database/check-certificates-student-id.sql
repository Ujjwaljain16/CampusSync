-- Check if certificates have student_id populated
SELECT 
    id,
    student_id,
    title,
    status,
    created_at
FROM certificates
ORDER BY created_at DESC
LIMIT 10;

-- Check for any certificates with NULL student_id
SELECT COUNT(*) as null_student_id_count
FROM certificates
WHERE student_id IS NULL;

-- If there are any NULL student_ids, they need to be fixed
-- Check if we can get the user from another field
SELECT 
    id,
    student_id,
    title,
    faculty_id,
    created_at
FROM certificates
WHERE student_id IS NULL;
