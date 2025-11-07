# 🔍 Email Not Received? Troubleshooting Guide

## Your Current Status

✅ Signup flow working correctly  
✅ Redirecting to verify-email page  
❌ Email not arriving  

---

## 🎯 Quick Fix Steps

### Step 1: Check Supabase Email Settings

1. **Go to Supabase Dashboard**
   - https://app.supabase.com
   - Select your CampusSync project

2. **Check Email Service Status**
   - Go to: **Authentication → Email Templates**
   - Look for a banner saying "Email service is enabled" or similar

3. **Verify Confirm Signup Template**
   - Click **"Confirm Signup"** template
   - Make sure it exists and is enabled
   - Should look like this:

```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your user:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm your mail</a></p>
```

---

### Step 2: Check Your Email Provider (Brevo)

Since you're using Brevo for Supabase emails:

1. **Go to Brevo Dashboard**
   - https://app.brevo.com
   - Login to your account

2. **Check Statistics**
   - Click **Statistics** → **Email**
   - Look for recent sent emails
   - Check if email was sent but bounced

3. **Verify SMTP Settings in Supabase**
   - Supabase Dashboard → **Settings** → **Authentication**
   - Scroll to **SMTP Settings**
   - Verify Brevo credentials are correct:
     ```
     Host: smtp-relay.brevo.com
     Port: 587
     Username: your-email@domain.com
     ```

---

### Step 3: Check Email in Supabase

Let's verify the user was actually created:

**Check Supabase Users Table:**
1. Supabase Dashboard → **Authentication** → **Users**
2. Find user: `ujjwal.24bcs10173@sst.scaler.com`
3. Check `email_confirmed_at` column - should be `NULL`
4. Check `confirmation_sent_at` - should have a timestamp

If `confirmation_sent_at` is NULL, Supabase didn't try to send the email!

---

### Step 4: Manual Email Trigger (Test)

Let's manually trigger a verification email:

**Option A: Use Supabase Dashboard**
1. Go to **Authentication → Users**
2. Find your user
3. Click the **"..."** menu
4. Click **"Send confirmation email"**

**Option B: Use the Test Page**
1. Go to: `http://localhost:3000/test-email`
2. Enter your email: `ujjwal.24bcs10173@sst.scaler.com`
3. Click **"Send Signup Verification"**
4. Check your inbox!

---

## 🐛 Common Issues

### Issue 1: Brevo Daily Limit Reached
**Symptom:** Email not sending  
**Check:** Brevo Dashboard → Statistics  
**Limit:** 300 emails/day on free tier  
**Solution:** Wait until tomorrow or upgrade plan

---

### Issue 2: Email in Spam Folder
**Check:**
- Gmail: Check "Spam" folder
- Outlook: Check "Junk" folder
- Search for: "CampusSync" or "Confirm your signup"

---

### Issue 3: Wrong Email in Supabase
**Check:** Supabase SMTP settings  
**Fix:** 
1. Go to Supabase → Settings → Authentication
2. Scroll to SMTP Settings
3. Verify sender email is valid
4. Test with "Send test email" button

---

### Issue 4: Email Template Disabled
**Check:** Authentication → Email Templates  
**Fix:**
1. Click "Confirm Signup"
2. Make sure it's enabled (toggle should be ON)
3. Click "Save"

---

## 🧪 Quick Test

Let me create a test script to manually send the verification email:

**Method 1: Use Resend from Test Page**
```bash
1. Go to: http://localhost:3000/test-email
2. Enter: ujjwal.24bcs10173@sst.scaler.com
3. Click "Send Signup Verification"
4. Check email!
```

**Method 2: Check Supabase Logs**
```bash
1. Supabase Dashboard → Logs
2. Filter by "email" or "smtp"
3. Look for errors or delivery status
4. Should see: "Email sent to ujjwal.24bcs10173@sst.scaler.com"
```

---

## 📋 Diagnostic Checklist

Run through this checklist:

- [ ] User exists in Supabase (Authentication → Users)
- [ ] `email_confirmed_at` is NULL (needs verification)
- [ ] Brevo SMTP configured in Supabase
- [ ] "Confirm Signup" email template exists
- [ ] Email template is enabled
- [ ] Brevo daily limit not exceeded (< 300 emails)
- [ ] Checked spam folder
- [ ] Tried manual resend from Supabase Dashboard
- [ ] Checked Supabase logs for errors

---

## 🎯 Most Likely Cause

Based on your setup with Brevo, here are the most likely reasons:

### 1. SMTP Not Configured in Supabase (Most Common!)
**Check:**
- Supabase Dashboard → Settings → Authentication
- Scroll down to "SMTP Settings"
- If empty, Supabase is using default email service (only 2-4 emails/hour!)

**Fix:**
Add your Brevo credentials to Supabase SMTP settings!

### 2. Email Template Using Old Format
**Check:** 
- Template uses `{{ .TokenHash }}` not `{{ .Token }}`
- Template uses `?token_hash=` not `#access_token=`

**Fix:**
Update template as shown in Step 1 above.

---

## 🚀 Quick Fix Now

**Try this right now:**

1. **Go to test page:**
   ```
   http://localhost:3000/test-email
   ```

2. **Enter your email:**
   ```
   ujjwal.24bcs10173@sst.scaler.com
   ```

3. **Click "Send Signup Verification"**

4. **Check your email** (and spam folder!)

If this works, the issue is with Supabase's automatic email sending.  
If this doesn't work, the issue is with your Brevo/SMTP setup.

---

## 📞 Still Not Working?

**Check these locations:**

1. **Email Inbox:** ujjwal.24bcs10173@sst.scaler.com
2. **Spam/Junk Folder**
3. **Promotions Tab** (if Gmail)
4. **Brevo Dashboard:** https://app.brevo.com → Statistics
5. **Supabase Logs:** Dashboard → Logs → Filter "email"

---

**Created:** November 6, 2025  
**Next Step:** Try the test page to manually trigger email!
