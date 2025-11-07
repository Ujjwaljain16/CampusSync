# Password Reset Email Template Configuration

## ⚠️ CRITICAL: Update Your Supabase Email Template

Your application uses **PKCE flow** for authentication, which means the password reset email must use **query parameters** instead of hash fragments.

## Steps to Fix in Supabase Dashboard

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **Authentication** → **Email Templates**
3. Find **Reset Password** template
4. Replace the entire template with the one below

---

## ✅ CORRECT Email Template (PKCE Flow)

```html
<h2>Reset Password</h2>

<p>Hello,</p>

<p>Follow this link to reset your password:</p>

<p>
  <a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a>
</p>

<p>If the button doesn't work, copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery</p>

<p>This link will expire in 1 hour.</p>

<p>If you didn't request a password reset, you can safely ignore this email.</p>
```

---

## ❌ WRONG Template (What You Had - Implicit Flow)

**DO NOT USE THIS:**
```html
<!-- This is WRONG for PKCE flow -->
<p><a href="{{ .SiteURL }}/reset-password#access_token={{.Token }}&type=recovery">Reset Password</a></p>
```

---

## Key Differences

| Aspect | PKCE Flow (Correct) ✅ | Implicit Flow (Wrong) ❌ |
|--------|---------------------|------------------------|
| URL Type | Query parameters (`?token_hash=...`) | Hash fragments (`#access_token=...`) |
| Variable | `{{ .TokenHash }}` | `{{ .Token }}` |
| Parameter | `?token_hash=` | `#access_token=` |
| Security | More secure | Less secure (deprecated) |
| Server-side | Token exchanged server-side | Token in URL (client-side) |

---

## Additional Configuration Required

### 1. Supabase Redirect URLs

In **Supabase Dashboard** → **Authentication** → **URL Configuration**, add:

```
http://localhost:3000/reset-password
https://yourdomain.com/reset-password
```

### 2. Environment Variables

Ensure these are set in your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000  # or your production URL
```

### 3. Supabase Auth Settings

In **Supabase Dashboard** → **Authentication** → **Settings**:

- ✅ Enable Email Confirmations: OFF (for development) or ON (for production)
- ✅ Secure Email Change: ON (recommended)
- ✅ PKCE Flow: This should be enabled by default for modern setups

---

## Testing the Flow

### Test Steps:

1. **Request Password Reset:**
   - Go to `/login`
   - Click "Forgot Password"
   - Enter your email
   - Click "Send Reset Email"

2. **Check Your Email:**
   - You should receive an email with a link like:
     ```
     http://localhost:3000/reset-password?token_hash=XXXX&type=recovery
     ```
   - **NOT** with hash (`#`) like:
     ```
     http://localhost:3000/reset-password#access_token=XXXX  ← WRONG!
     ```

3. **Click the Link:**
   - Browser opens `/reset-password` page
   - You should see "Validating reset link..." briefly
   - Then the password reset form appears
   - **NO "Auth session missing!" error** ✅

4. **Enter New Password:**
   - Type new password (min 8 characters)
   - Confirm password
   - Click "Reset Password"
   - Should redirect to `/login` with success message

### Expected Console Logs (Success):

```
🔍 [Reset Password] Initializing password reset flow...
✅ [Reset Password] Valid session found via PKCE flow
🔄 [Reset Password] Attempting to update password...
✅ [Reset Password] Session valid, updating password...
✅ [Reset Password] Password updated successfully
```

### Expected Console Logs (If Error):

```
🔍 [Reset Password] Initializing password reset flow...
❌ [Reset Password] No valid session found
```

---

## Troubleshooting

### Error: "Auth session missing!"

**Causes:**
1. ❌ Email template still uses hash fragments (`#access_token`)
2. ❌ Redirect URL not configured in Supabase
3. ❌ Browser blocking cookies/localStorage

**Solutions:**
1. ✅ Update email template to use `?token_hash={{ .TokenHash }}`
2. ✅ Add redirect URL in Supabase dashboard
3. ✅ Check browser privacy settings
4. ✅ Clear browser cache and try again

### Error: "Invalid or expired reset link"

**Causes:**
1. Link older than 1 hour
2. Link already used
3. User email changed/deleted

**Solutions:**
1. Request a new password reset
2. Each link can only be used once
3. Ensure user account exists

### Password Reset Form Doesn't Show

**Causes:**
1. JavaScript error in console
2. Validation stuck in loading state

**Solutions:**
1. Check browser console for errors
2. Ensure all dependencies installed: `npm install`
3. Check network tab for failed requests

---

## Code Changes Summary

### Files Modified:

1. **`src/lib/supabaseClient.ts`** - Updated PKCE configuration
2. **`src/lib/supabase/client.ts`** - Added auth flow config
3. **`src/lib/supabase/middleware.ts`** - Added PKCE support
4. **`src/app/reset-password/page.tsx`** - Complete rewrite for PKCE flow
5. **`src/middleware.ts`** - Already configured correctly ✅

### Key Changes:

- ✅ Client configured with `flowType: 'pkce'`
- ✅ `detectSessionInUrl: true` enables automatic token exchange
- ✅ Reset page uses `createClient()` from modern Supabase client
- ✅ Proper session validation before password update
- ✅ User signed out after password reset for security

---

## Security Best Practices

1. ✅ **PKCE Flow** - More secure than implicit flow
2. ✅ **Token Hash** - Token never exposed in URL fragment
3. ✅ **Server-Side Exchange** - Tokens exchanged on server
4. ✅ **Sign Out After Reset** - Forces re-login with new password
5. ✅ **1-Hour Expiry** - Links expire quickly
6. ✅ **One-Time Use** - Each link can only be used once

---

## Support

If you still encounter issues after following this guide:

1. Check browser console for detailed error logs
2. Verify email template in Supabase matches exactly
3. Confirm redirect URLs are configured
4. Test with a fresh incognito/private browser window
5. Clear all browser data and cookies

---

**Last Updated:** 2025-01-06
**Next.js Version:** 15.5.3
**Supabase SSR Version:** Latest with PKCE support
