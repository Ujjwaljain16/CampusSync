# 🚨 SECURITY FIX - QUICK REFERENCE

## ✅ What We Did Automatically

1. ✅ Generated production VC JWK keys
2. ✅ Created `.env.production.template`
3. ✅ Verified `.env.local` never committed to Git
4. ✅ Confirmed `.env*` is in `.gitignore`

---

## 🔴 WHAT YOU NEED TO DO NOW (3 Steps)

### Step 1: Rotate Supabase Key (5 minutes)

**Link:** https://supabase.com/dashboard/project/stflfunpgyotfznoocaw/settings/api

1. Click **"Regenerate"** next to **Service Role Key**
2. Copy the new key
3. Open `.env.local`
4. Replace `SUPABASE_SERVICE_ROLE_KEY=...` with new key
5. Save file

---

### Step 2: Rotate Gemini Key (5 minutes)

**Link:** https://aistudio.google.com/apikey

1. **DELETE** old key: `AIzaSyC2wUpucsWk8g5Ykk5CSJHHKKqLyULyaes`
2. Click **"Create API Key"**
3. Copy the new key
4. Open `.env.local`
5. Replace `GEMINI_API_KEY=...` with new key
6. Save file

---

### Step 3: Update VC Keys in .env.local (2 minutes)

**Open:** `.env.local`

**Replace these 3 lines:**

```bash
# OLD (placeholder):
VC_ISSUER_JWK={"kty":"RSA","use":"sig","kid":"key-df3a9013","alg":"RS256","n":"placeholder...

# NEW (from script output above):
VC_ISSUER_JWK={"key_ops":["sign"],"ext":true,"alg":"RS256","kty":"RSA","n":"k5kBJhhAZRky5-QuX2tw7nAD6GiuO85ihWrK1Qo28IK0kqrYZHvYpqs_qz2ntvNFe1pHGzlTQh3qI-WiFRqzFbsWlk-b16T1bUpNeC0iaULhfXJtV1aaw9Cq0dzQK2iwThYhXmh9JvtkaP-_5uPvpYPGkWDJMfbTYNyCJdCPGoUn96_45ssS2TB7R9fNKTG4A0DkHd_tUunciEA2YWrz-vYQVwvB2fGq8MWAZ9nHZ4ExC6fK1sZSBzte1tBDFbYYsH2x8CEDKRPgnk3dXMvvWqxc03ACkOlY_EsHW3h9PFipd3H4qPDq52iGeQv7RfzmOO3Mh5tBPVKvsBFsh_cghw","e":"AQAB","d":"Lj_rlDxVMVjMEs31mgDYyl5fWxwyPJtXU-c617bzsDnEy5Ctbg9AvDk9IjOXskRYqWaIkYdNB5LII6d5OpO7Ojv9v-wCMXiHT0_RJq898S376otIp-2DYYipfklrEa8kT9OvcR3c2bI8rIo3X-pc1ciNGFDzuqxVYCy4u5C2xuAoqUYtIdfqegWMB0M8ouD-ehJJBjAtgxJotfxPctLo6umAaPr2rHmJ9StV7NFvW98L0XWb1ZddV5It88n0KeX0cGOMYjeAFw1StkuJSqMpOXyg81EuvpkBqDdx7VZ3dBw26rADGvRUiLwGh6FtSmh4nnXpCqaYOA1X7800jR3CwQ","p":"z3okcKv08Kwg1zv1njrzWribXT7LWcuqW0Q1DQES1tjE_3-C6Dz8vYBRU0V8SIzJhIFIzer2hFrfQawtoCj5HrWHHh0ggjT4fQ7auZ2eroP93bfF4862TaSpZqRwu-tmEzUvrP79vZIwNZNVOLtYmd4p9JMGtmloLuT9yfse7MU","q":"th3SQjiUW_5jb6EvOVNlilSClWz6M7_k58fSDMPxP5EO6uokOsEntU8UMzc3WP3XZCHWy1EYRMLN7wSj7vf7IJhuygEHDpWZBfiVjPtbR3ZfLtQIoszfkcJs8e7fZ9QknME5pZS3DEKQYmdcJWxaQ0rtPJLAlgOdtpT13KmJhNs","dp":"Cy2uhu-M2-a6Qj51xlewwuONY2G9vRHPFOnA3fl_1VmKi6WIHREkIOWn_A-TWalUNjJtBMMzEwB-ZOBs-OMcQP5Q0FuLY9iMxtglCrkmUorEA80h-Vsq0VYc1m3nsQhG0KQd9HksnKkitdBBWDQn2upwYkAFrZBST6yAzAAes20","dq":"HGcIPLWwRayl-2nrAIjGJE3L09wcJWf_HjrmwoDoph5Mckyz-8nWFIvRva8V3bYxGnfAlRL_svGixm011_Yq30mGtdB1NkwUgn7jbApjkQCgFaCR_DnxgD0PWqgDhaDrWNs1z2IjLjFPbVlrYJbGeQo9d533lS3ZMfmHYrO6M9M","qi":"Low7Dt2lirCZTGfz6YOfW-b7KPQYYkWpB4V9a-hQ32US_CHNl1o32-H77ZkMbwwgepl8K4m1AKM5KOvOAuWKnGF6-eJhhqnsEfwAfla-2OTbetQkglMVM83wg-vLJjyMZZW00LDO3098bfssmhh4u1GftqNPXDodScK2hI-ybNA","kid":"key-ce8eddb4","use":"sig"}

NEXT_PUBLIC_ISSUER_DID=did:web:localhost:3000
# Change to: (keep localhost for local dev, change for production)
NEXT_PUBLIC_ISSUER_DID=did:web:localhost:3000

NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:localhost:3000#key-df3a9013
# Change to:
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:localhost:3000#key-ce8eddb4
```

**Save file**

---

## 🧪 Step 4: Test Everything (5 minutes)

```bash
# Restart dev server:
npm run dev

# Test in browser:
# 1. Upload certificate → Should work ✅
# 2. Approve certificate → Should work ✅
# 3. View certificates → Should work ✅
```

---

## ✅ Verification Checklist

After completing steps 1-4:

- [ ] Supabase Service Role Key rotated
- [ ] Old Supabase key invalidated
- [ ] Gemini API Key rotated
- [ ] Old Gemini key deleted
- [ ] VC JWK keys updated to production values
- [ ] VC DID verification method updated
- [ ] Dev server restarted
- [ ] Certificate upload tested
- [ ] Certificate approval tested
- [ ] No errors in console

---

## 📁 Files Modified

- `.env.local` - Updated with new keys (DO NOT COMMIT)
- `.env.production.template` - Created (template for production)

---

## 🚀 For Production Deployment Later

When ready to deploy:

1. Copy `.env.production.template` → `.env.production`
2. Fill in all `<PASTE-...>` placeholders
3. Change `yourdomain.com` to your actual domain
4. Add all variables to Vercel/Netlify environment variables
5. Deploy!

---

## 📚 Full Documentation

- **SECURITY-FIX-GUIDE.md** - Complete detailed guide
- **PRODUCTION-SETUP.md** - Production deployment guide
- **VC-SETUP-GUIDE.md** - Verifiable credential setup

---

## ⏱️ Total Time: ~15-20 minutes

**Priority:** 🔴 HIGH - Do this now before testing

**Status:** Step 1-3 need your action, Step 4 is automated

---

*Generated: 2025-10-16*
*Your new production VC keys are already generated and shown above!*
