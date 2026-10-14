import { NextResponse } from 'next/server';
import { withSuperAdmin, apiError, isValidEmail, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { findDomainConflict } from '@/lib/api/utils/domains';
import { sanitizeSettingsPatch } from '@/lib/api/utils/orgSettings';

const NO_ORG = '00000000-0000-0000-0000-000000000000';

/**
 * GET /api/v2/admin/super/organizations
 * Get all organizations with counts (super admin only)
 */
export const GET = withSuperAdmin(async () => {
  const db = await createSupabaseAdminClient();

  const { data: organizations, error: orgsError } = await db
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });
  if (orgsError) {
    console.error('GET /api/v2/admin/super/organizations error:', orgsError);
    return apiError.internal('Failed to fetch organizations');
  }

  // One pass over user_roles instead of 3 count queries per organization
  const { data: roleRows, error: rolesError } = await db.from('user_roles').select('organization_id, role');
  if (rolesError) {
    console.error('GET /api/v2/admin/super/organizations roles error:', rolesError);
    return apiError.internal('Failed to fetch organizations');
  }
  const tally = new Map<string, { users: number; students: number; faculty: number }>();
  for (const r of (roleRows ?? []) as Array<{ organization_id: string | null; role: string }>) {
    if (!r.organization_id) continue;
    const t = tally.get(r.organization_id) ?? { users: 0, students: 0, faculty: 0 };
    t.users++;
    if (r.role === 'student') t.students++;
    if (r.role === 'faculty') t.faculty++;
    tally.set(r.organization_id, t);
  }

  const orgsWithCounts = await Promise.all(
    (organizations ?? []).map(async (org: Record<string, unknown>) => {
      const { count: certificateCount } = await db
        .from('certificates')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id as string);
      const t = tally.get(org.id as string);
      return {
        ...org,
        user_count: t?.users ?? 0,
        student_count: t?.students ?? 0,
        faculty_count: t?.faculty ?? 0,
        certificate_count: certificateCount || 0,
      };
    })
  );

  return NextResponse.json({ data: orgsWithCounts });
});

/** Slug suggestions when a slug is taken */
function generateSlugSuggestions(baseSlug: string): string[] {
  const timestamp = Date.now().toString().slice(-4);
  return [`${baseSlug}-${timestamp}`, `${baseSlug}-org`, `${baseSlug}-edu`];
}

/**
 * POST /api/v2/admin/super/organizations
 * Create a new organization (super admin only).
 *
 * Slug uniqueness is checked via the check_and_reserve_slug RPC and is
 * ultimately enforced by the database unique constraint (23505 -> 409);
 * there is no cross-request lock.
 */
export const POST = withSuperAdmin(async (request, { user }) => {
  const db = await createSupabaseAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError.badRequest('Invalid JSON body');
  }
  const { name, slug, type, email, phone, website, address, settings } = body as {
    name?: string; slug?: string; type?: string; email?: string; phone?: string;
    website?: string; address?: unknown; settings?: unknown;
  };

  if (!name || !slug || !type || !email) {
    return apiError.badRequest('Missing required fields: name, slug, type, email');
  }
  if (typeof name !== 'string' || name.length > 200) return apiError.validation('Invalid name');
  if (typeof slug !== 'string' || slug.length > 100) return apiError.validation('Invalid slug');
  if (typeof type !== 'string' || type.length > 50) return apiError.validation('Invalid type');
  if (typeof email !== 'string' || !isValidEmail(email)) return apiError.validation('Invalid email');

  const sanitizedSlug = slug.toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
  if (!sanitizedSlug) return apiError.validation('Invalid slug');

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

  const { data: slugCheck, error: slugCheckError } = await db
    .rpc('check_and_reserve_slug', { slug_to_check: sanitizedSlug });
  if (slugCheckError) {
    console.error('[ORG_CREATE] Slug check error:', slugCheckError);
    return apiError.internal('Failed to validate slug');
  }
  if (slugCheck && slugCheck[0]?.slug_exists) {
    return NextResponse.json({
      error: 'Organization slug already exists',
      message: `The slug "${sanitizedSlug}" is already taken. Try one of these:`,
      suggestions: generateSlugSuggestions(sanitizedSlug),
    }, { status: 409 });
  }

  const { data: existingEmail, error: emailCheckError } = await db
    .from('organizations')
    .select('id, name')
    .eq('email', email)
    .maybeSingle();
  if (emailCheckError) {
    console.error('[ORG_CREATE] Email check error:', emailCheckError);
    return apiError.internal('Failed to validate email');
  }
  if (existingEmail) {
    return NextResponse.json({
      error: 'Organization with this email already exists',
      message: `The email ${email} is already used by "${existingEmail.name}"`,
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: organization, error: createError } = await db
    .from('organizations')
    .insert({
      name,
      slug: sanitizedSlug,
      type,
      email,
      phone: phone || null,
      website: website || null,
      address: address || null,
      settings: cleanSettings,
      created_by: user.id,
      is_active: true,
      is_verified: true,
      verified_at: now,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (createError) {
    if (createError.code === '23505') {
      return NextResponse.json({
        error: 'Organization already exists',
        message: 'Another admin created this organization simultaneously. Try a different name.',
        suggestions: generateSlugSuggestions(sanitizedSlug),
      }, { status: 409 });
    }
    console.error('[ORG_CREATE] Error:', createError);
    return apiError.internal('Failed to create organization');
  }

  await writeAudit(db, {
    actorId: user.id,
    action: 'organization_create',
    targetType: 'organization',
    targetId: organization.id,
    organizationId: organization.id,
    details: { name, slug: sanitizedSlug, type },
  });

  return NextResponse.json({ organization }, { status: 201 });
});
