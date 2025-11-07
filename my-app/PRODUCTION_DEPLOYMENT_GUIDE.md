# 🚀 CampusSync Production Deployment Guide

**Quick Start for Production Deployment**  
**Target Platform**: Vercel (Recommended) or any Node.js hosting

---

## 📋 Pre-Deployment Checklist (30 mins)

### 1. Environment Variables Setup ✅

**Copy and configure**:
```bash
cp .env.example .env.local
```

**Fill in these REQUIRED values**:
```env
# Get from Supabase Dashboard
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Your production domain
NEXT_PUBLIC_SITE_URL=https://campussync.yourdomain.com
NEXT_PUBLIC_BASE_URL=https://campussync.yourdomain.com

# Generate Ed25519 key pair (see below)
VC_ISSUER_JWK={"kty":"OKP","crv":"Ed25519",...}
NEXT_PUBLIC_ISSUER_DID=did:web:campussync.yourdomain.com
NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:campussync.yourdomain.com#key-1

# Get from Google AI Studio
GEMINI_API_KEY=AIza...
```

### 2. Generate Production Keys 🔐

**Ed25519 Key Pair Generation**:
```bash
# Install dependencies (if not already)
npm install

# Generate key pair
node -e "
const crypto = require('crypto');
crypto.generateKeyPair('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
  publicKeyEncoding: { type: 'spki', format: 'jwk' }
}, (err, privateKey, publicKey) => {
  if (err) throw err;
  console.log('\\n=== PRIVATE KEY (Keep Secret!) ===');
  console.log(JSON.stringify(privateKey));
  console.log('\\n=== PUBLIC KEY ===');
  console.log(JSON.stringify(publicKey));
  console.log('\\n⚠️  Store PRIVATE KEY in VC_ISSUER_JWK env var');
  console.log('⚠️  NEVER commit this to git!\\n');
});
"
```

**Copy the output to your `.env.local`**:
```env
VC_ISSUER_JWK={"kty":"OKP","crv":"Ed25519","d":"...","x":"..."}
```

### 3. Database Setup (Supabase) 🗄️

**Option A: Supabase Dashboard** (Recommended)
1. Go to https://app.supabase.com/projects
2. Select your project → SQL Editor
3. Run migrations from `supabase-migrations/` folder in order:
   - `001-initial-schema.sql`
   - `002-rls-policies.sql`
   - ... (all files up to `051-rls-edge-cases.sql`)

**Option B: Supabase CLI**
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

**Verify Database**:
```bash
# Check tables created
# Supabase Dashboard → Database → Tables
# Should see 17 active tables
```

### 4. Create Super Admin Account 👑

```bash
# After database setup
npm run admin:setup

# Follow prompts:
# - Email: admin@yourdomain.com
# - Password: [strong password]
# - Name: System Administrator
```

### 5. Test Local Build ✅

```bash
# Clean build
rm -rf .next
npm run build

# Should see:
# ✓ Compiled successfully
# ✓ Creating an optimized production build
# ✓ Collecting page data
# ✓ Generating static pages (X/X)
# ✓ Finalizing page optimization
```

**Expected Output**:
```
Route (app)                              Size     First Load JS
┌ ○ /                                    XXX kB        XXX kB
├ ○ /admin                               XXX kB        XXX kB
├ ○ /dashboard                           XXX kB        XXX kB
└ ...
```

**Check for warnings**:
- ❌ No TypeScript errors
- ❌ No ESLint errors
- ✅ Bundle size < 500KB (First Load JS)

### 6. Test Production Build Locally 🧪

```bash
# Start production server
npm start

# In another terminal, test critical endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/

# Should return 200 OK
```

---

## 🌐 Deploy to Vercel (15 mins)

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Login to Vercel
```bash
vercel login
```

### Step 3: Deploy
```bash
# From project root (my-app directory)
cd my-app
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? [Your account]
# - Link to existing project? No
# - Project name? campussync
# - Directory? ./
# - Override settings? No
```

### Step 4: Configure Environment Variables

**In Vercel Dashboard**:
1. Go to your project → Settings → Environment Variables
2. Add ALL variables from `.env.local`
3. **IMPORTANT**: Select "Production", "Preview", and "Development" for each

**Quick Add Script** (optional):
```bash
# Add all env vars at once
vercel env pull .env.production
# Edit .env.production with your values
vercel env add < .env.production
```

### Step 5: Production Deployment
```bash
# Deploy to production
vercel --prod

# You'll get a URL like:
# https://campussync-xxxx.vercel.app
```

### Step 6: Custom Domain (Optional)
```bash
# Add your custom domain
vercel domains add campussync.yourdomain.com

# Follow DNS configuration instructions
```

---

## 🔍 Post-Deployment Verification (10 mins)

### Health Checks
```bash
# Replace with your production URL
PROD_URL="https://campussync-xxxx.vercel.app"

# 1. Health endpoint
curl $PROD_URL/api/health
# Expected: {"status":"healthy","timestamp":"..."}

# 2. Home page
curl $PROD_URL/
# Expected: 200 OK

# 3. Login page
curl $PROD_URL/login
# Expected: 200 OK

# 4. API authentication (should fail without auth)
curl $PROD_URL/api/certificates/student/123
# Expected: 401 Unauthorized
```

### Manual Testing
1. ✅ Open production URL in browser
2. ✅ Login with super admin account
3. ✅ Create a test organization
4. ✅ Invite a faculty member
5. ✅ Upload a test certificate (as student)
6. ✅ Approve certificate (as faculty)
7. ✅ Verify certificate (as recruiter)

### Performance Check
```bash
# Run Lighthouse audit
npx lighthouse $PROD_URL --view

# Target scores:
# Performance: 90+
# Accessibility: 95+
# Best Practices: 95+
# SEO: 90+
```

---

## 📊 Monitoring Setup (15 mins)

### 1. Vercel Analytics (Auto-Enabled)
- Go to Vercel Dashboard → Your Project → Analytics
- View traffic, performance, errors

### 2. Supabase Monitoring
- Go to Supabase Dashboard → Database → Performance
- Monitor query times, connections

### 3. Error Monitoring (Recommended: Sentry)

**Install Sentry**:
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

**Configure** (`.env.local`):
```env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
ENABLE_MONITORING=true
```

**Update `lib/logger.ts`**:
```typescript
import * as Sentry from '@sentry/nextjs';

private sendToMonitoring(level, message, error, context) {
  if (process.env.ENABLE_MONITORING === 'true') {
    Sentry.captureException(error || new Error(message), {
      level: level as SeverityLevel,
      contexts: { custom: context }
    });
  }
}
```

---

## 🔐 Security Hardening (Post-Launch)

### 1. Enable Rate Limiting

**Install Upstash Redis**:
```bash
npm install @upstash/redis @upstash/ratelimit
```

**Configure** (`.env.local`):
```env
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

**Update middleware** (`src/middleware.ts`):
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  analytics: true,
});

export async function middleware(req: NextRequest) {
  // Rate limit check
  const ip = req.ip ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }
  
  // ... existing middleware logic
}
```

### 2. Database Backups

**Supabase Dashboard**:
1. Project Settings → Backup
2. Enable Daily Backups
3. Enable Point-in-Time Recovery
4. Test restore procedure monthly

### 3. SSL/TLS Certificate

**Vercel** (Auto-Configured):
- Automatic HTTPS with Let's Encrypt
- TLS 1.3 enabled
- HSTS header configured

**Custom Domain**:
- Add domain in Vercel
- Configure DNS (CNAME or A record)
- Certificate auto-provisions in ~5 minutes

---

## 🚨 Incident Response Plan

### Rollback Procedure
```bash
# List recent deployments
vercel list

# Rollback to previous version
vercel rollback [deployment-url]
```

### Emergency Contacts
- **Database Issues**: Supabase Support (support@supabase.io)
- **Hosting Issues**: Vercel Support (support@vercel.com)
- **Developer**: [Your contact info]

### Common Issues & Fixes

**Issue 1: Environment Variable Not Working**
```bash
# Re-deploy after env change
vercel env pull
vercel --prod
```

**Issue 2: Database Connection Error**
```bash
# Check Supabase dashboard for outages
# Verify SUPABASE_SERVICE_ROLE_KEY is correct
# Check database connection limit (default: 500)
```

**Issue 3: Slow API Response**
```bash
# Check Vercel function logs
vercel logs --follow

# Check Supabase query performance
# Dashboard → Database → Query Performance
```

---

## 📈 Scaling Recommendations

### Initial Launch (0-1000 users)
- ✅ Vercel Pro Plan ($20/month)
- ✅ Supabase Free Plan
- ✅ No additional infrastructure

### Growth Phase (1000-10000 users)
- ✅ Vercel Pro Plan
- ✅ Supabase Pro Plan ($25/month)
- ✅ Upstash Redis for rate limiting ($10/month)
- ✅ Sentry error tracking (free tier)

### Scale Phase (10000+ users)
- ✅ Vercel Enterprise
- ✅ Supabase Team/Enterprise
- ✅ CDN for static assets (Cloudflare)
- ✅ Database read replicas
- ✅ Multi-region deployment

---

## ✅ Launch Checklist

### Pre-Launch
- [ ] All environment variables configured
- [ ] Production database migrations applied
- [ ] Super admin account created
- [ ] Production build successful (`npm run build`)
- [ ] Local production test passed (`npm start`)
- [ ] Security headers verified
- [ ] SSL certificate active

### Launch Day
- [ ] Deploy to Vercel (`vercel --prod`)
- [ ] Verify all endpoints working
- [ ] Run Lighthouse audit (score 90+)
- [ ] Test critical user flows
- [ ] Monitor error logs (first 24 hours)
- [ ] Verify email notifications working

### Post-Launch (Week 1)
- [ ] Set up error monitoring (Sentry)
- [ ] Enable rate limiting
- [ ] Configure database backups
- [ ] Test backup restore procedure
- [ ] Optimize slow queries (if any)
- [ ] Gather user feedback
- [ ] Performance optimization (if needed)

---

## 📞 Support & Resources

### Documentation
- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Vercel Docs](https://vercel.com/docs)

### Community
- [GitHub Issues](https://github.com/ujjwaljain16/campussync/issues)
- [Discord Community](#) (if available)

### Professional Support
- **Developer**: Ujjwal Jain
- **Email**: ujjwaljain16@gmail.com
- **GitHub**: [@ujjwaljain16](https://github.com/ujjwaljain16)

---

**Estimated Total Deployment Time**: 1-2 hours  
**Next Steps**: Follow this guide sequentially, section by section.

**Good luck with your launch! 🚀**
