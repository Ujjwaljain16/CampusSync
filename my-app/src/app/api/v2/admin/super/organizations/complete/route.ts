import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError, isValidEmail, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { addOrgAdmin } from '@/lib/api/utils/orgAdmins';
import { findDomainConflict } from '@/lib/api/utils/domains';
import { sanitizeSettingsPatch } from '@/lib/api/utils/orgSettings';

const NO_ORG = '00000000-0000-0000-0000-000000000000';

/**
 * POST /api/v2/admin/super/organizations/complete
 *
 * Create an organization together with its first admin (org_admin, primary).
 * Steps: organization -> admin user + profile + role (shared addOrgAdmin).
 * If the admin step fails the organization is deleted again, so a failure
 * never leaves an orphan organization behind.
 */
export const POST = withSuperAdmin(async (request, { user }) => {
  const db = await createSupabaseAdminClient();

  let body: {
    organizationData?: Record<string, unknown>;
    adminData?: { email?: string; password?: string; name?: string };
  };
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { organizationData, adminData } = body;

  if (!organizationData || !adminData) {
    return NextResponse.json(
      { error: 'Missing required data', details: 'Both organizationData and adminData are required' },
      { status: 400 }
    );
  }

  const { name, slug, type, email, phone, website, settings } = organizationData as {
    name?: string; slug?: string; type?: string; email?: string; phone?: string; website?: string; settings?: unknown;
  };
  if (typeof name !== 'string' || !name.trim() || name.length > 200) return apiError.validation('Invalid organization name');
  if (typeof slug !== 'string' || !slug.trim() || slug.length > 100) return apiError.validation('Invalid slug');
  if (typeof type !== 'string' || type.length > 50) return apiError.validation('Invalid type');
  if (typeof email !== 'string' || !isValidEmail(email)) return apiError.validation('Invalid organization email');
  if (!adminData.email || !isValidEmail(adminData.email) || !adminData.name) {
    return apiError.validation('adminData requires a valid email and a name');
  }

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '');
  if (!cleanSlug) return apiError.validation('Invalid slug');

  let cleanSettings: Record<string, unknown> = {};
  if (settings !== undefined && settings !== null) {
    const s = sanitizeSettingsPatch(settings, { isSuperAdmin: true });
    if (!s.ok) return apiError.validation(s.error);
    cleanSettings = s.value;
    if (Array.isArray(cleanSettings.allowed_email_domains)) {
      const conflict = await findDomainConflict(db, NO_ORG, cleanSettings.allowed_email_domains as string[]);
      if (conflict) {
        return NextResponse.json(
          { error: 'A domain is already claimed by another organization', domain: conflict.domain },
          { status: 409 }
        );
      }
    }
  }

  // ---- Step 1: organization -------------------------------------------
  const now = new Date().toISOString();
  const { data: organization, error: orgError } = await db
    .from('organizations')
    .insert({
      name: name.trim(),
      slug: cleanSlug,
      type,
      email,
      phone: phone || null,
      website: website || null,
      settings: cleanSettings,
      created_by: user.id,
      is_active: true,
      is_verified: true,
      verified_at: now,
    })
    .select()
    .single();

  if (orgError || !organization) {
    if (orgError?.code === '23505') {
      return NextResponse.json({ error: 'Organization with this slug or email already exists' }, { status: 409 });
    }
    console.error('[ORG_CREATE] organization creation failed:', orgError);
    return apiError.internal('Organization creation failed');
  }

  // ---- Step 2: first admin (user + profile + org_admin role) ----------
  const outcome = await addOrgAdmin(db, {
    actorId: user.id,
    orgId: organization.id,
    email: adminData.email,
    fullName: adminData.name,
    password: adminData.password,
    role: 'org_admin',
    makePrimary: true,
  });

  if (!outcome.ok) {
    // Roll the organization back
    const { error: rollbackError } = await db.from('organizations').delete().eq('id', organization.id);
    await writeAudit(db, {
      actorId: user.id,
      action: rollbackError
        ? 'organization_creation_failed_partial_rollback'
        : 'organization_creation_failed_fully_rolled_back',
      targetType: 'organization',
      targetId: organization.id,
      organizationId: null,
      details: { name: organization.name, reason: (outcome.body as { error?: string }).error },
    });
    if (rollbackError) console.error('[ORG_CREATE] CRITICAL: rollback failed, orphan organization', organization.id, rollbackError);

    return NextResponse.json(
      {
        error: (outcome.body as { error?: string }).error ?? 'Organization creation failed',
        details: rollbackError
          ? 'Partial rollback - manual cleanup may be required.'
          : 'All changes have been rolled back successfully. You can try again.',
      },
      { status: outcome.status >= 400 ? outcome.status : 500 }
    );
  }

  const adminBody = outcome.body as { user_id: string };
  await writeAudit(db, {
    actorId: user.id,
    action: 'organization_created_complete',
    targetType: 'organization',
    targetId: organization.id,
    organizationId: organization.id,
    details: { organization_name: organization.name, admin_email: adminData.email, admin_user_id: adminBody.user_id },
  });

  return NextResponse.json(
    {
      success: true,
      organization,
      admin: { id: adminBody.user_id, email: adminData.email, name: adminData.name },
    },
    { status: 201 }
  );
});
