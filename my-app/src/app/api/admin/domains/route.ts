import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import {
  withRole,
  success,
  apiError,
  error as errorResponse,
  parseAndValidateBody,
  resolveAdminOrg,
  assertSuperAdmin,
  writeAudit,
} from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import {
  validateDomain,
  validateGlobalSuffix,
  findDomainConflict,
  isUniqueViolation,
  listOrgDomains,
  syncOrgDomainSetting,
} from '@/lib/api/utils/domains';

/**
 * Two different lists live behind this route:
 *
 *  - default: the e-mail domains ONE organization claims (table organization_domains,
 *    mirrored into organizations.settings.allowed_email_domains for the signup flow).
 *    Organization admins manage their own organization only.
 *  - `?scope=global`: the platform-wide list of educational suffixes (".edu", "ac.in",
 *    table allowed_domains). It has no organization meaning and is super admin only.
 */
const ADMIN_ROLES = ['admin', 'org_admin', 'super_admin'];

interface AddDomainBody {
  domain: string;
  description?: string;
  is_active?: boolean;
}

function requestedOrg(req: NextRequest): string | null {
  return req.headers.get('X-Organization-ID') || new URL(req.url).searchParams.get('organization_id');
}

function isGlobalScope(req: NextRequest): boolean {
  return new URL(req.url).searchParams.get('scope') === 'global';
}

// GET - an organization's claimed domains, or (scope=global, super admin) the global suffix list
export const GET = withRole(ADMIN_ROLES, async (req, { user }) => {
  const admin = await createSupabaseAdminClient();

  if (isGlobalScope(req)) {
    await assertSuperAdmin(user);
    const { data, error } = await admin
      .from('allowed_domains')
      .select('id, domain, description, is_active, created_at, updated_at')
      .order('domain', { ascending: true });
    if (error) {
      console.error('Error fetching global domains:', error);
      return apiError.internal('Failed to fetch domains');
    }
    return success({ domains: data ?? [] });
  }

  const scope = await resolveAdminOrg(user, requestedOrg(req), 'admin');
  const { rows, error } = await listOrgDomains(admin, scope.organizationId);
  if (error) {
    console.error('Error fetching domains:', error);
    return apiError.internal('Failed to fetch domains');
  }

  return success({
    domains: rows.map((r) => ({ ...r, organization_id: scope.organizationId })),
  });
});

// POST - add a domain to the caller's organization (or, scope=global, to the global list)
export const POST = withRole(ADMIN_ROLES, async (req: NextRequest, { user }) => {
  if (isGlobalScope(req)) return addGlobalDomain(req, user);

  const result = await parseAndValidateBody<AddDomainBody>(req, ['domain']);
  if (result.error) return result.error;

  const check = validateDomain(result.data.domain);
  if (!check.ok) return apiError.badRequest(check.error);

  const scope = await resolveAdminOrg(user, requestedOrg(req), 'admin');
  const organizationId = scope.organizationId;
  const admin = await createSupabaseAdminClient();

  // Anti-squatting: another organization already claims this (or an overlapping, e.g. wildcard)
  // domain. The UNIQUE(domain) constraint cannot see overlaps, so this check stays in the application.
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
  const { data: existing, error: existingError } = await admin
    .from('organization_domains')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('domain', check.domain)
    .limit(1);
  if (existingError) {
    console.error('Error checking domain:', existingError);
    return apiError.internal('Failed to add domain');
  }
  if (existing && existing.length > 0) {
    return errorResponse('Domain already added', 409);
  }

  // The database enforces uniqueness (organization_domains_domain_key)
  const { data, error } = await admin
    .from('organization_domains')
    .insert({ organization_id: organizationId, domain: check.domain, created_by: user.id })
    .select('id, domain, organization_id, created_at')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return errorResponse('This domain is already claimed by another organization', 409);
    }
    console.error('Error adding domain:', error);
    return apiError.internal('Failed to add domain');
  }

  // The signup flow still reads the JSON setting: rewrite it from the table, or undo the insert
  if (!(await syncOrgDomainSetting(admin, organizationId))) {
    const { error: undoError } = await admin.from('organization_domains').delete().eq('id', data.id);
    if (undoError) console.error('Could not undo domain insert:', undoError);
    return apiError.internal('Failed to add domain');
  }

  await writeAudit(admin, {
    actorId: user.id,
    action: 'domain_add',
    targetType: 'organization_domain',
    targetId: data?.id ?? null,
    organizationId,
    details: { domain: check.domain },
  });

  return success(data, 'Domain added successfully', 201);
});

// DELETE - remove a domain from the caller's organization (or, scope=global, from the global list)
export const DELETE = withRole(ADMIN_ROLES, async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain')?.trim().toLowerCase();

  if (isGlobalScope(req)) return removeGlobalDomain(domain, user);

  if (!domain) return apiError.badRequest('Domain is required');

  const scope = await resolveAdminOrg(user, requestedOrg(req), 'admin');
  const organizationId = scope.organizationId;
  const admin = await createSupabaseAdminClient();

  const { data: removed, error } = await admin
    .from('organization_domains')
    .delete()
    .eq('domain', domain)
    .eq('organization_id', organizationId)
    .select('id, domain, organization_id, created_by, created_at');

  if (error) {
    console.error('Error deleting domain:', error);
    return apiError.internal('Failed to remove domain');
  }
  if (!removed || removed.length === 0) return apiError.notFound('Domain not found');

  if (!(await syncOrgDomainSetting(admin, organizationId))) {
    const { error: undoError } = await admin.from('organization_domains').insert(removed);
    if (undoError) console.error('Could not undo domain removal:', undoError);
    return apiError.internal('Failed to remove domain');
  }

  await writeAudit(admin, {
    actorId: user.id,
    action: 'domain_remove',
    targetType: 'organization_domain',
    targetId: removed[0]?.id ?? null,
    organizationId,
    details: { domain },
  });

  return success({ message: 'Domain removed successfully' });
});

// ----------------------------------------------------------------------------- global list (super admin)

async function addGlobalDomain(req: NextRequest, user: User): Promise<Response> {
  await assertSuperAdmin(user);

  const result = await parseAndValidateBody<AddDomainBody>(req, ['domain']);
  if (result.error) return result.error;

  const check = validateGlobalSuffix(result.data.domain);
  if (!check.ok) return apiError.badRequest(check.error);

  const description =
    typeof result.data.description === 'string' ? result.data.description.slice(0, 500) : '';
  const isActive = typeof result.data.is_active === 'boolean' ? result.data.is_active : true;

  const admin = await createSupabaseAdminClient();

  const { data: existing, error: existingError } = await admin
    .from('allowed_domains')
    .select('id')
    .eq('domain', check.domain)
    .limit(1);
  if (existingError) {
    console.error('Error checking global domain:', existingError);
    return apiError.internal('Failed to add domain');
  }
  if (existing && existing.length > 0) return errorResponse('Domain already added', 409);

  const { data, error } = await admin
    .from('allowed_domains')
    .insert({ domain: check.domain, description, is_active: isActive })
    .select('id, domain, description, is_active, created_at, updated_at')
    .single();
  if (error) {
    if (isUniqueViolation(error)) return errorResponse('Domain already added', 409);
    console.error('Error adding global domain:', error);
    return apiError.internal('Failed to add domain');
  }

  await writeAudit(admin, {
    actorId: user.id,
    action: 'global_domain_add',
    targetType: 'allowed_domain',
    targetId: data?.id ?? null,
    details: { domain: check.domain, is_active: isActive },
  });

  return success(data, 'Domain added successfully', 201);
}

async function removeGlobalDomain(domain: string | undefined, user: User): Promise<Response> {
  await assertSuperAdmin(user);
  if (!domain) return apiError.badRequest('Domain is required');

  const admin = await createSupabaseAdminClient();
  const { data: removed, error } = await admin
    .from('allowed_domains')
    .delete()
    .eq('domain', domain)
    .select('id');
  if (error) {
    console.error('Error deleting global domain:', error);
    return apiError.internal('Failed to remove domain');
  }
  if (!removed || removed.length === 0) return apiError.notFound('Domain not found');

  await writeAudit(admin, {
    actorId: user.id,
    action: 'global_domain_remove',
    targetType: 'allowed_domain',
    targetId: removed[0]?.id ?? null,
    details: { domain },
  });

  return success({ message: 'Domain removed successfully' });
}
