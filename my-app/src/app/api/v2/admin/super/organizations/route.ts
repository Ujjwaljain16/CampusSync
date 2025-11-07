import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/v2/admin/super/organizations
 * Get all organizations (super admin only)
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    // Check if user is super admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || userRole?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    // Get all organizations with user counts
    const { data: organizations, error: orgsError } = await supabase
      .from('organizations')
      .select(`
        *,
        user_roles!user_roles_organization_id_fkey(count),
        certificates!certificates_organization_id_fkey(count)
      `)
      .order('created_at', { ascending: false });

    if (orgsError) throw orgsError;

    // Get counts for each organization
    const orgsWithCounts = await Promise.all(
      (organizations || []).map(async (org: Record<string, unknown>) => {
        const { count: userCount } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id);

        const { count: studentCount } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id)
          .eq('role', 'student');

        const { count: facultyCount } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id)
          .eq('role', 'faculty');

        const { count: certificateCount } = await supabase
          .from('certificates')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id);

        return {
          ...org,
          user_count: userCount || 0,
          student_count: studentCount || 0,
          faculty_count: facultyCount || 0,
          certificate_count: certificateCount || 0
        };
      })
    );

    return NextResponse.json({ data: orgsWithCounts });
  } catch (error: unknown) {
    console.error('GET /api/v2/admin/super/organizations error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch organizations' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to generate slug suggestions when slug is taken
 */
async function generateSlugSuggestions(baseSlug: string): Promise<string[]> {
  const suggestions: string[] = [];
  const timestamp = Date.now().toString().slice(-4);
  
  suggestions.push(`${baseSlug}-${timestamp}`);
  suggestions.push(`${baseSlug}-org`);
  suggestions.push(`${baseSlug}-edu`);
  
  return suggestions;
}

/**
 * POST /api/v2/admin/super/organizations
 * Create a new organization (super admin only)
 * Includes race condition protection with advisory locks
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // Check if user is super admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || userRole?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, slug, type, email, phone, website, address, settings } = body;

    // Validate required fields
    if (!name || !slug || !type || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: name, slug, type, email' },
        { status: 400 }
      );
    }

    // Validate and sanitize slug
    const sanitizedSlug = slug.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')  // Replace invalid chars with hyphen
      .replace(/--+/g, '-')          // Replace multiple hyphens with single
      .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens

    if (sanitizedSlug !== slug) {
      console.log(`[ORG_CREATE] Slug sanitized: "${slug}" -> "${sanitizedSlug}"`);
    }

    // Check for existing slug with advisory lock (prevents race conditions)
    const { data: slugCheck, error: slugCheckError } = await supabase
      .rpc('check_and_reserve_slug', { slug_to_check: sanitizedSlug });

    if (slugCheckError) {
      console.error('[ORG_CREATE] Slug check error:', slugCheckError);
      return NextResponse.json(
        { error: 'Failed to validate slug' },
        { status: 500 }
      );
    }

    if (slugCheck && slugCheck[0]?.slug_exists) {
      const suggestions = await generateSlugSuggestions(sanitizedSlug);
      return NextResponse.json({
        error: 'Organization slug already exists',
        message: `The slug "${sanitizedSlug}" is already taken. Try one of these:`,
        suggestions: suggestions
      }, { status: 409 });
    }

    // Check for existing email
    const { data: existingEmail, error: emailCheckError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('email', email)
      .maybeSingle();

    if (emailCheckError && emailCheckError.code !== 'PGRST116') {
      console.error('[ORG_CREATE] Email check error:', emailCheckError);
      return NextResponse.json(
        { error: 'Failed to validate email' },
        { status: 500 }
      );
    }

    if (existingEmail) {
      return NextResponse.json({
        error: 'Organization with this email already exists',
        message: `The email ${email} is already used by "${existingEmail.name}"`
      }, { status: 409 });
    }

    // Create organization
    const { data: organization, error: createError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug: sanitizedSlug,
        type,
        email,
        phone: phone || null,
        website: website || null,
        address: address || null,
        settings: settings || {},
        is_active: true,
        is_verified: true,
        verified_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      // Handle unique constraint violations at database level (backup protection)
      if (createError.code === '23505') {
        const suggestions = await generateSlugSuggestions(sanitizedSlug);
        return NextResponse.json({
          error: 'Organization already exists',
          message: 'Another admin created this organization simultaneously. Try a different name.',
          suggestions: suggestions
        }, { status: 409 });
      }

      throw createError;
    }

    console.log('[ORG_CREATE] ✅ Organization created:', organization.id, organization.name);

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error: unknown) {
    console.error('[ORG_CREATE] ❌ Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create organization' },
      { status: 500 }
    );
  }
}
