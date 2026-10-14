import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError, isUuid, isValidEmail, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/v2/admin/super/organizations/[orgId]
 * Get a single organization by ID (super admin only)
 */
export const GET = withSuperAdmin<{ orgId: string }>(async (_request, { params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  const db = await createSupabaseAdminClient();
  const { data: organization, error: orgError } = await db
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle();

  if (orgError) {
    console.error('GET organization error:', orgError);
    return apiError.internal('Failed to fetch organization');
  }
  if (!organization) return apiError.notFound('Organization not found');

  return NextResponse.json({ data: organization });
});

/**
 * PATCH /api/v2/admin/super/organizations/[orgId]
 * Update an organization (super admin only)
 */
export const PATCH = withSuperAdmin<{ orgId: string }>(async (request, { user, params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { name, slug, type, email, phone, website, address, is_active, is_verified } = body as {
    name?: string; slug?: string; type?: string; email?: string; phone?: string | null;
    website?: string | null; address?: unknown; is_active?: boolean; is_verified?: boolean;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > 200) return apiError.validation('Invalid name');
    updates.name = name.trim();
  }
  if (slug !== undefined) {
    if (typeof slug !== 'string' || slug.length > 100) return apiError.validation('Invalid slug');
    const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '');
    if (!clean) return apiError.validation('Invalid slug');
    updates.slug = clean;
  }
  if (type !== undefined) {
    if (typeof type !== 'string' || type.length > 50) return apiError.validation('Invalid type');
    updates.type = type;
  }
  if (email !== undefined) {
    if (typeof email !== 'string' || !isValidEmail(email)) return apiError.validation('Invalid email');
    updates.email = email;
  }
  if (phone !== undefined) updates.phone = phone;
  if (website !== undefined) updates.website = website;
  if (address !== undefined) updates.address = address;
  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') return apiError.validation('is_active must be a boolean');
    updates.is_active = is_active;
  }
  if (is_verified !== undefined) {
    if (typeof is_verified !== 'boolean') return apiError.validation('is_verified must be a boolean');
    updates.is_verified = is_verified;
    if (is_verified) updates.verified_at = new Date().toISOString();
  }

  const db = await createSupabaseAdminClient();
  const { data: organization, error: updateError } = await db
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select()
    .maybeSingle();

  if (updateError) {
    if (updateError.code === '23505') {
      return NextResponse.json({ error: 'Organization with this slug or email already exists' }, { status: 409 });
    }
    console.error('PATCH organization error:', updateError);
    return apiError.internal('Failed to update organization');
  }
  if (!organization) return apiError.notFound('Organization not found');

  await writeAudit(db, {
    actorId: user.id,
    action: 'organization_update',
    targetType: 'organization',
    targetId: orgId,
    organizationId: orgId,
    details: { fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
  });

  return NextResponse.json({ data: organization });
});

/**
 * DELETE /api/v2/admin/super/organizations/[orgId]
 * HARD delete an organization (super admin only).
 * WARNING: cascades to all related data. The audit row is written BEFORE the
 * delete and carries no organization_id (it would be cascaded away with the org).
 */
export const DELETE = withSuperAdmin<{ orgId: string }>(async (_request, { user, params }) => {
  const { orgId } = params;
  if (!isUuid(orgId)) return apiError.badRequest('Invalid organization id');

  if (orgId === DEFAULT_ORG_ID) {
    return apiError.forbidden('Cannot delete default organization');
  }

  const db = await createSupabaseAdminClient();

  const { data: org, error: lookupError } = await db
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();
  if (lookupError) {
    console.error('DELETE organization lookup error:', lookupError);
    return apiError.internal('Failed to delete organization');
  }
  if (!org) return apiError.notFound('Organization not found');

  await writeAudit(db, {
    actorId: user.id,
    action: 'organization_hard_delete',
    targetType: 'organization',
    targetId: orgId,
    organizationId: null,
    details: { organization_id: orgId, name: org.name, slug: org.slug },
  });

  const { error: deleteError } = await db.from('organizations').delete().eq('id', orgId);
  if (deleteError) {
    console.error('DELETE organization error:', deleteError);
    return apiError.internal('Failed to delete organization');
  }

  return NextResponse.json({ message: 'Organization deleted successfully' });
});
