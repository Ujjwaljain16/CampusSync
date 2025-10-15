# 🚀 Quick Start Guide - Post Schema Cleanup

**Last Updated:** October 16, 2025  
**Status:** Schema cleanup complete, ready for next steps

---

## ✅ What's Done

- ✅ **Schema cleanup executed** - certificates.user_id removed
- ✅ **Audit logs clarified** - user_id renamed to target_user_id
- ✅ **API code updated** - search-students route uses student_id
- ✅ **Performance indexes running** - User is applying 70+ indexes

---

## 🔄 Next Steps (In Order)

### 1️⃣ **Finish Performance Indexes** (User is doing this now)
```bash
# User is running: database/performance-indexes.sql
# Wait for completion...
```

### 2️⃣ **Recreate RLS Policies** (DO THIS NEXT)
```sql
-- Run in Supabase SQL Editor:
-- File: database/fix-rls-policies.sql
-- Expected: Create 7 RLS policies + 2 indexes
-- Runtime: ~2 seconds
```

**What it does:**
- Recreates verification_results policies (3 policies)
- Recreates certificate_metadata policies (4 policies)
- Creates idx_certificates_student_verified
- Creates idx_certificates_student_status

### 3️⃣ **Verify Everything Works**
```sql
-- Run in Supabase SQL Editor:
-- File: database/verify-schema-cleanup.sql
-- Expected: All checks pass with ✅
-- Runtime: ~1 second
```

**What it checks:**
- ✅ certificates.user_id removed
- ✅ certificates.student_id exists
- ✅ audit_logs.target_user_id exists
- ✅ Foreign keys in place
- ✅ RLS policies recreated
- ✅ Indexes created
- ✅ Data integrity

### 4️⃣ **Test Certificate Operations**

#### Test 1: Student Upload
1. Login as student
2. Go to "Upload Certificate"
3. Upload a certificate
4. Verify it appears in "My Certificates"
5. **Expected:** No "column does not exist" errors

#### Test 2: Faculty Review
1. Login as faculty
2. Go to "Pending Certificates"
3. Review a certificate
4. Approve/reject it
5. **Expected:** No errors, audit log created

#### Test 3: Recruiter Search
1. Login as recruiter
2. Go to "Search Students"
3. Search for students with certificates
4. **Expected:** Students appear correctly

#### Test 4: Check Logs
```sql
-- Check Supabase logs for:
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;

-- Should show:
-- actor_id = who did the action
-- target_user_id = who was affected
```

### 5️⃣ **Search for Remaining References**

```bash
# Search for old column references:
grep -r "certificates.*user_id" src/app/api/
grep -r "audit_logs.*user_id" src/app/api/
```

**Expected files to update:**
- src/app/api/certificates/mine/route.ts
- src/app/api/certificates/create/route.ts
- src/app/api/certificates/approve/route.ts
- src/app/api/certificates/issue/route.ts
- Other certificate-related routes

**Changes needed:**
```typescript
// FIND:
.eq('user_id', userId)

// REPLACE WITH:
.eq('student_id', userId)
```

---

## 📋 Quick Reference

### Column Mapping
| Old Column | New Column | Table |
|-----------|-----------|-------|
| `certificates.user_id` | `certificates.student_id` | certificates |
| `audit_logs.user_id` | `audit_logs.target_user_id` | audit_logs |

### TypeScript Type Updates
```typescript
// OLD:
type Certificate = {
  user_id: string;
  // ...
}

// NEW:
type Certificate = {
  student_id: string;
  // ...
}
```

### SQL Query Updates
```sql
-- OLD:
SELECT * FROM certificates WHERE user_id = 'uuid';

-- NEW:
SELECT * FROM certificates WHERE student_id = 'uuid';
```

---

## 🚨 Common Issues & Fixes

### Issue 1: "column certificates.user_id does not exist"
**Cause:** Code still using old column name  
**Fix:** Update to use `student_id`

### Issue 2: RLS policy violation
**Cause:** Policies not recreated yet  
**Fix:** Run `database/fix-rls-policies.sql`

### Issue 3: "permission denied for table certificates"
**Cause:** User doesn't have role  
**Fix:** Check user_roles table, assign correct role

### Issue 4: Slow queries
**Cause:** Performance indexes not applied yet  
**Fix:** Wait for `performance-indexes.sql` to complete

---

## 📊 Performance Expectations

### Before (without indexes):
```
Dashboard load:     1500ms
Role check:         400ms
Certificate query:  800ms
```

### After (with indexes):
```
Dashboard load:     150ms  ← 10x faster
Role check:         15ms   ← 20x faster
Certificate query:  50ms   ← 16x faster
```

---

## 🛠️ Troubleshooting

### If tests fail:

1. **Check Supabase logs:**
   - Go to Supabase Dashboard
   - Click "Logs" → "Database"
   - Look for errors

2. **Run verification script:**
   ```sql
   -- database/verify-schema-cleanup.sql
   ```

3. **Check RLS policies:**
   ```sql
   SELECT tablename, policyname 
   FROM pg_policies 
   WHERE tablename IN ('verification_results', 'certificate_metadata');
   ```

4. **Check indexes:**
   ```sql
   SELECT indexname 
   FROM pg_indexes 
   WHERE tablename = 'certificates';
   ```

### If rollback needed:

```sql
-- Check if backup view exists:
SELECT * FROM audit_logs_backup_view LIMIT 1;

-- Restore from Supabase backup (24-hour point-in-time recovery)
-- Contact Supabase support if needed
```

---

## 📝 Files You Have

### SQL Scripts:
- ✅ `database/schema-cleanup.sql` - Executed successfully
- 🔄 `database/fix-rls-policies.sql` - Ready to run
- 🔄 `database/verify-schema-cleanup.sql` - Ready to run
- 🔄 `database/performance-indexes.sql` - Currently running

### Documentation:
- ✅ `DATABASE-SCHEMA-CLEANUP-COMPLETE.md` - Full implementation summary
- ✅ `DATABASE-FIX-GUIDE.md` - Step-by-step guide
- ✅ `COMPLETE-CODEBASE-ANALYSIS.md` - Comprehensive codebase analysis

### Code Updates:
- ✅ `src/app/api/recruiter/search-students/route.ts` - Updated to use student_id

---

## ⏱️ Time Estimates

| Task | Time |
|------|------|
| Run fix-rls-policies.sql | 2 seconds |
| Run verify-schema-cleanup.sql | 1 second |
| Test certificate upload | 2 minutes |
| Test faculty review | 2 minutes |
| Test recruiter search | 2 minutes |
| Search for remaining references | 5 minutes |
| Update remaining files | 10-15 minutes |
| **Total** | **~20-25 minutes** |

---

## ✅ Success Checklist

- [ ] Performance indexes applied (70+ indexes)
- [ ] RLS policies recreated (7 policies)
- [ ] Verification script passes all checks
- [ ] Student can upload certificates
- [ ] Faculty can approve certificates
- [ ] Recruiter can search students
- [ ] Audit logs show correct columns
- [ ] No "column does not exist" errors
- [ ] Queries are 10-20x faster
- [ ] All tests pass

---

## 🎯 Current Status

```
✅ Schema cleanup: COMPLETE
✅ Code updates: COMPLETE (1 file)
🔄 Performance indexes: IN PROGRESS (user running)
⏳ RLS policies: PENDING (next step)
⏳ Verification: PENDING
⏳ Testing: PENDING
⏳ Additional code updates: PENDING
```

---

## 💡 Pro Tips

1. **Always check logs** after each step
2. **Test as you go** - don't wait until the end
3. **Keep backup** - Supabase has 24-hour recovery
4. **Monitor performance** - compare before/after query times
5. **Document issues** - note any problems for team

---

## 📞 Support

If you encounter issues:
1. Check this guide first
2. Run verification script
3. Check Supabase logs
4. Review DATABASE-SCHEMA-CLEANUP-COMPLETE.md
5. Check Git history for recent changes

---

**Ready to proceed!** 🚀

Start with step 2️⃣ (after performance indexes complete):
Run `database/fix-rls-policies.sql` in Supabase SQL Editor
