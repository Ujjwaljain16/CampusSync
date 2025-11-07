# 🚀 Quick Setup: Use Your Existing Brevo SMTP

Since you already configured Brevo for Supabase auth emails, let's use the **same SMTP credentials** for custom notifications!

## ✅ Benefits of Using Same Brevo Account

1. **Consistent sender** - All emails from same domain
2. **Better deliverability** - Warmed up IP address
3. **Higher limits** - 300 emails/day on free tier (vs Gmail's restrictions)
4. **No duplicate setup** - Use what you already have
5. **Professional** - Better than Gmail for app emails

---

## 📋 Your Brevo SMTP Settings

You should already have these from your Supabase setup:

```env
# Brevo SMTP Configuration (same as Supabase)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-brevo-email@domain.com
SMTP_PASS=your-brevo-smtp-key
```

---

## 🔧 Quick Setup Steps

### Step 1: Get Your Brevo Credentials

**Option A: Copy from Supabase Dashboard**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Your Project → Authentication → Email Templates → Settings
3. You'll see your Brevo SMTP settings there
4. Copy them!

**Option B: Get from Brevo Dashboard**
1. Go to [Brevo](https://app.brevo.com)
2. Click your name (top right) → **SMTP & API**
3. Under **SMTP**, you'll see:
   - **SMTP Server:** `smtp-relay.brevo.com`
   - **Port:** `587`
   - **Login:** Your email
   - **Master Password:** Your SMTP key

---

### Step 2: Add to `.env.local`

Create or update `.env.local` in your project root:

```env
# Brevo SMTP Configuration (Custom Notifications)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-brevo-smtp-key
```

**Important:** Use the **same credentials** you used for Supabase!

---

### Step 3: Restart Dev Server

```bash
# Stop server (Ctrl+C in terminal)
npm run dev
```

You should see in console:
```
✓ Email service configured successfully
```

---

### Step 4: Test It!

#### Test Role Approval Email:
```bash
1. Login as admin
2. Go to: /admin/role-requests
3. Click "Approve" on a pending request
4. User receives email! 📧
```

#### Test Certificate Approval:
```bash
1. Login as faculty/admin
2. Go to certificate approvals
3. Approve a certificate
4. Student receives email! 📧
```

---

## 📊 Brevo Email Limits

### Free Tier (What You Have):
- ✅ **300 emails/day** (vs 2/hour on Supabase default!)
- ✅ Professional SMTP service
- ✅ Good deliverability
- ✅ Email tracking & analytics
- ✅ No credit card required

### If You Need More:
- Paid plans start at $25/month for 20,000 emails/month
- Or use SendGrid, Mailgun, etc.

---

## 🎯 Email Types Breakdown

### Supabase Auth Emails (via Brevo):
Your Supabase is already configured to send these through Brevo:
- ✅ Signup verification
- ✅ Password reset
- ✅ Email change confirmation

### Custom App Emails (via Brevo - NEW!):
Now these will also use Brevo:
- ✨ Certificate approvals/rejections
- ✨ Role approvals/denials
- ✨ Manual review notifications

**Result:** All emails from one service = better deliverability! 🎉

---

## 🔍 Verify It's Working

### Check Console Logs:
After approving a role/certificate, you should see:
```
Email sent to user@example.com: Role Request Approved - CampusSync
```

### Check Brevo Dashboard:
1. Go to [Brevo](https://app.brevo.com)
2. Click **Statistics** → **Email**
3. You'll see all sent emails
4. Track opens, clicks, bounces

---

## ⚠️ Common Issues

### Issue: "Email service not configured"

**Check:**
```bash
# Make sure .env.local has all variables
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-smtp-key
```

**Then restart:**
```bash
npm run dev
```

---

### Issue: "Authentication failed"

**Solution:**
1. Go to Brevo → SMTP & API
2. Copy the **Master Password** (not your login password!)
3. Use that as `SMTP_PASS`

---

### Issue: Emails not arriving

**Check Brevo Dashboard:**
1. Statistics → Email
2. Look for bounce/spam reports
3. Verify recipient email is valid

---

## 📝 Example `.env.local` File

Here's what your complete `.env.local` should look like:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Brevo SMTP Configuration
# (Same credentials used in Supabase for auth emails)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-brevo-master-password

# Other environment variables...
```

---

## 🎨 Email Preview

Your custom emails will look like this:

### Role Approval Email:
```
From: CampusSync <your-email@domain.com>
To: user@example.com
Subject: Role Request Approved - CampusSync

[Beautiful gradient header with CampusSync branding]

Hello John Doe!

🎉 Role Request Approved!

Great news! Your role request has been approved.

Requested Role: Faculty
Institution: Stanford University
Admin Notes: Welcome to the team!

[Access Dashboard Button]

✓ Approved
```

### Certificate Approval:
```
From: CampusSync <your-email@domain.com>
To: student@example.com
Subject: Certificate Approved - CampusSync

[Beautiful gradient header]

Hello Jane Smith!

🎉 Certificate Approved!

Great news! Your certificate has been reviewed and approved.

Certificate: AWS Solutions Architect
Institution: Amazon Web Services
Verification: Manual Review

[View Portfolio Button]

✓ Approved
```

---

## ✅ Quick Checklist

- [ ] I have Brevo account (already set up for Supabase ✅)
- [ ] I found my Brevo SMTP credentials
- [ ] I added them to `.env.local`
- [ ] I restarted the dev server
- [ ] I see "Email sent to..." in console when approving
- [ ] User received the email
- [ ] Email looks good (check HTML rendering)
- [ ] Links in email work correctly

---

## 🚀 You're All Set!

**What you have:**
- ✅ Brevo handling all emails (auth + custom)
- ✅ 300 emails/day limit (plenty for development!)
- ✅ Professional email service
- ✅ Better deliverability than Gmail
- ✅ Email analytics in Brevo dashboard

**What to do:**
1. Copy your Brevo credentials to `.env.local`
2. Restart server
3. Test by approving a role or certificate
4. Done! 🎉

---

## 📚 Resources

- [Brevo Dashboard](https://app.brevo.com)
- [Brevo SMTP Setup](https://help.brevo.com/hc/en-us/articles/209462765)
- [Email Statistics](https://app.brevo.com/statistics/email)
- [Full Documentation](./CUSTOM_EMAIL_NOTIFICATIONS.md)

---

**Last Updated:** November 6, 2025  
**Status:** Ready to Use! Just add credentials to `.env.local`  
**Setup Time:** 2 minutes ⚡
