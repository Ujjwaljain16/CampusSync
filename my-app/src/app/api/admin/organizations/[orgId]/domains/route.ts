import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { withSession, authorizeOrg, apiError, error as errorResponse, writeAudit } from '@/lib/api';
import { validateDomain, findDomainConflict, isUniqueViolation, listOrgDomains } from '@/lib/api/utils/domains';

/**
 * GET /api/admin/organizations/[orgId]/domains
 * Get allowed email domains for an organization
 *
 * PUT /api/admin/organizations/[orgId]/domains
 * Replace the allowed email domains of an organization
 *
 * Caller must be admin/org_admin OF THIS organization (or super_admin).
 *
 * GET reads the organization_domains table. PUT writes the JSON setting
 * organizations.settings.allowed_email_domains (what the signup flow reads); a database
 * trigger mirrors it into organization_domains and raises unique_violation (23505) when
 * another organization already claims one of the domains, which is answered with a 409.
 */

const MAX_DOMAINS = 50;

export const GET = withSession<{ orgId: string }>(async (_request, { user, params }) => {
  const { orgId } = params;
  await authorizeOrg(user, { orgId, minRole: 'admin' });

  const admin = await createSupabaseAdminClient();
  const { data: org, error } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching domains:', error);
    return apiError.internal('Failed to fetch domains');
  }
  if (!org) return apiError.notFound('Organization not found');

  const { rows, error: domainsError } = await listOrgDomains(admin, orgId);
  if (domainsError) {
    console.error('Error fetching domains:', domainsError);
    return apiError.internal('Failed to fetch domains');
  }
  const allowedDomains = rows.map((r) => r.domain);

  return NextResponse.json({
    organizationId: org.id,
    organizationName: org.name,
    allowedDomains,
  });
});

export const PUT = withSession<{ orgId: string }>(async (request, { user, params }) => {
  const { orgId } = params;
  await authorizeOrg(user, { orgId, minRole: 'admin' });

  let body: { domains?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { domains } = body;

  if (!Array.isArray(domains)) return apiError.badRequest('domains must be an array');
  if (domains.length > MAX_DOMAINS) return apiError.badRequest(`At most ${MAX_DOMAINS} domains are allowed`);

  // Validate + normalize (lowercase, RFC-ish, no public mail providers, wildcard only as "*.suffix")
  const normalized: string[] = [];
  const invalid: Array<{ domain: unknown; error: string }> = [];
  for (const d of domains) {
    const check = validateDomain(d);
    if (check.ok) {
      if (!normalized.includes(check.domain)) normalized.push(check.domain);
    } else {
      invalid.push({ domain: typeof d === 'string' ? d.slice(0, 80) : String(d), error: check.error });
    }
  }
  if (invalid.length > 0) {
    return apiError.badRequest('Invalid domain format', { invalidDomains: invalid });
  }

  const admin = await createSupabaseAdminClient();

  // Anti-squatting incl. wildcard overlaps (the UNIQUE(domain) constraint only catches exact duplicates)
  let conflict;
  try {
    conflict = await findDomainConflict(admin, orgId, normalized);
  } catch (err) {
    console.error('Domain conflict check failed:', err);
    return apiError.internal('Failed to validate domains');
  }
  if (conflict) {
    return errorResponse('A domain is already claimed by another organization', 409, { domain: conflict.domain });
  }

  const { data: org, error: fetchError } = await admin
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();
  if (fetchError) {
    console.error('Error loading organization:', fetchError);
    return apiError.internal('Failed to update domains');
  }
  if (!org) return apiError.notFound('Organization not found');

  // Merge: only allowed_email_domains changes, the rest of settings is kept
  const updatedSettings = {
    ...((org.settings as Record<string, unknown> | null) ?? {}),
    allowed_email_domains: normalized,
  };

  const { error: updateError } = await admin
    .from('organizations')
    .update({ settings: updatedSettings })
    .eq('id', orgId);
  if (updateError) {
    if (isUniqueViolation(updateError)) {
      return errorResponse('A domain is already claimed by another organization', 409);
    }
    console.error('Error updating domains:', updateError);
    return apiError.internal('Failed to update domains');
  }

  await writeAudit(admin, {
    actorId: user.id,
    action: 'org_domains_update',
    targetType: 'organization',
    targetId: orgId,
    organizationId: orgId,
    details: { domains: normalized },
  });

  return NextResponse.json({
    success: true,
    organizationId: orgId,
    allowedDomains: normalized,
  });
});
