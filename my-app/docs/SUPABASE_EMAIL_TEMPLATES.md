# 📝 Supabase Email Template Configuration Checklist
All Supabase email templates must use the **PKCE flow format** with `token_hash`

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

### 2. ✅ Reset Password 

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
