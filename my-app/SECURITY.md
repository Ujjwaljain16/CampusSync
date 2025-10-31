# 🔒 Security Best Practices & Guidelines

## Authentication & Authorization

### ✅ Implemented Security Measures

1. **JWT Authentication**
   - Secure token generation with Supabase
   - Refresh token rotation
   - HTTP-only cookies for sensitive data
   - Token expiration (1 hour access, 7 days refresh)

2. **Role-Based Access Control (RBAC)**
   - Four roles: student, faculty, recruiter, admin
   - Route protection via middleware
   - API endpoint authorization
   - Database-level RLS policies

3. **Password Security**
   - Minimum 8 characters required
   - Bcrypt hashing (handled by Supabase)
   - No password storage in frontend
   - Secure password reset flow

### 📋 Security Checklist

- [x] All API routes require authentication
- [x] Sensitive operations require specific roles
- [x] Password complexity enforced
- [x] JWT tokens have expiration
- [x] Refresh tokens are rotated
- [x] Failed login attempts are logged

---

## Data Protection

### Database Security (Supabase)

1. **Row Level Security (RLS)**
   ```sql
   -- Users can only see their own data
   CREATE POLICY "Users see own data" ON certificates
   FOR SELECT USING (auth.uid() = user_id);
   
   -- Faculty can see pending certificates
   CREATE POLICY "Faculty review access" ON certificates
   FOR SELECT USING (
     EXISTS (
       SELECT 1 FROM user_roles 
       WHERE user_id = auth.uid() 
       AND role IN ('faculty', 'admin')
     )
   );
   ```

2. **Service Role Key Protection**
   - ✅ Never exposed to client
   - ✅ Only used in server-side code
   - ✅ Stored in environment variables
   - ✅ Not committed to version control

3. **Data Encryption**
   - ✅ TLS/SSL for all connections
   - ✅ Encrypted at rest (Supabase default)
   - ✅ Sensitive fields can use `pgcrypto`

### File Upload Security

1. **Validation**
   ```typescript
   // File type validation
   const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
   
   // File size limit (10MB)
   const MAX_SIZE = 10 * 1024 * 1024;
   
   // Validate before upload
   if (!ALLOWED_TYPES.includes(file.type)) {
     throw new Error('Invalid file type');
   }
   ```

2. **Storage Security**
   - ✅ Files stored in Supabase Storage
   - ✅ RLS policies on storage buckets
   - ✅ Signed URLs for temporary access
   - ✅ No direct public access to files

---

## API Security

### Rate Limiting

**Implementation**: `/src/lib/rateLimit.ts`

```typescript
// Example usage in API route
import { rateLimitMiddleware, RateLimitPresets } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  
  // Apply rate limit
  const limiter = await rateLimitMiddleware(
    userId || 'anonymous',
    RateLimitPresets.upload
  );
  
  if (!limiter.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': limiter.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': limiter.reset.toString(),
        }
      }
    );
  }
  
  // Process request...
}
```

### Input Validation

```typescript
// Validate all user inputs
import { z } from 'zod';

const certificateSchema = z.object({
  title: z.string().min(3).max(200),
  institution: z.string().min(3).max(200),
  date_issued: z.string().datetime(),
});

// Use in API routes
try {
  const validated = certificateSchema.parse(requestData);
} catch (error) {
  return NextResponse.json(
    { error: 'Validation failed', details: error },
    { status: 400 }
  );
}
```

### CORS Configuration

```typescript
// next.config.ts
async headers() {
  return [
    {
      source: '/api/:path*',
      headers: [
        { 
          key: 'Access-Control-Allow-Origin',
          value: process.env.NEXT_PUBLIC_SITE_URL || '*'
        },
        { 
          key: 'Access-Control-Allow-Methods',
          value: 'GET, POST, PUT, DELETE, OPTIONS'
        },
        { 
          key: 'Access-Control-Allow-Headers',
          value: 'Content-Type, Authorization'
        },
      ],
    },
  ];
}
```

---

## Frontend Security

### XSS Prevention

1. **React's Built-in Protection**
   - ✅ Automatic HTML escaping
   - ✅ No `dangerouslySetInnerHTML` usage
   - ✅ Sanitize user-generated content

2. **Content Security Policy**
   ```typescript
   // next.config.ts headers
   {
     key: 'Content-Security-Policy',
     value: [
       "default-src 'self'",
       "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
       "style-src 'self' 'unsafe-inline'",
       "img-src 'self' data: https:",
       "font-src 'self' data:",
       "connect-src 'self' https://*.supabase.co",
     ].join('; ')
   }
   ```

### CSRF Protection

- ✅ SameSite cookies
- ✅ Origin validation
- ✅ Custom headers for state-changing operations

---

## Secrets Management

### Environment Variables

```bash
# ❌ NEVER commit these files
.env
.env.local
.env.production

# ✅ Use .env.example as template
.env.example

# ✅ Use proper naming
NEXT_PUBLIC_*    # Client-side (safe to expose)
SECRET_*         # Server-only (keep private)
```

### Production Secrets

1. **Rotation Policy**
   - Rotate API keys quarterly
   - Rotate JWT signing keys annually
   - Update after team changes

2. **Storage**
   - Use Vercel Environment Variables
   - Use AWS Secrets Manager
   - Use HashiCorp Vault
   - Never hardcode secrets

---

## Monitoring & Logging

### Error Tracking

**Implementation**: `/src/lib/errorMonitoring.ts`

```typescript
import { errorMonitoring } from '@/lib/errorMonitoring';

// Track errors
try {
  await riskyOperation();
} catch (error) {
  errorMonitoring.logError({
    severity: 'high',
    message: error.message,
    stack: error.stack,
    context: { operation: 'riskyOperation' },
    userId: user?.id,
  });
}
```

### Audit Logging

All critical actions are logged:
- User authentication
- Role changes
- Certificate approvals/rejections
- Data exports
- Admin actions

```sql
-- audit_logs table structure
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Third-Party Security

### API Keys

1. **Google Gemini API**
   - ✅ Restrict API key to backend only
   - ✅ Set usage limits
   - ✅ Monitor usage patterns

2. **Supabase**
   - ✅ Use anon key for client
   - ✅ Protect service role key
   - ✅ Configure RLS policies

### Dependencies

```bash
# Regular security audits
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update

# Check outdated packages
npm outdated
```

---

## Compliance

### GDPR Compliance

1. **Data Rights**
   - ✅ User can view their data
   - ✅ User can export their data
   - ✅ User can delete their account
   - ✅ Clear privacy policy

2. **Consent**
   - ✅ Cookie consent banner
   - ✅ Terms of service acceptance
   - ✅ Data processing agreement

### FERPA Compliance (Educational Records)

1. **Student Privacy**
   - ✅ Student data isolated by default
   - ✅ Faculty can only see assigned records
   - ✅ Audit trail of all access

2. **Data Minimization**
   - ✅ Collect only necessary data
   - ✅ Delete old records per policy
   - ✅ Anonymize analytics data

---

## Incident Response

### Security Incident Checklist

1. **Detection**
   - Monitor error rates
   - Check unusual access patterns
   - Review failed auth attempts

2. **Response**
   - [ ] Identify the breach
   - [ ] Contain the damage
   - [ ] Assess the impact
   - [ ] Notify affected users
   - [ ] Document the incident

3. **Recovery**
   - [ ] Patch the vulnerability
   - [ ] Restore from backup if needed
   - [ ] Update security measures
   - [ ] Conduct post-mortem

### Emergency Contacts

```
Security Lead: security@campussync.com
DevOps Team: devops@campussync.com
Emergency Hotline: [Phone Number]
```

---

## Regular Security Tasks

### Daily
- [ ] Review error logs
- [ ] Monitor failed login attempts
- [ ] Check API rate limit violations

### Weekly
- [ ] Review audit logs
- [ ] Check for suspicious activity
- [ ] Update security patches

### Monthly
- [ ] Security audit
- [ ] Dependency updates
- [ ] Access review
- [ ] Backup verification

### Quarterly
- [ ] Penetration testing
- [ ] Security training
- [ ] Policy review
- [ ] Key rotation

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Last Updated**: October 31, 2025
**Security Officer**: [Your Name]
