# 📝 Supabase Email Template Configuration Checklist

## ⚠️ IMPORTANT: Update Your Email Templates to PKCE Format

All Supabase email templates must use the **PKCE flow format** with `token_hash` instead of the old implicit flow.

---

## 🔧 How to Access Templates

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to: **Authentication → Email Templates**

---

## 📧 Templates to Update

### 1. ✅ Confirm Signup (Email Verification)

**Template Name:** `Confirm your signup`

**When Triggered:** New user signs up with `email_confirm: false`

**Current Template Should Be:**
```html
<h2>Confirm your signup</h2>

<p>Follow this link to confirm your account:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm Email</a></p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup</p>
```

**Key Points:**
- ✅ Use `{{ .TokenHash }}` NOT `{{ .Token }}`
- ✅ Use query parameters: `?token_hash=` NOT hash: `#access_token=`
- ✅ Include `&type=signup` parameter
- ✅ Link to `/auth/confirm` (Supabase default handler)

---

### 2. ✅ Reset Password (ALREADY FIXED!)

**Template Name:** `Reset Your Password`

**When Triggered:** User requests password reset

**Current Template Should Be:**
```html
<h2>Reset Password</h2>

<p>Follow this link to reset your password:</p>
<p><a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery</p>
```

**Status:** ✅ WORKING - Updated November 6, 2025

**Key Points:**
- ✅ Use `{{ .TokenHash }}` NOT `{{ .Token }}`
- ✅ Use query parameters: `?token_hash=` NOT hash: `#access_token=`
- ✅ Include `&type=recovery` parameter
- ✅ Link to `/reset-password` (your custom page)

---

### 3. Change Email Address

**Template Name:** `Confirm Email Change`

**When Triggered:** User changes email in profile settings

**Recommended Template:**
```html
<h2>Confirm Email Change</h2>

<p>Follow this link to confirm your new email address:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change">Confirm Email Change</a></p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change</p>
```

**Key Points:**
- ✅ Use `{{ .TokenHash }}` NOT `{{ .Token }}`
- ✅ Use query parameters: `?token_hash=`
- ✅ Include `&type=email_change` parameter
- ✅ Link to `/auth/confirm`

---

### 4. Magic Link (If Using)

**Template Name:** `Magic Link`

**When Triggered:** User requests passwordless login

**Recommended Template:**
```html
<h2>Sign In to CampusSync</h2>

<p>Follow this link to sign in:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Sign In</a></p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink</p>
```

**Key Points:**
- ✅ Use `{{ .TokenHash }}` NOT `{{ .Token }}`
- ✅ Use query parameters: `?token_hash=`
- ✅ Include `&type=magiclink` parameter
- ✅ Link to `/auth/confirm`

---

## 🎨 Template Variables Available

Supabase provides these variables in email templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{ .SiteURL }}` | Your site URL | `http://localhost:3000` |
| `{{ .TokenHash }}` | PKCE token hash | `abc123...` |
| `{{ .Token }}` | ⚠️ OLD - Don't use! | (Deprecated) |
| `{{ .Email }}` | User's email | `user@example.com` |
| `{{ .ConfirmationURL }}` | Auto-generated URL | Use custom instead |

---

## 🚨 Common Mistakes to Avoid

### ❌ DON'T Use Old Implicit Flow Format:
```html
<!-- WRONG! -->
<a href="{{ .SiteURL }}/auth/confirm#access_token={{ .Token }}">
```

### ❌ DON'T Forget Type Parameter:
```html
<!-- WRONG! -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}">
```

### ❌ DON'T Use {{ .ConfirmationURL }} Directly:
```html
<!-- WRONG! (Uses old format) -->
<a href="{{ .ConfirmationURL }}">
```

### ✅ DO Use Custom PKCE Links:
```html
<!-- CORRECT! -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">
```

---

## 🔗 URL Configuration

Also check: **Authentication → URL Configuration**

### Required Settings:

1. **Site URL:**
   - Development: `http://localhost:3000`
   - Production: `https://yourdomain.com`

2. **Redirect URLs (Whitelist):**
   Add these patterns:
   ```
   http://localhost:3000/**
   http://localhost:3000/auth/confirm
   http://localhost:3000/reset-password
   https://yourdomain.com/**
   ```

3. **Email Rate Limiting:**
   - Free tier: 4 emails per hour per user
   - Upgrade or use custom SMTP for higher limits

---

## 🧪 Testing Your Templates

### Method 1: Use the Test Page
```bash
# Navigate to the test page
http://localhost:3000/test-email

# Use the buttons to trigger emails
# Check your inbox/spam folder
```

### Method 2: Manual Testing
```bash
# Test signup verification
1. Go to /signup
2. Create new account
3. Check email for verification link
4. Link should have: ?token_hash=...&type=signup

# Test password reset (already working!)
1. Go to /login
2. Click "Forgot Password"
3. Check email for reset link
4. Link should have: ?token_hash=...&type=recovery
```

### Method 3: Check Supabase Logs
```bash
1. Go to Supabase Dashboard
2. Navigate to Logs
3. Filter by "email"
4. Check delivery status
```

---

## 📊 Verification Checklist

After updating templates, verify:

- [ ] All templates use `{{ .TokenHash }}`
- [ ] All links use query parameters (`?token_hash=`)
- [ ] All links include `&type=` parameter
- [ ] Site URL is correct
- [ ] Redirect URLs are whitelisted
- [ ] Test email for signup verification works
- [ ] Test email for password reset works (already done!)
- [ ] Emails arrive in inbox (not spam)
- [ ] Links expire after 1 hour as expected

---

## 🔐 Security Notes

1. **Token Expiration:** All email tokens expire after 1 hour
2. **One-Time Use:** Tokens can only be used once
3. **PKCE Flow:** More secure than implicit flow (prevents token interception)
4. **Rate Limiting:** Prevents spam/abuse (4/hour on free tier)

---

## 🆘 Troubleshooting

### Problem: Email Not Received
**Solutions:**
1. Check spam folder
2. Verify Supabase email service is enabled
3. Check rate limits (Dashboard → Logs)
4. Verify email domain isn't blacklisted

### Problem: "Invalid token_hash" Error
**Solutions:**
1. Check template uses `{{ .TokenHash }}` not `{{ .Token }}`
2. Verify URL format: query params not hash
3. Request new email (token expired after 1 hour)
4. Clear cookies and try again

### Problem: Link Doesn't Log User In
**Solutions:**
1. Check Supabase client uses PKCE flow
2. For recovery, use `verifyOtp()` method
3. Verify `detectSessionInUrl: true` in client config
4. Check browser console for errors

---

## 📚 Documentation Links

- [Supabase Email Templates Docs](https://supabase.com/docs/guides/auth/auth-email-templates)
- [PKCE Flow Documentation](https://supabase.com/docs/guides/auth/server-side/pkce-flow)
- [Email Testing Guide](./EMAIL_TESTING_GUIDE.md)
- [Password Reset Fix](./FLOW_DIAGRAM.md)

---

## ✅ Quick Update Guide

**Step-by-Step:**

1. **Open Supabase Dashboard**
   ```
   https://app.supabase.com → Your Project
   ```

2. **Go to Email Templates**
   ```
   Authentication → Email Templates
   ```

3. **Update Each Template:**
   - Click "Confirm Signup"
   - Replace `{{ .Token }}` with `{{ .TokenHash }}`
   - Replace `#access_token=` with `?token_hash=`
   - Add `&type=signup` parameter
   - Click "Save"
   - Repeat for other templates

4. **Test Your Changes:**
   ```bash
   # Go to test page
   http://localhost:3000/test-email
   
   # Test each email function
   ```

---

**Last Updated:** November 6, 2025  
**Status:** Password Reset ✅ | Signup Email 🔧 Ready to Configure
