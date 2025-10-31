# 🚀 Production Deployment Guide

## Pre-Deployment Checklist

### ✅ Environment Configuration

1. **Update Environment Variables**
   ```bash
   # Update .env.local with production values
   NEXT_PUBLIC_SITE_URL=https://your-domain.com
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GEMINI_API_KEY=your-gemini-key
   VC_ISSUER_JWK=your-production-jwk
   NEXT_PUBLIC_ISSUER_DID=did:web:your-domain.com
   NEXT_PUBLIC_ISSUER_VERIFICATION_METHOD=did:web:your-domain.com#key-id
   ```

2. **Database Migrations**
   - ✅ All 33 migrations applied in order
   - ✅ RLS policies enabled
   - ✅ Indexes created for performance
   - ✅ Backup strategy configured

3. **Build Verification**
   ```bash
   npm run build
   # Ensure no errors
   ```

### 🔒 Security Hardening

1. **API Rate Limiting**
   - ✅ Implemented in `/src/lib/rateLimit.ts`
   - ✅ Applied to all sensitive endpoints
   - ✅ Configured per-endpoint limits

2. **CORS Configuration**
   - ✅ Configure in `next.config.ts` if needed
   - ✅ Restrict to production domain

3. **Security Headers**
   - ✅ HSTS enabled
   - ✅ CSP configured
   - ✅ X-Frame-Options set
   - ✅ All headers in production mode

### 📊 Monitoring Setup

1. **Error Monitoring**
   - ✅ Error tracking implemented (`/src/lib/errorMonitoring.ts`)
   - 🔲 Configure Sentry (optional)
   - 🔲 Set up alert channels

2. **Performance Monitoring**
   - ✅ Performance tracking built-in
   - 🔲 Configure analytics service
   - 🔲 Set up dashboards

3. **Health Checks**
   - ✅ `/api/health` endpoint
   - ✅ `/api/health/detailed` endpoint
   - 🔲 Configure uptime monitoring

### ⚡ Performance Optimization

1. **Caching**
   - ✅ Response caching implemented (`/src/lib/cache.ts`)
   - ✅ Image optimization configured
   - ✅ Static asset caching

2. **CDN Setup** (Optional)
   - 🔲 Configure CloudFlare or similar
   - 🔲 Set cache headers
   - 🔲 Enable compression

### 🗄️ Database Optimization

1. **Indexes**
   ```sql
   -- Ensure these indexes exist
   CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);
   CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(verification_status);
   CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(student_id);
   CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
   ```

2. **Backup Strategy**
   - 🔲 Configure automated backups
   - 🔲 Test restore process
   - 🔲 Set retention policy

## Deployment Steps

### Option 1: Vercel (Recommended)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel --prod

# 4. Set environment variables in Vercel dashboard
# Settings > Environment Variables
```

### Option 2: Docker

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

```bash
# Build and run
docker build -t campussync .
docker run -p 3000:3000 --env-file .env.local campussync
```

### Option 3: PM2 (Node.js Server)

```bash
# 1. Build
npm run build

# 2. Install PM2
npm install -g pm2

# 3. Start with PM2
pm2 start npm --name "campussync" -- start

# 4. Configure auto-restart
pm2 startup
pm2 save
```

## Post-Deployment

### 1. Smoke Tests

```bash
# Test critical endpoints
curl https://your-domain.com/api/health
curl https://your-domain.com/api/health/detailed

# Test authentication
# Test file upload
# Test certificate verification
```

### 2. Monitor Logs

```bash
# Vercel
vercel logs

# PM2
pm2 logs campussync

# Docker
docker logs <container-id>
```

### 3. Performance Testing

```bash
# Load testing with Apache Bench
ab -n 1000 -c 10 https://your-domain.com/

# Or use k6, Artillery, etc.
```

## Troubleshooting

### Common Issues

1. **Build Fails**
   - Check TypeScript errors: `npm run build`
   - Verify environment variables
   - Check node version (20+)

2. **Database Connection**
   - Verify Supabase credentials
   - Check RLS policies
   - Test connection from production

3. **Image Upload Issues**
   - Check storage bucket permissions
   - Verify CORS settings
   - Test file size limits

4. **Performance Issues**
   - Enable caching
   - Check database indexes
   - Monitor slow queries

## Maintenance

### Weekly Tasks
- [ ] Review error logs
- [ ] Check performance metrics
- [ ] Monitor disk usage
- [ ] Review security alerts

### Monthly Tasks
- [ ] Update dependencies
- [ ] Review and optimize database
- [ ] Backup verification
- [ ] Security audit

### Quarterly Tasks
- [ ] Performance audit
- [ ] Cost optimization
- [ ] Feature usage analysis
- [ ] User feedback review

## Rollback Plan

1. **Vercel**
   ```bash
   # Rollback to previous deployment
   vercel rollback
   ```

2. **Docker**
   ```bash
   # Tag previous version
   docker tag campussync:latest campussync:rollback
   # Deploy previous version
   docker run -p 3000:3000 campussync:rollback
   ```

3. **Database**
   ```bash
   # Restore from backup
   # Run in Supabase SQL editor
   ```

## Support

- **Documentation**: `/docs`
- **API Reference**: `/api/docs`
- **GitHub Issues**: [Link to repo]
- **Email**: support@campussync.com

---

**Last Updated**: October 31, 2025
**Version**: 1.0.0
