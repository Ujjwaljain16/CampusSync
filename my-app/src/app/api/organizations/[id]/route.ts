import {
  withSession,
  withSuperAdmin,
  success,
  apiError,
  error as errorResponse,
  authorizeOrg,
  isUuid,
  isValidEmail,
  writeAudit,
} from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { isAdminClass } from '@/lib/api/utils/roles';
import { findDomainConflict } from '@/lib/api/utils/domains';
import {
  ADMIN_ORG_COLUMNS,
  PUBLIC_ORG_COLUMNS,
  mergeJson,
  sanitizeBrandingPatch,
  sanitizeSettingsPatch,
} from '@/lib/api/utils/orgSettings';

const VALID_TYPES = ['university', 'college', 'school', 'institute', 'enterprise'];

// GET /api/organizations/[id] - Get a specific organization the caller belongs to
export const GET = withSession<{ id: string }>(async (_req, { user, params }) => {
  const orgId = params.id;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  // Any approved role in that organization (or super_admin) may read it...
  const access = await authorizeOrg(user, { orgId, minRole: 'student' });

  // ...but only admins see contact data and settings. Everyone else gets public bits.
  const columns = isAdminClass(access.role) ? ADMIN_ORG_COLUMNS : PUBLIC_ORG_COLUMNS;

  const admin = await createSupabaseAdminClient();
  const { data: organization, error: orgError } = await admin
    .from('organizations')
    .select(columns)
    .eq('id', orgId)
    .maybeSingle();

  if (orgError) {
    console.error('Error fetching organization:', orgError);
    return apiError.internal('Failed to fetch organization');
  }
  if (!organization) return apiError.notFound('Organization not found');

  return success({ organization, user_role: access.role });
});

// PATCH /api/organizations/[id] - Update organization (org admin: limited fields; super admin: all)
export const PATCH = withSession<{ id: string }>(async (req, { user, params }) => {
  const orgId = params.id;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  const access = await authorizeOrg(user, { orgId, minRole: 'admin' });
  const isSuperAdmin = access.isSuperAdmin;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return apiError.badRequest('Invalid request body');
  }

  const admin = await createSupabaseAdminClient();
  const updates: Record<string, unknown> = {};

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) {
      return apiError.validation('Invalid name');
    }
    updates.name = body.name.trim();
  }
  if ('email' in body) {
    if (typeof body.email !== 'string' || !isValidEmail(body.email)) return apiError.validation('Invalid email');
    updates.email = body.email;
  }
  if ('phone' in body) {
    if (body.phone !== null && (typeof body.phone !== 'string' || body.phone.length > 40)) {
      return apiError.validation('Invalid phone');
    }
    updates.phone = body.phone;
  }
  if ('address' in body) {
    if (body.address !== null && (typeof body.address !== 'object' || Array.isArray(body.address))) {
      return apiError.validation('Invalid address');
    }
    updates.address = body.address;
  }

  // Super-admin-only fields
  for (const field of ['subdomain', 'custom_domain', 'subscription', 'type'] as const) {
    if (field in body) {
      if (!isSuperAdmin) return apiError.forbidden(`Only a super admin can change ${field}`);
      if (field === 'type' && !VALID_TYPES.includes(body.type as string)) return apiError.validation('Invalid type');
      updates[field] = body[field];
    }
  }

  // branding / settings: allow-listed keys, merged into what is stored
  if ('branding' in body || 'settings' in body) {
    const { data: current, error: currentError } = await admin
      .from('organizations')
      .select('settings, branding')
      .eq('id', orgId)
      .maybeSingle();
    if (currentError) {
      console.error('Error loading organization:', currentError);
      return apiError.internal('Failed to update organization');
    }
    if (!current) return apiError.notFound('Organization not found');

    if ('branding' in body) {
      const b = sanitizeBrandingPatch(body.branding);
      if (!b.ok) return apiError.validation(b.error);
      updates.branding = mergeJson(current.branding, b.value);
    }
    if ('settings' in body) {
      const s = sanitizeSettingsPatch(body.settings, { isSuperAdmin });
      if (!s.ok) return s.error.includes('super admin') ? apiError.forbidden(s.error) : apiError.validation(s.error);

      if (Array.isArray(s.value.allowed_email_domains)) {
        const conflict = await findDomainConflict(admin, orgId, s.value.allowed_email_domains as string[]);
        if (conflict) return errorResponse('A domain is already claimed by another organization', 409, { domain: conflict.domain });
      }
      updates.settings = mergeJson(current.settings, s.value);
    }
  }

  if (Object.keys(updates).length === 0) {
    return apiError.badRequest('No editable fields supplied');
  }
  updates.updated_at = new Date().toISOString();

  const { data: organization, error: updateError } = await admin
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select(ADMIN_ORG_COLUMNS)
    .maybeSingle();

  if (updateError) {
    if (updateError.code === '23505') return errorResponse('Another organization already uses this value', 409);
    console.error('Error updating organization:', updateError);
    return apiError.internal('Failed to update organization');
  }
  if (!organization) return apiError.notFound('Organization not found');

  await writeAudit(admin, {
    actorId: user.id,
    action: 'organization_update',
    targetType: 'organization',
    targetId: orgId,
    organizationId: orgId,
    details: { fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
  });

  return success({ organization }, 'Organization updated successfully');
});

// DELETE /api/organizations/[id] - Soft-delete organization (super admin only)
export const DELETE = withSuperAdmin<{ id: string }>(async (_req, { user, params }) => {
  const orgId = params.id;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');
  if (orgId === '00000000-0000-0000-0000-000000000001') {
    return apiError.forbidden('Cannot delete default organization');
  }

  const admin = await createSupabaseAdminClient();
  const { data, error: deleteError } = await admin
    .from('organizations')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', orgId)
    .select('id');

  if (deleteError) {
    console.error('Error deleting organization:', deleteError);
    return apiError.internal('Failed to delete organization');
  }
  if (!data || data.length === 0) return apiError.notFound('Organization not found');

  await writeAudit(admin, {
    actorId: user.id,
    action: 'organization_soft_delete',
    targetType: 'organization',
    targetId: orgId,
    organizationId: orgId,
  });

  return success({ message: 'Organization deleted successfully' });
});
