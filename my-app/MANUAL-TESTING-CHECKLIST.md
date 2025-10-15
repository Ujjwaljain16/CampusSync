# 🧪 Manual Testing Checklist

**Date:** October 15, 2025  
**Purpose:** Verify refactored code works before proceeding

---

## ✅ **Step 1: Test Refactored API Routes**

### **Test 1: /api/certificates/mine**

**What Changed:**
- Old: Manual auth check with `createSupabaseServerClient()` + `getUser()`
- New: `withAuth()` middleware handles auth automatically

**How to Test:**
1. Start dev server: `npm run dev`
2. Login to your app as a student
3. Navigate to student dashboard (should load certificates)
4. Check browser console for errors
5. Check Network tab - should see 200 response from `/api/certificates/mine`

**Expected Behavior:**
- ✅ Certificates load correctly
- ✅ Auth is enforced (401 if not logged in)
- ✅ Response format: `{ data: [...] }`

**If it fails:**
- Check console errors
- Verify `withAuth` middleware is working
- Check response format matches expected

---

### **Test 2: /api/admin/roles (GET)**

**What Changed:**
- Old: Manual `requireRole(['admin'])` check
- New: `withRole(['admin'])` middleware

**How to Test:**
1. Login as admin user
2. Navigate to `/admin/dashboard`
3. Check if users list loads
4. Check Network tab - should see 200 from `/api/admin/roles`

**Expected Behavior:**
- ✅ Admin can see user list
- ✅ Non-admins get 403 Forbidden
- ✅ Response format: `{ data: [...] }`

---

### **Test 3: /api/admin/roles (POST)**

**What Changed:**
- Old: Manual body parsing + validation
- New: `parseAndValidateBody()` helper

**How to Test:**
1. As admin, try to change a user's role
2. Check if validation errors show correctly
3. Check if role changes work

**Expected Behavior:**
- ✅ Missing fields return 422 validation error
- ✅ Invalid roles return validation error
- ✅ Valid requests succeed with 200
- ✅ Response: `{ data: {...}, message: 'Role updated successfully' }`

---

## 📋 **Manual Test Script**

Run these commands to test:

```bash
# Start dev server
npm run dev

# In another terminal, test the APIs
# (Requires you to be logged in with valid session cookie)

# Test 1: Get my certificates (requires login)
curl http://localhost:3000/api/certificates/mine

# Test 2: Get all roles (requires admin)
curl http://localhost:3000/api/admin/roles

# Test 3: Update role (requires admin + body)
curl -X POST http://localhost:3000/api/admin/roles \
  -H "Content-Type: application/json" \
  -d '{"user_id": "some-uuid", "role": "student"}'
```

---

## ✅ **Checklist Before Proceeding**

- [ ] Dev server starts without errors
- [ ] `/api/certificates/mine` returns data for logged-in user
- [ ] `/api/certificates/mine` returns 401 for anonymous user
- [ ] `/api/admin/roles` works for admin users
- [ ] `/api/admin/roles` returns 403 for non-admin users
- [ ] Response formats are consistent
- [ ] No console errors in browser
- [ ] No TypeScript compilation errors

---

## 🚨 **If Tests Fail**

### **Common Issues:**

1. **Import errors**
   - Check `@/lib/api` path is correct
   - Verify `tsconfig.json` has path aliases

2. **Auth not working**
   - Verify `withAuth` middleware gets user correctly
   - Check Supabase session is valid

3. **Response format issues**
   - Ensure `success()` and `apiError.*` are used correctly
   - Check Network tab for actual response structure

4. **TypeScript errors**
   - Run `npm run build` to check for errors
   - Fix any type mismatches

---

## 📝 **Test Results**

**Date Tested:** _____________

**Results:**
- [ ] All tests passed ✅
- [ ] Some tests failed ❌ (document issues below)

**Issues Found:**
```
[Document any issues here]
```

**Actions Taken:**
```
[Document fixes here]
```

---

**Status:** ⏳ **Ready for Testing**  
**Next Step:** Run manual tests, then proceed to page migration
