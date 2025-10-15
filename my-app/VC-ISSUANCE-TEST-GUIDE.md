# Quick Test Guide - VC Issuance Fix

## 🚀 Quick Test (2 minutes)

### 1. Start Dev Server
```powershell
npm run dev
```

### 2. Test VC Issuance
1. Open browser: http://localhost:3000
2. Login as **faculty** user
3. Go to **Faculty Dashboard**
4. Find a pending certificate
5. Click **"Approve & Issue VC"** button

### 3. Check Terminal Output
Look for these logs:
```
✅ GOOD:
[VC Issue] Subject.id: 21aa61ab-e3ca-4b40-85e7-9a79daed5cae
POST /api/certificates/issue 201 in 450ms

❌ BAD (if you still see this, something's wrong):
[VC Issue] Subject.id: undefined
ERROR: null value in column "student_id" violates not-null constraint
```

### 4. Verify in UI
- Certificate should move from "Pending" to "Approved" section
- No error toast should appear
- Success message should show

## 🔍 Detailed Verification

### Check Database
```sql
-- See the newly issued VC
SELECT id, student_id, status, created_at
FROM verifiable_credentials
ORDER BY created_at DESC
LIMIT 1;
```

**Expected**: `student_id` should be a valid UUID (like `21aa61ab-e3ca-4b40-85e7-9a79daed5cae`), NOT NULL

### Check for Errors
```powershell
# In PowerShell, check for any TypeScript errors
npm run build
```

**Expected**: No errors, only possible warnings about unused variables

## 🎯 What Was Fixed

### The Bug
```typescript
// ❌ BEFORE (Broken)
const subject = {
  id: cert.user_id,  // undefined! field doesn't exist
  certificateId: cert.id,
};
// Result: subject.id = undefined → NULL in database → ERROR!
```

### The Fix
```typescript
// ✅ AFTER (Working)
const subject = {
  id: cert.student_id,  // Valid UUID from database
  certificateId: cert.id,
};
// Result: subject.id = valid UUID → Successful insert!
```

## 🐛 If It Still Doesn't Work

### 1. Clear TypeScript Cache
```powershell
Remove-Item -Recurse -Force .next
npm run dev
```

### 2. Check TypeScript Interface
Open `src/app/faculty/dashboard/page.tsx` and verify line 14:
```typescript
interface PendingCert {
  student_id: string; // ✅ Should be student_id
  // NOT user_id!
}
```

### 3. Check Subject Creation
Open `src/app/faculty/dashboard/page.tsx` and verify line 170:
```typescript
const subject = {
  id: cert.student_id, // ✅ Should be cert.student_id
  // NOT cert.user_id!
};
```

### 4. Hard Refresh Browser
- Press `Ctrl + Shift + R` (Windows)
- Or `Ctrl + F5`
- This clears browser cache

## ✅ Success Criteria

You'll know it's working when:
1. ✅ No error messages in terminal
2. ✅ Terminal shows `Subject.id: <valid-uuid>` (not undefined)
3. ✅ Certificate status changes to "approved" in UI
4. ✅ No browser console errors
5. ✅ Database has new row in `verifiable_credentials` table with valid `student_id`

## 📦 What Changed

### Files Updated (4 files)
1. ✅ `src/app/faculty/dashboard/page.tsx` - Frontend (3 changes)
2. ✅ `src/app/api/certificates/issue/route.ts` - Backend API
3. ✅ `src/app/api/certificates/auto-verify/route.ts` - Auto-verify
4. ✅ `src/app/api/vc/revoke/route.ts` - Revoke API

### What Each Does
- **Faculty Dashboard**: Creates the VC request with correct student_id
- **Issue API**: Inserts VC into database with correct student_id
- **Auto-Verify**: Sends emails using correct student_id
- **Revoke API**: Logs revocations with correct student_id

## 🔄 After Testing

### If Working → Commit
```powershell
git add .
git commit -m "fix(vc): Update all VC code to use student_id instead of user_id"
git push origin main
```

### If Still Broken → Debug
1. Check terminal logs for [VC Issue] messages
2. Look for `Subject.id: undefined`
3. Verify database has `student_id` column in verifiable_credentials
4. Check browser console for errors
5. Share error messages for further help

## 🎉 Done!

Once VC issuance works:
- Phase 1 bugs are fully resolved
- Ready to continue with Phase 2 development
- All certificate workflows functional
