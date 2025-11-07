import { NextRequest } from 'next/server';
import { withAuth, withRole, success, apiError } from '@/lib/api';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

// GET /api/organizations - Get user's organizations
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();

  try {
    // Get organizations user belongs to
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('organization_id, role')
      .eq('user_id', user.id);

    if (rolesError) throw rolesError;

    if (!userRoles || userRoles.length === 0) {
      return success({ organizations: [] });
    }

    const orgIds = [...new Set(userRoles.map(r => r.organization_id))];

    // Fetch organization details
    const { data: organizations, error: orgsError } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .eq('is_active', true)
      .order('name');

    if (orgsError) throw orgsError;

    // Add user's role for each organization
    const orgsWithRoles = organizations?.map(org => ({
      ...org,
      user_role: userRoles.find(r => r.organization_id === org.id)?.role
    }));

    return success({ organizations: orgsWithRoles || [] });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    throw apiError.internal('Failed to fetch organizations');
  }
});

// POST /api/organizations - Create new organization (super admin only)
export const POST = withRole(['super_admin'], async (req: NextRequest, { user }) => {
  const adminSupabase = await createSupabaseAdminClient();
  
  try {
    const body = await req.json();
    
    const { 
      name, 
      type, 
      email,
      phone,
      address,
      subdomain,
      custom_domain,
      branding,
      settings,
      subscription
    } = body;

    // Validate required fields
    if (!name || !type || !email) {
      throw apiError.badRequest('Missing required fields: name, type, email');
    }

    // Validate type
    const validTypes = ['university', 'college', 'school', 'institute', 'enterprise'];
    if (!validTypes.includes(type)) {
      throw apiError.badRequest(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Generate slug from name
    const { data: slugData, error: slugError } = await adminSupabase
      .rpc('generate_organization_slug', { org_name: name });

    if (slugError) throw slugError;

    // Create organization
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
        branding: branding || undefined,
        settings: settings || undefined,
        subscription: subscription || undefined,
        created_by: user.id,
        is_active: true,
        is_verified: false,
      })
      .select()
      .single();

    if (createError) throw createError;

    return success({ organization }, 'Organization created successfully', 201);
  } catch (error) {
    console.error('Error creating organization:', error);
    if (error instanceof Error && 'status' in error) {
      throw error;
    }
    throw apiError.internal('Failed to create organization');
  }
});
