# 🎯 Multi-Tenancy Quick Start Guide

## 📊 Current Status (Diagnosis Results)

### ✅ Good News:
- **Organizations table exists** - Basic infrastructure is ready
- **No data leakage detected** - Current system is safe
- **Single university** - You have time to plan before scaling

### ⚠️ Needs Attention:
- **No organization_id columns** - Foreign keys not added yet
- **No org-scoped RLS** - All users can potentially see all data
- **No org-based filtering** - API endpoints don't filter by university

---

## 🚀 Quick Implementation (30 Minutes)

### Step 1: Add Organization Foreign Keys (5 min)

```bash
# Run these migrations in order
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addOrgColumns() {
  console.log('Adding organization_id columns...');
  
  // SQL to add columns
  const sql = \`
    -- Add to profiles
    ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS organization_id UUID;
    
    -- Add to certificates  
    ALTER TABLE public.certificates 
    ADD COLUMN IF NOT EXISTS organization_id UUID;
    
    -- Add to user_roles
    ALTER TABLE public.user_roles 
    ADD COLUMN IF NOT EXISTS organization_id UUID;
    
    -- Add indexes
    CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
    CREATE INDEX IF NOT EXISTS idx_certificates_org ON public.certificates(organization_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_org ON public.user_roles(organization_id);
  \`;
  
  console.log('Done! Run: node diagnose-multi-tenancy.js to verify');
}

addOrgColumns();
"
```

**Or manually in Supabase Dashboard:**
1. Go to SQL Editor
2. Paste the SQL from above
3. Click "Run"

### Step 2: Add Org Helper Function (5 min)

Create `lib/orgContext.ts`:

```typescript
import { createSupabaseServerClient } from './supabaseServer';

export async function getUserOrgContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, university')
    .eq('id', user.id)
    .single();
  
  return {
    userId: user.id,
    orgId: profile?.organization_id,
    orgName: profile?.university
  };
}
```

### Step 3: Update One API Endpoint as Example (5 min)

Update `src/app/api/student/dashboard/route.ts`:

```typescript
import { getUserOrgContext } from '@/lib/orgContext';

export async function GET(req: NextRequest) {
  const orgContext = await getUserOrgContext();
  
  if (!orgContext) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const supabase = await createSupabaseServerClient();
  
  // Get certificates - filtered by org
  let query = supabase
    .from('certificates')
    .select('*')
    .eq('student_id', orgContext.userId);
  
  // If org filtering is enabled and user has an org
  if (orgContext.orgId) {
    query = query.eq('organization_id', orgContext.orgId);
  }
  
  const { data, error } = await query;
  
  return NextResponse.json({ certificates: data });
}
```

### Step 4: Test It (5 min)

```bash
# Create test users in different orgs
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testMultiOrg() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  // Create test org 1
  const { data: org1 } = await supabase
    .from('organizations')
    .insert({ name: 'Test University 1', domain: 'test1.edu', type: 'university' })
    .select()
    .single();
  
  // Create test org 2
  const { data: org2 } = await supabase
    .from('organizations')
    .insert({ name: 'Test University 2', domain: 'test2.edu', type: 'university' })
    .select()
    .single();
  
  console.log('Created test orgs:', org1?.name, org2?.name);
  
  // Update profiles with org IDs
  // ... add more test code as needed
}

testMultiOrg();
"
```

### Step 5: Apply to All Endpoints (10 min)

Use the pattern from Step 3 for:
- ✅ `/api/student/*` - Filter by user's org
- ✅ `/api/faculty/*` - Filter by faculty's org
- ✅ `/api/recruiter/*` - Filter by recruiter's org
- ✅ `/api/admin/*` - Show all (or filter by selected org)

---

## 🔍 How to Know It's Working

### Test 1: Create Users in Different Orgs
```javascript
// User A from Stanford
email: 'usera@stanford.edu'
university: 'Stanford University'

// User B from MIT
email: 'userb@mit.edu'
university: 'MIT'
```

### Test 2: Verify Data Isolation
1. Login as User A
2. Upload a certificate
3. Logout, login as User B
4. Check if User B can see User A's certificate
5. **Expected:** User B should NOT see User A's data

### Test 3: Check Recruiter Filtering
1. Create recruiter in Org 1
2. Create students in Org 1 and Org 2
3. Login as Org 1 recruiter
4. **Expected:** Should only see Org 1 students

---

## 🚨 Common Pitfalls to Avoid

### ❌ DON'T:
1. **Forget to filter by org_id** in queries
   ```typescript
   // BAD - Shows all certificates
   const { data } = await supabase.from('certificates').select('*');
   ```

2. **Trust frontend filtering only**
   - Always filter in backend/RLS

3. **Allow cross-org admin actions**
   ```typescript
   // BAD - Admin can modify any user
   const { error } = await supabase
     .from('user_roles')
     .update({ role: 'admin' })
     .eq('user_id', targetUserId);
   ```

4. **Skip email domain validation**
   - Always verify email domain matches organization

### ✅ DO:
1. **Always filter by organization**
   ```typescript
   // GOOD
   const { data } = await supabase
     .from('certificates')
     .select('*')
     .eq('organization_id', userOrgId);
   ```

2. **Use RLS as primary defense**
   ```sql
   CREATE POLICY "Users see own org data" ON certificates
     FOR SELECT USING (
       organization_id = (
         SELECT organization_id 
         FROM profiles 
         WHERE id = auth.uid()
       )
     );
   ```

3. **Validate organization ownership**
   ```typescript
   // Check user belongs to org before any mutation
   const canAccess = await checkOrgAccess(userId, resourceOrgId);
   if (!canAccess) return unauthorized();
   ```

4. **Log cross-org access attempts**
   ```typescript
   if (resourceOrgId !== userOrgId) {
     await logSecurityEvent('cross_org_access_attempt', { userId, resourceOrgId });
   }
   ```

---

## 📋 Checklist Before Going Live

- [ ] Organizations table populated
- [ ] All main tables have organization_id
- [ ] RLS policies filter by organization
- [ ] All API endpoints filter by org
- [ ] Email domains validated against orgs
- [ ] Cross-org access tested and blocked
- [ ] Admin dashboard shows org context
- [ ] Storage buckets use org prefixing
- [ ] Audit logs track org context
- [ ] Monitoring alerts for cross-org access

---

## 🎓 When to Implement Full Multi-Tenancy

### Implement NOW if:
- ✅ You have 2+ universities signing up
- ✅ Users from different orgs are registering
- ✅ You're demoing to multiple institutions
- ✅ Planning to launch to multiple schools

### Can Wait if:
- ⏸️ Single university pilot only
- ⏸️ Closed beta with one institution
- ⏸️ POC/MVP stage
- ⏸️ < 50 total users

### Your Situation:
**Current:** 1 university domain, ~2 users
**Recommendation:** 🟡 **Prepare now, implement before next university**

Start with Steps 1-3 now (30 min), then roll out org filtering as you onboard new universities.

---

## 🆘 Need Help?

### Quick Fixes:

**Issue: Users seeing other org's data**
```typescript
// Add to every query:
.eq('organization_id', userOrgId)
```

**Issue: Admin can't switch between orgs**
```typescript
// Add org selector in admin UI
const selectedOrgId = useOrgSelector();
```

**Issue: New users don't get org assigned**
```typescript
// In signup flow:
const domain = email.split('@')[1];
const org = await getOrgByDomain(domain);
await assignUserToOrg(userId, org.id);
```

---

## 📚 Full Documentation

For complete implementation details, see:
- **MULTI-TENANT-ARCHITECTURE.md** - Complete guide
- **DATABASE_SCHEMA.md** - Current schema
- Run `node diagnose-multi-tenancy.js` - Current state

---

**Start with 30-minute quick implementation above, then gradually apply to all endpoints! 🚀**
