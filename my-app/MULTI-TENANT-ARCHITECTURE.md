# 🏢 Multi-Tenant Architecture Guide for CampusSync

## 🎯 Overview

This guide explains how to ensure CampusSync works properly for multiple universities/organizations without data mixing or conflicts. Currently, your system has **partial multi-org support** but needs enhancements for true multi-tenancy.

---

## 📊 Current State Analysis

### ✅ What You Have:
1. **University field in profiles** - Users can specify their university
2. **Email domain validation** - Different university domains are supported
3. **Role-based access control (RBAC)** - Admins, faculty, students, recruiters
4. **RLS policies** - Row Level Security on most tables

### ❌ What's Missing:
1. **No organization table** - Universities aren't managed entities
2. **No org isolation in queries** - Cross-university data leakage possible
3. **No org-scoped admins** - Admins can see ALL universities
4. **No org-based RLS** - Policies don't filter by university
5. **No university verification** - Anyone can claim any university

---

## 🏗️ Multi-Tenant Architecture Options

### **Option 1: Shared Database with Org Column (RECOMMENDED)**
Best for: Small to medium scale (< 100 universities)

#### Pros:
- ✅ Simpler to implement
- ✅ Easy data aggregation across orgs
- ✅ Lower infrastructure costs
- ✅ Easier maintenance

#### Cons:
- ❌ Risk of data leakage if queries aren't careful
- ❌ All orgs share same resources
- ❌ Complex RLS policies

---

### **Option 2: Database per Organization**
Best for: Large scale (> 100 universities) or high-security requirements

#### Pros:
- ✅ Complete data isolation
- ✅ Per-org customization
- ✅ Better performance at scale
- ✅ Easier compliance

#### Cons:
- ❌ Complex deployment
- ❌ Higher costs
- ❌ Difficult cross-org analytics
- ❌ Migration complexity

---

## 🚀 Implementation Plan (Option 1 - Recommended)

### Phase 1: Database Schema Changes

#### 1.1 Create Organizations Table

\`\`\`sql
-- Migration: 030_create_organizations.sql

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL UNIQUE, -- e.g., 'stanford.edu'
  type TEXT NOT NULL, -- 'university', 'college', 'institution'
  country TEXT,
  logo_url TEXT,
  website TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}', -- Org-specific settings
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_organizations_domain ON public.organizations(domain);
CREATE INDEX idx_organizations_active ON public.organizations(is_active);

-- Seed with existing universities from profiles
INSERT INTO public.organizations (name, domain, type, is_verified)
SELECT DISTINCT 
  university,
  LOWER(SUBSTRING(email FROM '@(.*)$')) as domain,
  'university',
  false
FROM public.profiles
WHERE university IS NOT NULL
ON CONFLICT (domain) DO NOTHING;
\`\`\`

#### 1.2 Update Profiles Table

\`\`\`sql
-- Migration: 031_add_org_id_to_profiles.sql

-- Add organization_id to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS organization_id UUID 
REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX idx_profiles_organization_id ON public.profiles(organization_id);

-- Populate organization_id from email domain
UPDATE public.profiles p
SET organization_id = o.id
FROM public.organizations o
WHERE LOWER(SUBSTRING(p.email FROM '@(.*)$')) = o.domain;
\`\`\`

#### 1.3 Update Certificates Table

\`\`\`sql
-- Migration: 032_add_org_id_to_certificates.sql

-- Add organization_id to certificates
ALTER TABLE public.certificates 
ADD COLUMN IF NOT EXISTS organization_id UUID 
REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX idx_certificates_organization_id ON public.certificates(organization_id);

-- Populate from student's organization
UPDATE public.certificates c
SET organization_id = p.organization_id
FROM public.profiles p
WHERE c.student_id = p.id;
\`\`\`

#### 1.4 Update User Roles Table

\`\`\`sql
-- Migration: 033_add_org_id_to_user_roles.sql

-- Add organization_id to user_roles
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS organization_id UUID 
REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Add scope column (global admin vs org admin)
ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'organization'; -- 'organization' or 'global'

-- Create indexes
CREATE INDEX idx_user_roles_organization_id ON public.user_roles(organization_id);
CREATE INDEX idx_user_roles_scope ON public.user_roles(scope);

-- Populate from user's organization
UPDATE public.user_roles ur
SET organization_id = p.organization_id
FROM public.profiles p
WHERE ur.user_id = p.id;

-- Super admins can be global scope
UPDATE public.user_roles
SET scope = 'global'
WHERE user_id IN (
  -- List your super admin user IDs here
  'your-super-admin-id'
);
\`\`\`

---

### Phase 2: Update RLS Policies

#### 2.1 Profiles RLS

\`\`\`sql
-- Migration: 034_org_scoped_rls_profiles.sql

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Users can view profiles in their organization
CREATE POLICY "Users can view profiles in their org" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
    OR auth.uid() = id -- Always see own profile
    OR EXISTS ( -- Global admins can see all
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin' 
      AND scope = 'global'
    )
  );

-- Users can update own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Org admins can view all profiles in their org
CREATE POLICY "Org admins can view org profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT ur.organization_id 
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'admin'
      AND ur.scope = 'organization'
    )
  );
\`\`\`

#### 2.2 Certificates RLS

\`\`\`sql
-- Migration: 035_org_scoped_rls_certificates.sql

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;

-- Students can view own certificates
CREATE POLICY "Students can view own certificates" ON public.certificates
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Faculty/Recruiters can view certificates in their org
CREATE POLICY "Faculty can view org certificates" ON public.certificates
  FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('faculty', 'recruiter', 'admin')
    )
  );

-- Global admins can view all
CREATE POLICY "Global admins can view all certificates" ON public.certificates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin' 
      AND scope = 'global'
    )
  );
\`\`\`

#### 2.3 User Roles RLS

\`\`\`sql
-- Migration: 036_org_scoped_rls_user_roles.sql

-- Users can view their own role
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Org admins can manage roles in their org
CREATE POLICY "Org admins can manage org roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT ur.organization_id 
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'admin'
      AND ur.scope = 'organization'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT ur.organization_id 
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'admin'
      AND ur.scope = 'organization'
    )
  );

-- Global admins can manage all roles
CREATE POLICY "Global admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin' 
      AND scope = 'global'
    )
  );
\`\`\`

---

### Phase 3: Update Application Code

#### 3.1 Update Server Utilities

\`\`\`typescript
// lib/supabaseServer.ts

export async function getUserWithOrgContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return { user: null, profile: null, organization: null, role: null };
  }

  // Get user profile with organization
  const { data: profile } = await supabase
    .from('profiles')
    .select(\`
      *,
      organization:organizations(*)
    \`)
    .eq('id', user.id)
    .single();

  // Get user role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role, scope, organization_id')
    .eq('user_id', user.id)
    .single();

  return { 
    user, 
    profile, 
    organization: profile?.organization,
    role: roleData?.role,
    scope: roleData?.scope,
    orgId: profile?.organization_id
  };
}

// Helper to check if user can access resource
export async function canAccessResource(
  userId: string, 
  resourceOrgId: string
): Promise<boolean> {
  const { role, scope, orgId } = await getUserWithOrgContext();
  
  // Global admins can access everything
  if (role === 'admin' && scope === 'global') {
    return true;
  }
  
  // Otherwise, check if resource is in user's org
  return orgId === resourceOrgId;
}
\`\`\`

#### 3.2 Update API Endpoints

\`\`\`typescript
// src/app/api/recruiter/students/route.ts

export async function GET(req: NextRequest) {
  const { user, role, orgId, scope } = await getUserWithOrgContext();
  
  if (!user || !['recruiter', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  
  // Build query with org filter
  let query = supabase
    .from('profiles')
    .select(\`
      *,
      certificates(count),
      organization:organizations(name, domain)
    \`);
  
  // If not global admin, filter by organization
  if (scope !== 'global') {
    query = query.eq('organization_id', orgId);
  }
  
  const { data, error } = await query;
  
  return NextResponse.json({ students: data });
}
\`\`\`

#### 3.3 Update Faculty Endpoints

\`\`\`typescript
// src/app/api/faculty/certificates/route.ts

export async function GET(req: NextRequest) {
  const { user, role, orgId, scope } = await getUserWithOrgContext();
  
  if (!user || role !== 'faculty') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  
  // Faculty can only see certificates in their org
  const { data, error } = await supabase
    .from('certificates')
    .select(\`
      *,
      student:profiles!student_id(full_name, email),
      organization:organizations(name, domain)
    \`)
    .eq('organization_id', orgId) // ORG FILTER
    .order('created_at', { ascending: false });
  
  return NextResponse.json({ certificates: data });
}
\`\`\`

---

### Phase 4: Frontend Updates

#### 4.1 Add Organization Context

\`\`\`typescript
// contexts/OrganizationContext.tsx

import { createContext, useContext, useEffect, useState } from 'react';

interface Organization {
  id: string;
  name: string;
  domain: string;
  logo_url?: string;
}

interface OrganizationContextType {
  organization: Organization | null;
  isGlobalAdmin: boolean;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  isGlobalAdmin: false
});

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  
  useEffect(() => {
    fetchOrganizationContext();
  }, []);
  
  async function fetchOrganizationContext() {
    const res = await fetch('/api/user/context');
    const data = await res.json();
    setOrganization(data.organization);
    setIsGlobalAdmin(data.scope === 'global');
  }
  
  return (
    <OrganizationContext.Provider value={{ organization, isGlobalAdmin }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export const useOrganization = () => useContext(OrganizationContext);
\`\`\`

#### 4.2 Show Organization Info in UI

\`\`\`typescript
// components/Header.tsx

import { useOrganization } from '@/contexts/OrganizationContext';

export function Header() {
  const { organization, isGlobalAdmin } = useOrganization();
  
  return (
    <header>
      <div>CampusSync</div>
      {organization && (
        <div className="org-badge">
          {organization.logo_url && <img src={organization.logo_url} alt="" />}
          <span>{organization.name}</span>
          {isGlobalAdmin && <span className="badge">Global Admin</span>}
        </div>
      )}
    </header>
  );
}
\`\`\`

---

## 🔒 Security Checklist

### ✅ Must-Have Security Measures:

1. **Always filter by organization_id** in queries (unless global admin)
2. **Validate organization ownership** before any mutation
3. **Use RLS policies** as the first line of defense
4. **Verify email domains** match organization
5. **Log cross-org access attempts**
6. **Implement rate limiting** per organization
7. **Separate storage buckets** per org or use org prefixes
8. **Audit trail** for all cross-org actions

---

## 🧪 Testing Multi-Tenancy

### Test Script

\`\`\`javascript
// test-multi-tenant-isolation.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testOrgIsolation() {
  console.log('🧪 Testing Multi-Tenant Isolation\\n');
  
  // Create test users in different orgs
  const org1User = await createTestUser('user1@stanford.edu', 'Stanford University');
  const org2User = await createTestUser('user2@mit.edu', 'MIT');
  
  // Test 1: Org1 user shouldn't see Org2 data
  console.log('Test 1: Cross-org data leakage');
  const org1Certs = await getCertificates(org1User.token);
  const hasCrossOrgData = org1Certs.some(c => c.organization_id !== org1User.orgId);
  assert(!hasCrossOrgData, 'Org1 user should not see Org2 certificates');
  
  // Test 2: Org admin can only manage their org
  console.log('Test 2: Org admin boundaries');
  const canModifyOrg2 = await tryModifyUser(org1User.adminToken, org2User.id);
  assert(!canModifyOrg2, 'Org1 admin should not modify Org2 users');
  
  // Test 3: Global admin can see all
  console.log('Test 3: Global admin access');
  const globalAdminData = await getAllData(globalAdminToken);
  assert(globalAdminData.orgs.length > 1, 'Global admin should see multiple orgs');
  
  console.log('\\n✅ All multi-tenancy tests passed!');
}

testOrgIsolation().catch(console.error);
\`\`\`

---

## 📊 Monitoring & Analytics

### Per-Organization Metrics

\`\`\`sql
-- Get org-specific stats
SELECT 
  o.name as organization,
  COUNT(DISTINCT p.id) as total_users,
  COUNT(DISTINCT c.id) as total_certificates,
  COUNT(DISTINCT c.id) FILTER (WHERE c.verification_status = 'verified') as verified_certs
FROM organizations o
LEFT JOIN profiles p ON p.organization_id = o.id
LEFT JOIN certificates c ON c.organization_id = o.id
WHERE o.is_active = true
GROUP BY o.id, o.name
ORDER BY total_users DESC;
\`\`\`

---

## 🚀 Migration Path

### Step-by-Step Migration

1. **Backup database** ✅
2. **Create organizations table** ✅
3. **Add org_id to existing tables** ✅
4. **Populate org_id from email domains** ✅
5. **Update RLS policies** ✅
6. **Update API endpoints** (one at a time) ✅
7. **Test with multiple test orgs** ✅
8. **Deploy to staging** ✅
9. **Monitor for data leakage** ✅
10. **Deploy to production** ✅

---

## 🎯 Summary

### Current Issues:
- ❌ No organization entity
- ❌ No org-scoped data isolation
- ❌ Cross-university data leakage possible
- ❌ Admins can see all universities

### After Implementation:
- ✅ Organizations as first-class entities
- ✅ Complete data isolation per org
- ✅ Org-scoped admins
- ✅ RLS policies enforce org boundaries
- ✅ Global admins for super-admin tasks
- ✅ Scalable to 1000+ universities

---

## 📝 Next Steps

1. Review this architecture with your team
2. Run the test script to check current state
3. Create migration files (provided above)
4. Test in development environment
5. Deploy incrementally with monitoring

---

## 💡 Additional Considerations

### Storage Isolation
\`\`\`sql
-- Storage policies with org filtering
CREATE POLICY "Users can upload to their org folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'certificates' 
  AND name LIKE (
    SELECT organization_id || '/%' 
    FROM profiles 
    WHERE id = auth.uid()
  )
);
\`\`\`

### Email Verification
\`\`\`typescript
// Verify user belongs to their claimed organization
async function verifyOrganizationEmail(email: string, orgId: string) {
  const domain = email.split('@')[1];
  const org = await getOrganization(orgId);
  return domain === org.domain;
}
\`\`\`

### Cross-Org Features (Optional)
- Public portfolio sharing
- Inter-university collaborations
- Aggregated statistics (anonymized)

---

**Need help implementing this? Let me know which phase you'd like to start with!**
