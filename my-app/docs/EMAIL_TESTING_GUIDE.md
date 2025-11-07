# 📧 Email Testing Guide for CampusSync

## Email System Architecture

CampusSync uses **TWO separate email systems**:

### 1. 🔐 Supabase Auth Emails (Automatic)
Handles all authentication-related emails:
- ✅ **Signup Email Verification** (`email_confirm: false` in signup API)
- ✅ **Password Reset** (Fixed with PKCE flow)
- ✅ **Email Change Confirmation**
- ✅ **Magic Link Login** (if enabled)

**Configuration:** Managed in Supabase Dashboard → Authentication → Email Templates

### 2. 📬 Custom Notification Emails (NodeMailer)
Handles application-specific notifications via `lib/emailService.ts`:
- Certificate approval notifications
- Role approval notifications
- Custom admin messages

**Configuration:** Requires SMTP settings in environment variables

---

## ✅ What's Already Working

### Password Reset (PKCE Flow) ✅
- **Status:** FULLY FUNCTIONAL
- **Flow:** User enters email → Receives link with `?token_hash=` → `verifyOtp()` → Session → Password update
- **Email Template:** Updated to PKCE format
- **Code:** `src/app/reset-password/page.tsx` using `verifyOtp()`
- **Tested:** November 6, 2025 - Working perfectly!

---

## 🧪 Email Functions to Test

### 1. Signup Email Verification

**Current Configuration:**
```typescript
// File: src/app/api/auth/signup/student-faculty/route.ts
await adminClient.auth.admin.createUser({
  email,
  password,
  email_confirm: false, // ⚠️ Requires email verification
  user_metadata: { ... }
});
```

**Expected Flow:**
1. User fills signup form
2. Account created with `email_confirmed_at: null`
3. Supabase sends verification email
4. User clicks verification link
5. Email confirmed, user can login

**Testing Steps:**
```bash
# 1. Create test account
# Go to: http://localhost:3000/signup
# Fill form with valid email (check spam folder!)

# 2. Check if email arrives
# Subject: "Confirm your signup"
# Contains link like: http://localhost:3000/auth/confirm?token_hash=...&type=signup

# 3. Click link - should redirect to app

# 4. Verify in Supabase Dashboard
# Authentication → Users → Check email_confirmed_at is set
```

**Email Template to Check:**
```
Supabase Dashboard → Authentication → Email Templates → Confirm Signup
```

Should contain:
```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your account:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm Email</a></p>
```

---

### 2. Password Reset (Already Fixed!)

**Status:** ✅ WORKING

**Email Template Format:**
```html
<p><a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>
```

**Code Implementation:**
```typescript
// src/app/reset-password/page.tsx
const { error: verifyError } = await supabase.auth.verifyOtp({
  token_hash: token,
  type: 'recovery'
});
```

---

### 3. Email Change Confirmation

**When Used:** User changes email in profile settings

**Email Template:**
```
Supabase Dashboard → Authentication → Email Templates → Change Email
```

Should use PKCE format:
```html
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change">Confirm Email Change</a></p>
```

---

### 4. Magic Link (If Enabled)

**Email Template:**
```
Supabase Dashboard → Authentication → Email Templates → Magic Link
```

Should use PKCE format:
```html
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Sign In</a></p>
```

---

## 🔧 Required Supabase Email Settings

### Check These Settings in Supabase Dashboard:

1. **Authentication → Email Templates**
   - All templates should use `{{ .TokenHash }}` (NOT `{{ .Token }}`)
   - All templates should use `token_hash=` parameter (NOT `#access_token=`)
   - Confirm type parameter matches: `type=signup`, `type=recovery`, etc.

2. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (development)
   - Redirect URLs: Add `http://localhost:3000/**` to allow all auth redirects

3. **Authentication → Email Provider**
   - Confirm Supabase email service is enabled
   - Check rate limits (default: 4 emails per hour in free tier)
   - For production: Configure custom SMTP

---

## 🧪 Quick Email Test Checklist

### Test 1: Signup Verification
```bash
□ Go to /signup
□ Enter valid email (use real email you can check)
□ Complete signup form
□ Check email inbox/spam
□ Click verification link
□ Verify email_confirmed_at is set in Supabase
□ Try logging in
```

### Test 2: Password Reset (Already Working!)
```bash
✅ Go to /login
✅ Click "Forgot Password"
✅ Enter email
✅ Receive email with ?token_hash= link
✅ Click link → redirects to /reset-password
✅ Enter new password
✅ Password updated successfully
✅ Redirected to /login
```

### Test 3: Email Rate Limits
```bash
□ Try sending 5 password reset emails in 1 hour
□ Should hit rate limit (4/hour on free tier)
□ Verify error message
```

---

## 🐛 Common Issues & Solutions

### Issue 1: Email Not Received
**Symptoms:** User signs up but no email arrives

**Solutions:**
1. Check spam/junk folder
2. Verify Supabase email service is enabled
3. Check rate limits (4 emails/hour on free tier)
4. Check Supabase Dashboard → Logs for email delivery errors
5. Ensure email domain isn't blacklisted

### Issue 2: "Invalid token_hash" Error
**Symptoms:** Clicking email link shows error

**Solutions:**
1. Check email template uses `{{ .TokenHash }}` not `{{ .Token }}`
2. Verify URL format: `?token_hash=...&type=...` (query params, not hash)
3. Token expires after 1 hour - request new email
4. Clear browser cookies and try again

### Issue 3: Session Not Establishing
**Symptoms:** Email link clicked but not logged in

**Solutions:**
1. Ensure Supabase client configured with PKCE:
```typescript
const supabase = createBrowserClient(url, key, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true
  }
});
```

2. For recovery links, use `verifyOtp()`:
```typescript
await supabase.auth.verifyOtp({
  token_hash,
  type: 'recovery' // or 'signup', 'email_change', etc.
});
```

---

## 📋 Email Template Checklist

All Supabase email templates should follow this format:

### ✅ Correct (PKCE Format)
```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">
```

### ❌ Incorrect (Old Implicit Flow)
```html
<a href="{{ .SiteURL }}/auth/confirm#access_token={{ .Token }}">
```

### Templates to Update:
- [ ] Confirm Signup → `type=signup`
- [x] Reset Password → `type=recovery` ✅ DONE
- [ ] Change Email → `type=email_change`
- [ ] Magic Link → `type=magiclink`

---

## 🚀 Next Steps

1. **Test Signup Email:**
   ```bash
   # Create new account at /signup
   # Check email and click verification link
   ```

2. **Verify All Email Templates:**
   ```bash
   # Go to Supabase Dashboard
   # Check all templates use PKCE format
   ```

3. **Test Rate Limits:**
   ```bash
   # Try triggering 5+ emails in 1 hour
   # Verify rate limiting works
   ```

4. **Production Setup:**
   - Configure custom SMTP for higher limits
   - Set production Site URL
   - Update redirect URLs
   - Test with real domain

---

## 📊 Monitoring Email Delivery

### Check Email Logs:
```bash
# Supabase Dashboard → Logs → Filter by 'email'
# Look for delivery status, bounces, failures
```

### Monitor User Verification:
```sql
-- Check users pending verification
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email_confirmed_at IS NULL
ORDER BY created_at DESC;
```

---

## 🎯 Success Criteria

- ✅ Password reset emails working (DONE!)
- [ ] Signup verification emails sending
- [ ] Email links using PKCE format
- [ ] Users can verify email and login
- [ ] Rate limiting working properly
- [ ] No emails in spam folder (ideally)

---

**Last Updated:** November 6, 2025  
**Status:** Password Reset ✅ Working | Signup Verification 🧪 Ready to Test
