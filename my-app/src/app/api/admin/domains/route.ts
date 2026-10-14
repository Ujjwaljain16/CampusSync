import { NextRequest } from 'next/server';
import {
  withRole,
  success,
  apiError,
  error as errorResponse,
  parseAndValidateBody,
  resolveAdminOrg,
  writeAudit,
} from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { validateDomain, findDomainConflict } from '@/lib/api/utils/domains';

// Allowed e-mail domains control who can sign up into an organization: admins only
const ADMIN_ROLES = ['admin', 'org_admin', 'super_admin'];

interface AddDomainBody {
  domain: string;
  description?: string;
}

function requestedOrg(req: NextRequest): string | null {
  return req.headers.get('X-Organization-ID') || new URL(req.url).searchParams.get('organization_id');
}

// GET - Fetch allowed domains of ONE organization the caller administers
export const GET = withRole(ADMIN_ROLES, async (req, { user }) => {
  const scope = await resolveAdminOrg(user, requestedOrg(req), 'admin');
  const admin = await createSupabaseAdminClient();

  const { data: domains, error } = await admin
    .from('allowed_domains')
    .select('id, domain, description, organization_id, created_at')
    .eq('organization_id', scope.organizationId)
    .order('domain', { ascending: true });

  if (error) {
    console.error('Error fetching domains:', error);
    return apiError.internal('Failed to fetch domains');
  }

  return success({ domains });
});

// POST - Add a new domain to the caller's organization
export const POST = withRole(ADMIN_ROLES, async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<AddDomainBody>(req, ['domain']);
  if (result.error) return result.error;

  const check = validateDomain(result.data.domain);
  if (!check.ok) return apiError.badRequest(check.error);

  const description =
    typeof result.data.description === 'string' ? result.data.description.slice(0, 500) : '';

  const scope = await resolveAdminOrg(user, requestedOrg(req), 'admin');
  const organizationId = scope.organizationId;
  const admin = await createSupabaseAdminClient();

  // Anti-squatting: another organization already claims this (or an overlapping) domain
  let conflict;
  try {
    conflict = await findDomainConflict(admin, organizationId, [check.domain]);
  } catch (err) {
    console.error('Domain conflict check failed:', err);
    return apiError.internal('Failed to validate domain');
  }
  if (conflict) {
    return errorResponse('This domain is already claimed by another organization', 409);
  }

  // Already present in this organization?
  const { data: existing } = await admin
    .from('allowed_domains')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('domain', check.domain)
    .limit(1);
  if (existing && existing.length > 0) {
    return errorResponse('Domain already added', 409);
  }

  const { data, error } = await admin
    .from('allowed_domains')
    .insert({
      domain: check.domain,
      description,
      organization_id: organizationId,
      created_at: new Date().toISOString(),
    })
    .select('id, domain, description, organization_id, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return errorResponse('This domain is already claimed', 409);
    console.error('Error adding domain:', error);
    return apiError.internal('Failed to add domain');
  }

  await writeAudit(admin, {
    actorId: user.id,
    action: 'domain_add',
    targetType: 'allowed_domain',
    targetId: data?.id ?? null,
    organizationId,
    details: { domain: check.domain },
  });

  return success(data, 'Domain added successfully', 201);
});

// DELETE - Remove a domain from the caller's organization
export const DELETE = withRole(ADMIN_ROLES, async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain')?.trim().toLowerCase();

  if (!domain) return apiError.badRequest('Domain is required');

  const scope = await resolveAdminOrg(user, requestedOrg(req), 'admin');
  const admin = await createSupabaseAdminClient();

  const { data: removed, error } = await admin
    .from('allowed_domains')
    .delete()
    .eq('domain', domain)
    .eq('organization_id', scope.organizationId)
    .select('id');

  if (error) {
    console.error('Error deleting domain:', error);
    return apiError.internal('Failed to remove domain');
  }
  if (!removed || removed.length === 0) return apiError.notFound('Domain not found');

  await writeAudit(admin, {
    actorId: user.id,
    action: 'domain_remove',
    targetType: 'allowed_domain',
    organizationId: scope.organizationId,
    details: { domain },
  });

  return success({ message: 'Domain removed successfully' });
});
