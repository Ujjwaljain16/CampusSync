# 🔧 VC ISSUANCE FIX - URGENT

## ❌ Problem
```
null value in column "user_id" of relation "verifiable_credentials" violates not-null constraint
```

The `verifiable_credentials` table still uses `user_id` column, but our code now uses `student_id`.

## ✅ Solution (2 minutes)

### Step 1: Run SQL Migration
Go to Supabase SQL Editor and run:
```sql
database/fix-verifiable-credentials-schema.sql
```

This will:
- ✓ Add `student_id` column
- ✓ Copy existing data from `user_id` to `student_id`
- ✓ Drop old `user_id` column
- ✓ Add foreign key constraint
- ✓ Create performance indexes

### Step 2: Test VC Issuance
```bash
# The code has already been fixed
# Test by approving a certificate and issuing a VC
```

## 📝 What Was Fixed

### Code Changes (✅ Already Done)
**File:** `src/app/api/certificates/issue/route.ts`

**Before:**
```typescript
const { error } = await supabase.from('verifiable_credentials').insert({
    id: vc.id,
    user_id: subject.id, // ❌ OLD
    issuer: vc.issuer,
    // ...
});
```

**After:**
```typescript
const { error } = await supabase.from('verifiable_credentials').insert({
    id: vc.id,
    student_id: subject.id, // ✅ NEW
    issuer: vc.issuer,
    // ...
});
```

### Database Changes (⏳ Needs to be run)
Run: `database/fix-verifiable-credentials-schema.sql`

## 🚀 Quick Test

After running the SQL migration:

1. **Approve a certificate** (as faculty)
2. **Issue VC** - Should work without errors
3. **Check logs** - No "user_id" constraint violations

## 📊 Expected Results

**Before Fix:**
```
POST /api/certificates/issue 500 in 1356ms
Error: null value in column "user_id" violates not-null constraint
```

**After Fix:**
```
POST /api/certificates/issue 201 in 245ms
✅ Verifiable credential issued successfully
```

## 🔍 Verification Query

After running migration, verify with:

```sql
-- Check schema
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'verifiable_credentials'
ORDER BY ordinal_position;

-- Should show:
-- student_id | uuid | NO
-- (no user_id column)

-- Check constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'verifiable_credentials'::regclass;

-- Should show:
-- verifiable_credentials_student_id_fkey | f
```

## 🐛 Troubleshooting

### Issue: Still getting "null value in column student_id"

**Run this diagnostic query:**
```sql
-- Check if certificates have student_id populated
SELECT id, student_id, title, status 
FROM certificates 
ORDER BY created_at DESC 
LIMIT 5;
```

**If student_id is NULL in certificates:**
This means the certificate was created before the schema cleanup. The API code has been updated with debug logging to catch this.

**Solution:**
1. Check the terminal logs for: `[VC Issue] Subject:` and `[VC Issue] Subject.id:`
2. The logs will show if subject.id is undefined
3. If so, the certificate's student_id needs to be populated

**Quick fix for NULL student_id in certificates:**
```sql
-- Find certificates with NULL student_id
SELECT id, title, faculty_id FROM certificates WHERE student_id IS NULL;

-- You'll need to manually set student_id based on who owns it
-- This should not happen if you ran schema-cleanup.sql correctly
```

## ⚠️ Important Notes

1. **This is a critical fix** - VC issuance is broken until this is applied
2. **No data loss** - Existing VCs will be preserved
3. **Quick migration** - Takes ~5 seconds to run
4. **Safe operation** - Data is copied before dropping old column

## 📚 Related Files

- **Code:** `src/app/api/certificates/issue/route.ts` (✅ fixed)
- **Migration:** `database/fix-verifiable-credentials-schema.sql` (⏳ run this)
- **Related:** Previous schema cleanup (`database/schema-cleanup.sql`)

---

**Next:** Run the SQL migration and test VC issuance! 🚀
