# 🔐 SECURITY FIX GUIDE - Critical Actions Required

## ⚠️ Current Security Status

**GOOD NEWS:** ✅ `.env.local` was **NEVER committed to Git** - No history cleanup needed!

**ACTION REQUIRED:** 🔴 Rotate exposed API keys immediately

---

## 🚨 Exposed Secrets (From Analysis)

The following secrets were found in your codebase analysis documents:

1. **SUPABASE_SERVICE_ROLE_KEY** - Full database admin access
2. **GEMINI_API_KEY** - AI/OCR service access
3. **VC_ISSUER_JWK** - Development placeholder keys (need production keys)

---

## 📋 Security Fix Checklist

### ✅ Step 1: Verify .env.local is NOT in Git (ALREADY DONE)

**Status:** ✅ CONFIRMED - File never committed to Git

```bash
# Already verified:
git log --all --full-history -- .env.local
# Result: No commits found ✅
```

### ✅ Step 2: Verify .gitignore is Correct (ALREADY DONE)

**Status:** ✅ CONFIRMED - `.env*` is in .gitignore

Your `.gitignore` already contains:
```
.env*
```

This prevents any `.env.local`, `.env.production`, etc. from being committed.

---

## 🔄 Step 3: Rotate Supabase Service Role Key

### Why This is Critical:
The `SUPABASE_SERVICE_ROLE_KEY` bypasses ALL Row Level Security (RLS) policies and has full database admin access.

### How to Rotate:

1. **Go to Supabase Dashboard:**
   - Navigate to: https://supabase.com/dashboard/project/stflfunpgyotfznoocaw
   - Or use your project dashboard URL

2. **Generate New Service Role Key:**
   - Click on **Settings** → **API**
   - Scroll to **Service Role Key** section
   - Click **"Regenerate key"** or **"Create new key"**
   - ⚠️ This will invalidate the old key immediately

3. **Update .env.local:**
   ```bash
   # OLD (EXPOSED - DO NOT USE):
   # SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   
   # NEW (from Supabase dashboard):
   SUPABASE_SERVICE_ROLE_KEY=<paste-new-key-here>
   ```

4. **Test Your Application:**
   ```bash
   npm run dev
   # Test admin operations, certificate approvals, etc.
   ```

---

## 🤖 Step 4: Rotate Gemini API Key

### Why This is Critical:
Exposed Gemini API key can be used by others, potentially:
- Consuming your quota
- Running up your Google Cloud bill
- Accessing your AI services

### How to Rotate:

1. **Go to Google AI Studio / Google Cloud Console:**
   - Navigate to: https://aistudio.google.com/apikey
   - Or: https://console.cloud.google.com/apis/credentials

2. **Revoke Old Key:**
   - Find your API key: `AIzaSyC2wUpucsWk8g5Ykk5CSJHHKKqLyULyaes`
   - Click **"Delete"** or **"Revoke"**
   - Confirm deletion

3. **Create New API Key:**
   - Click **"Create API Key"**
   - Select your Google Cloud project
   - Copy the new key

4. **Update .env.local:**
   ```bash
   # OLD (EXPOSED - DO NOT USE):
   # GEMINI_API_KEY=AIzaSyC2wUpucsWk8g5Ykk5CSJHHKKqLyULyaes
   
   # NEW (from Google AI Studio):
   GEMINI_API_KEY=<paste-new-key-here>
   ```

5. **Test OCR/Vision Features:**
   ```bash
   npm run dev
   # Upload a certificate, test OCR extraction
   ```

---

## 🔑 Step 5: Generate Production VC (Verifiable Credential) Keys

### Current Status:
Your `.env.local` has **placeholder development keys** in `VC_ISSUER_JWK`.

### Why This Matters:
- Placeholder keys are **NOT SECURE** for production
- Anyone can forge credentials with placeholder keys
- Real cryptographic keys are needed for production

### How to Generate Production Keys:

#### Option A: Use Your Existing Script (Recommended)

You already have a script! Let's use it:

```bash
# Run the key generation script:
node scripts/generate-vc-jwk-simple.js

# This will generate a production-ready JWK and save it
```

#### Option B: Manual Generation (If script doesn't work)

```bash
# Generate new production keys:
node -e "
const crypto = require('crypto');
const { subtle } = crypto.webcrypto;

(async () => {
  const keyPair = await subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  
  const jwk = await subtle.exportKey('jwk', keyPair.privateKey);
  jwk.kid = 'key-' + crypto.randomUUID().slice(0, 8);
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  
  console.log('\\nAdd this to your .env.local:');
  console.log('VC_ISSUER_JWK=' + JSON.stringify(jwk));
  console.log('\\nUpdate these as well:');
  console.log('NEXT_PUBLIC_ISSUER_DID=did:web:yourdomain.com');
  console.log('NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:yourdomain.com#' + jwk.kid);
})();
"
```

### Update .env.local with Production Keys:

```bash
# Replace placeholder with real keys:
VC_ISSUER_JWK={"kty":"RSA","use":"sig","kid":"key-XXXXXXXX","alg":"RS256",...}

# Update DID to your production domain:
NEXT_PUBLIC_ISSUER_DID=did:web:yourdomain.com
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:yourdomain.com#key-XXXXXXXX
```

---

## 🌐 Step 6: Prepare Production Environment Variables

Create a **separate** `.env.production` file (also gitignored) for production:

```bash
# Create production env file:
cp .env.local .env.production
```

Then update `.env.production` with:

```bash
# Production values:
NEXT_PUBLIC_SUPABASE_URL=https://stflfunpgyotfznoocaw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_SITE_URL=https://yourdomain.com  # ← Change this!
SUPABASE_SERVICE_ROLE_KEY=<rotated-key>
GEMINI_API_KEY=<rotated-key>
VC_ISSUER_JWK=<production-jwk>
NEXT_PUBLIC_ISSUER_DID=did:web:yourdomain.com  # ← Change this!
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:yourdomain.com#key-XXXXXXXX

# Production settings:
USE_DOCUMENTS_TABLE=true
OCR_ENABLED=true
OCR_SERVICE_URL=https://your-ocr-service.com  # ← Deploy OCR service
GEMINI_MODEL=gemini-2.5-flash
USE_GEMINI_VISION=true
```

---

## 🔒 Step 7: Set Environment Variables in Hosting Platform

### For Vercel:

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add each variable from `.env.production`:

```
NEXT_PUBLIC_SUPABASE_URL = https://stflfunpgyotfznoocaw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <value>
NEXT_PUBLIC_SITE_URL = https://yourdomain.com
SUPABASE_SERVICE_ROLE_KEY = <rotated-value> (mark as SECRET)
GEMINI_API_KEY = <rotated-value> (mark as SECRET)
VC_ISSUER_JWK = <production-jwk> (mark as SECRET)
...etc
```

4. Set environment: **Production**, **Preview**, **Development**
5. Click **Save**

### For Netlify:

1. Go to **Site settings** → **Environment variables**
2. Click **Add a variable**
3. Add each variable individually
4. Mark sensitive values as **Secret**

### For Railway/Render/Other:

Follow their respective environment variable configuration docs.

---

## ✅ Step 8: Verify Security Fixes

Run this checklist after rotating keys:

```bash
# 1. Check .env.local is gitignored:
git status
# Should NOT show .env.local

# 2. Verify old keys are invalidated:
# - Try using old Supabase key → should fail
# - Try using old Gemini key → should fail

# 3. Test application with new keys:
npm run dev
# - Upload certificate (tests Gemini)
# - Approve certificate (tests Supabase service role)
# - Issue VC (tests VC keys)

# 4. Check for any exposed secrets in code:
grep -r "AIzaSy" src/
grep -r "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" src/
# Should return NO matches in source code
```

---

## 📊 Security Status Summary

### Before Fixes:
- ❌ Supabase Service Role Key exposed in analysis docs
- ❌ Gemini API Key exposed in analysis docs
- ⚠️ Using placeholder VC development keys
- ❌ Production environment not configured

### After Fixes:
- ✅ Supabase Service Role Key rotated
- ✅ Gemini API Key rotated
- ✅ Production VC keys generated
- ✅ `.env.local` confirmed gitignored (was never committed)
- ✅ Production environment variables set
- ✅ No secrets in Git history

---

## 🚀 Next Steps After Security Fixes

1. **Update Analysis Documents** (Optional)
   - Consider removing or redacting keys from:
     - `COMPLETE-CODEBASE-ANALYSIS.md`
     - Any other docs that might contain old keys

2. **Test Everything:**
   - Run through `MANUAL-TESTING-CHECKLIST.md`
   - Verify all certificate operations work
   - Test with new keys

3. **Deploy to Production:**
   - Follow `PRODUCTION-SETUP.md`
   - Use new environment variables
   - Monitor for 24 hours

---

## 🆘 If Something Goes Wrong

### If Application Breaks After Key Rotation:

1. **Check .env.local format:**
   ```bash
   # No spaces around =
   GEMINI_API_KEY=AIzaSy...  # ✅ Correct
   GEMINI_API_KEY = AIzaSy... # ❌ Wrong
   ```

2. **Verify keys are valid:**
   - Test Supabase key in Supabase dashboard
   - Test Gemini key in Google AI Studio

3. **Check console for errors:**
   ```bash
   npm run dev
   # Look for "Invalid API key" or "Unauthorized" errors
   ```

4. **Restart development server:**
   ```bash
   # Stop server (Ctrl+C)
   npm run dev
   # Environment variables are loaded at startup
   ```

---

## 📞 Support Resources

- **Supabase Docs:** https://supabase.com/docs/guides/api/managing-api-keys
- **Google AI Studio:** https://aistudio.google.com/
- **Verifiable Credentials:** https://www.w3.org/TR/vc-data-model/
- **Your Internal Docs:** `PRODUCTION-SETUP.md`, `VC-SETUP-GUIDE.md`

---

**Priority:** 🔴 **HIGH - Complete within 24 hours**

**Estimated Time:** 30-45 minutes

**Status:** Ready to execute

---

*Generated: 2025-10-16*
*Last Updated: After code migration completion*
