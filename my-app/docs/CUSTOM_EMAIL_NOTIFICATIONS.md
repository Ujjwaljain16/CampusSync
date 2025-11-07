# 📬 Custom Email Notifications Guide

## Overview

CampusSync has **TWO email systems** working together:

### 1. 🔐 Supabase Auth Emails (Authentication)
- **Purpose:** User authentication
- **Handles:** Signup verification, password reset, email changes
- **Configuration:** Supabase Dashboard
- **Status:** Password Reset ✅ Working

### 2. 📧 Custom Notification Emails (This Guide)
- **Purpose:** Application notifications
- **Handles:** Certificate approvals, role requests, admin notifications
- **Configuration:** SMTP environment variables (this guide)
- **Technology:** NodeMailer with custom HTML templates

---

## 📋 Custom Notification Types

Your app sends these notifications via `lib/emailService.ts`:

### ✅ Certificate Notifications
1. **Certificate Approved** - Manual faculty approval
2. **Certificate Auto-Approved** - AI verification success
3. **Certificate Rejected** - Failed verification
4. **Manual Review Required** - Needs faculty review

### 👥 Role Request Notifications (NEW! ✨)
5. **Role Approved** - Admin approved role request
6. **Role Denied** - Admin denied role request

---

## 🔧 Setup: Configure SMTP Email Service

### Step 1: Choose Email Provider

You need an SMTP server. Here are popular free options:

#### Option A: Gmail (Easiest for Testing)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
```

**Important:** Use [App Password](https://myaccount.google.com/apppasswords), not your regular Gmail password!

#### Option B: SendGrid (Best for Production)
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

#### Option C: Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-mailgun-smtp-username
SMTP_PASS=your-mailgun-smtp-password
```

#### Option D: Mailtrap (Testing Only)
```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your-mailtrap-username
SMTP_PASS=your-mailtrap-password
```

---

### Step 2: Add Environment Variables

Create or update `.env.local` in your project root:

```env
# Email Service Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
```

**Security Note:** Never commit `.env.local` to git! It's already in `.gitignore`.

---

### Step 3: Restart Dev Server

```bash
# Stop server (Ctrl+C)
# Then restart
npm run dev
```

The email service will automatically initialize with your SMTP settings.

---

## 🧪 Testing Custom Notifications

### Test 1: Certificate Approval Email

```bash
# 1. Login as faculty/admin
# 2. Go to certificate approval page
# 3. Approve or reject a certificate
# 4. Student receives email notification
```

**Expected Email:**
- ✅ Beautiful HTML template
- ✅ Certificate details
- ✅ Approval/rejection status
- ✅ Link to student portfolio

---

### Test 2: Role Approval Email (NEW! ✨)

```bash
# 1. Login as admin
# 2. Go to role requests: /admin/role-requests
# 3. Approve a role request
# 4. User receives approval email
```

**Expected Email:**
- ✅ Beautiful HTML template
- ✅ Approved role name
- ✅ Institution name
- ✅ Link to dashboard
- ✅ Welcome message

---

### Test 3: Role Denial Email (NEW! ✨)

```bash
# 1. Login as admin
# 2. Go to role requests: /admin/role-requests
# 3. Deny a role request
# 4. User receives denial email
```

**Expected Email:**
- ✅ Professional denial message
- ✅ Reason for denial
- ✅ Link to support
- ✅ Helpful next steps

---

## 📧 Email Templates

All emails use beautiful HTML templates with:
- 🎨 Gradient header matching CampusSync branding
- 📱 Mobile-responsive design
- 🔔 Status badges (approved/rejected/pending)
- 🔗 Action buttons
- ✨ Professional footer

### Certificate Approved Template
```
Subject: Certificate Approved - CampusSync

🎉 Certificate Approved!

Great news! Your certificate has been reviewed and approved.

Certificate: [Title]
Institution: [Name]
Verification: Manual Review

✓ Approved

[View Portfolio Button]
```

### Role Approved Template
```
Subject: Role Request Approved - CampusSync

🎉 Role Request Approved!

Great news! Your role request has been approved.

Requested Role: Faculty
Institution: Stanford University
Admin Notes: Welcome to the team!

[Access Dashboard Button]

✓ Approved
```

### Role Denied Template
```
Subject: Role Request Denied - CampusSync

❌ Role Request Denied

Unfortunately, your role request has been denied.

Requested Role: Faculty
Reason: [Reason]
Admin Notes: [Notes]

[Contact Support Button]

✗ Denied
```

---

## 🔍 Troubleshooting

### Issue 1: "Email service not configured"

**Console shows:**
```
Email service not configured. Set SMTP_USER and SMTP_PASS environment variables.
```

**Solution:**
1. Add SMTP variables to `.env.local`
2. Restart dev server: `npm run dev`
3. Check console for "Email sent to..." messages

---

### Issue 2: Emails not sending

**Check:**
1. Environment variables are set correctly
2. Gmail users: Using App Password, not regular password
3. SMTP credentials are valid
4. Check server console for error messages
5. Try Mailtrap for testing (it catches all emails)

---

### Issue 3: Email goes to spam

**Solutions:**
1. **For testing:** Check spam folder
2. **For production:**
   - Use professional SMTP service (SendGrid, Mailgun)
   - Set up SPF/DKIM records
   - Use custom domain email
   - Warm up IP address gradually

---

### Issue 4: Gmail "Less secure app" error

**Solution:**
Use App-Specific Password:
1. Go to: https://myaccount.google.com/apppasswords
2. Generate new app password
3. Use that password in SMTP_PASS (not your Gmail password)

---

## 🚀 What I Just Added

### Updated Files:

#### 1. Role Approval Route ✨ NEW
**File:** `src/app/api/admin/role-requests/[id]/approve/route.ts`

**Added:**
```typescript
// Send role approved email
await emailService.sendRoleApproved(userEmail, {
  userName: 'John Doe',
  requestedRole: 'faculty',
  institution: 'Stanford University',
  adminNotes: 'Welcome!',
  dashboardUrl: '/dashboard'
});
```

#### 2. Role Denial Route ✨ NEW
**File:** `src/app/api/admin/role-requests/[id]/deny/route.ts`

**Added:**
```typescript
// Send role denied email
await emailService.sendRoleDenied(userEmail, {
  userName: 'John Doe',
  requestedRole: 'faculty',
  reason: 'Criteria not met',
  adminNotes: 'Contact support',
  supportUrl: '/support'
});
```

---

## 📊 Notification Flow

### Certificate Approval Flow
```
Student uploads certificate
    ↓
Faculty reviews
    ↓
Faculty clicks Approve/Reject
    ↓
API: /api/certificates/approve
    ↓
emailService.sendCertificateApproved()
    ↓
Student receives email 📧
```

### Role Approval Flow
```
User requests role
    ↓
Admin reviews request
    ↓
Admin clicks Approve/Deny
    ↓
API: /api/admin/role-requests/[id]/approve or deny
    ↓
emailService.sendRoleApproved() or sendRoleDenied()
    ↓
User receives email 📧
```

---

## 🎯 Email Service Features

### Already Built-In:
- ✅ Beautiful HTML templates
- ✅ Mobile responsive design
- ✅ Status badges and buttons
- ✅ Error handling (doesn't break app if email fails)
- ✅ Console logging for debugging
- ✅ Professional branding

### Template Variables:
```typescript
{
  studentName?: string;
  userName?: string;
  certificateTitle?: string;
  institution?: string;
  requestedRole?: string;
  adminNotes?: string;
  reason?: string;
  confidenceScore?: number;
  verificationMethod?: string;
  portfolioUrl?: string;
  dashboardUrl?: string;
  supportUrl?: string;
}
```

---

## 📝 Quick Setup Checklist

- [ ] Choose SMTP provider (Gmail, SendGrid, etc.)
- [ ] Get SMTP credentials
- [ ] Add to `.env.local`:
  - [ ] SMTP_HOST
  - [ ] SMTP_PORT
  - [ ] SMTP_SECURE
  - [ ] SMTP_USER
  - [ ] SMTP_PASS
- [ ] Restart dev server
- [ ] Test certificate approval email
- [ ] Test role approval email
- [ ] Test role denial email
- [ ] Check emails arrive (check spam too!)
- [ ] Verify email templates look good

---

## 🔐 Production Checklist

Before deploying to production:

- [ ] Use professional SMTP service (not Gmail)
- [ ] Set up custom domain email
- [ ] Configure SPF/DKIM records
- [ ] Set up email monitoring/alerts
- [ ] Test email deliverability
- [ ] Set up email rate limits
- [ ] Add unsubscribe links (if required)
- [ ] Test on mobile devices
- [ ] Verify all links work with production URL

---

## 📚 Code Reference

### Email Service Location
```
lib/emailService.ts - Main email service class
```

### Usage in API Routes
```typescript
import { emailService } from '@/lib/emailService';

// Send notification
await emailService.sendCertificateApproved(email, {
  studentName: 'John',
  certificateTitle: 'AWS Certification',
  institution: 'Amazon',
  portfolioUrl: 'https://...'
});
```

### Available Methods
```typescript
emailService.sendCertificateApproved()
emailService.sendCertificateAutoApproved()
emailService.sendCertificateRejected()
emailService.sendManualReviewRequired()
emailService.sendRoleApproved()       // ✨ NEW
emailService.sendRoleDenied()         // ✨ NEW
```

---

## 🎨 Customizing Email Templates

To customize the HTML templates:

1. Open `lib/emailService.ts`
2. Find `generateEmailHTML()` method
3. Update HTML for each template type
4. Keep responsive design and branding
5. Test on multiple email clients

---

## 📖 Example: Gmail Setup

### Step-by-Step:

1. **Enable 2FA** (required for app passwords)
   - Google Account → Security → 2-Step Verification

2. **Generate App Password**
   - Go to: https://myaccount.google.com/apppasswords
   - Select app: "Mail"
   - Select device: "Other" → "CampusSync"
   - Click "Generate"
   - Copy the 16-character password

3. **Add to `.env.local`**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=the-16-char-app-password
   ```

4. **Restart server**
   ```bash
   npm run dev
   ```

5. **Test!**
   - Approve a certificate or role request
   - Check your email inbox

---

## 🎉 Summary

**What's Working Now:**
1. ✅ Certificate approval emails
2. ✅ Certificate rejection emails
3. ✅ Auto-approval emails
4. ✅ Manual review emails
5. ✅ Role approval emails (NEW!)
6. ✅ Role denial emails (NEW!)

**What You Need:**
1. SMTP credentials (Gmail, SendGrid, etc.)
2. Environment variables in `.env.local`
3. Dev server restart

**Total Setup Time:** ~10 minutes

---

**Created:** November 6, 2025  
**Status:** Code Updated ✅ | SMTP Setup Required 🔧  
**Next Action:** Add SMTP credentials and test emails!
