import { NextRequest } from 'next/server';
import { withAuth, withSuperAdmin, success, apiError, isValidEmail, fetchApprovedRoleRows, writeAudit } from '@/lib/api';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';
import { PUBLIC_ORG_COLUMNS, sanitizeBrandingPatch, sanitizeSettingsPatch } from '@/lib/api/utils/orgSettings';

// GET /api/organizations - Get the organizations the user belongs to (approved roles only)
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();

  const rows = await fetchApprovedRoleRows(user.id);
  if (rows.length === 0) {
    return success({ organizations: [] });
  }

  const orgIds = [...new Set(rows.map((r) => r.organization_id).filter((id): id is string => !!id))];
  if (orgIds.length === 0) {
    return success({ organizations: [] });
  }

  const { data: organizations, error: orgsError } = await supabase
    .from('organizations')
    .select(PUBLIC_ORG_COLUMNS)
    .in('id', orgIds)
    .eq('is_active', true)
    .order('name');

  if (orgsError) {
    console.error('Error fetching organizations:', orgsError);
    return apiError.internal('Failed to fetch organizations');
  }

  const orgsWithRoles = (organizations ?? []).map((org: { id: string }) => ({
    ...org,
    user_role: rows.find((r) => r.organization_id === org.id)?.role,
  }));

  return success({ organizations: orgsWithRoles });
});

// POST /api/organizations - Create new organization (super admin only)
export const POST = withSuperAdmin(async (req: NextRequest, { user }) => {
  const adminSupabase = await createSupabaseAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }

  const { name, type, email, phone, address, subdomain, custom_domain, branding, settings, subscription } = body as {
    name?: string; type?: string; email?: string; phone?: string; address?: unknown;
    subdomain?: string; custom_domain?: string; branding?: unknown; settings?: unknown; subscription?: unknown;
  };

  if (!name || !type || !email) {
    return apiError.badRequest('Missing required fields: name, type, email');
  }
  if (typeof name !== 'string' || name.length > 200) return apiError.validation('Invalid name');
  if (typeof email !== 'string' || !isValidEmail(email)) return apiError.validation('Invalid email');

  const validTypes = ['university', 'college', 'school', 'institute', 'enterprise'];
  if (!validTypes.includes(type)) {
    return apiError.badRequest(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
  }

  let cleanSettings: Record<string, unknown> | undefined;
  if (settings !== undefined) {
    const s = sanitizeSettingsPatch(settings, { isSuperAdmin: true });
    if (!s.ok) return apiError.validation(s.error);
    cleanSettings = s.value;
  }
  let cleanBranding: Record<string, unknown> | undefined;
  if (branding !== undefined) {
    const b = sanitizeBrandingPatch(branding);
    if (!b.ok) return apiError.validation(b.error);
    cleanBranding = b.value;
  }

  const { data: slugData, error: slugError } = await adminSupabase
    .rpc('generate_organization_slug', { org_name: name });
  if (slugError) {
    console.error('Error generating slug:', slugError);
    return apiError.internal('Failed to create organization');
  }

  const { data: organization, error: createError } = await adminSupabase
    .from('organizations')
    .insert({
      name,
      slug: slugData,
      subdomain: subdomain || null,
      custom_domain: custom_domain || null,
      type,
      email,
      phone: phone || null,
      address: address || null,
      branding: cleanBranding,
      settings: cleanSettings,
      subscription: subscription || undefined,
      created_by: user.id,
      is_active: true,
      is_verified: false,
    })
    .select()
    .single();

  if (createError) {
    if (createError.code === '23505') {
      return apiError.validation('An organization with this slug, subdomain or e-mail already exists');
    }
    console.error('Error creating organization:', createError);
    return apiError.internal('Failed to create organization');
  }

  await writeAudit(adminSupabase, {
    actorId: user.id,
    action: 'organization_create',
    targetType: 'organization',
    targetId: organization?.id ?? null,
    organizationId: organization?.id ?? null,
    details: { name, type },
  });

  return success({ organization }, 'Organization created successfully', 201);
});
