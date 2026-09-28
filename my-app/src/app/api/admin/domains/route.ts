import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody, getOrganizationContext, getTargetOrganizationIds, isRecruiterContext } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// Allowed email domains control who can sign up into an organization: admins only
const ADMIN_ROLES = ['admin', 'org_admin', 'super_admin'];

interface AddDomainBody {
  domain: string;
  description?: string;
}

// GET - Fetch allowed domains (for user's organization)
export const GET = withRole(ADMIN_ROLES, async (_req, { user }) => {
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const { data: domains, error } = await supabase
    .from('allowed_domains')
    .select('*')
    .in('organization_id', targetOrgIds) // Multi-org filter
    .order('domain', { ascending: true });

  if (error) {
    console.error('Error fetching domains:', error);
    throw apiError.internal(error.message);
  }

  return success({ domains });
});

// POST - Add new domain (to user's organization)
export const POST = withRole(ADMIN_ROLES, async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<AddDomainBody>(req, ['domain']);
  if (result.error) return result.error;

  const { domain, description } = result.data;
  if (typeof domain !== 'string' || !/^([*][.])?([a-z0-9-]+[.])+[a-z]{2,}$/i.test(domain.trim())) {
    throw apiError.badRequest('Invalid domain');
  }
  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);

  // Get organization ID - for recruiters use first accessible org or selected org
  const organizationId = isRecruiterContext(orgContext)
    ? (orgContext.selectedOrganization || orgContext.accessibleOrganizations[0])
    : orgContext.organizationId;

  if (!organizationId) {
    throw apiError.badRequest('No organization context available');
  }

  const { data, error } = await supabase
    .from('allowed_domains')
    .insert({
      domain: domain.toLowerCase().trim(),
      description: description || '',
      organization_id: organizationId, // Multi-org field
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding domain:', error);
    throw apiError.internal(error.message);
  }

  return success(data, 'Domain added successfully', 201);
});

// DELETE - Remove domain (from user's organization)
export const DELETE = withRole(ADMIN_ROLES, async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');

  if (!domain) {
    throw apiError.badRequest('Domain is required');
  }

  const supabase = await createSupabaseServerClient();
  const orgContext = await getOrganizationContext(user);
  const targetOrgIds = getTargetOrganizationIds(orgContext);

  const { error } = await supabase
    .from('allowed_domains')
    .delete()
    .eq('domain', domain)
    .in('organization_id', targetOrgIds); // Multi-org filter

  if (error) {
    console.error('Error deleting domain:', error);
    throw apiError.internal(error.message);
  }

  return success({ message: 'Domain removed successfully' });
});



