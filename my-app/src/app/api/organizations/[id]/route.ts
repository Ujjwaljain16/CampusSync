import { NextRequest } from 'next/server';
import { withAuth, success, apiError } from '@/lib/api';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

// GET /api/organizations/[id] - Get specific organization
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();
  // Extract organization ID from URL path
  const pathname = req.nextUrl.pathname;
  const orgId = pathname.split('/').pop();

  if (!orgId) {
    throw apiError.badRequest('Organization ID is required');
  }

  try {
    // Check if user has access to this organization
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (roleError) throw roleError;

    // Also check if user is super admin
    const { data: superAdminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (!userRole && !superAdminRole) {
      throw apiError.forbidden('You do not have access to this organization');
    }

    // Fetch organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError) throw orgError;

    return success({ 
      organization,
      user_role: userRole?.role || 'super_admin'
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    if (error instanceof Error && 'status' in error) {
      throw error;
    }
    throw apiError.internal('Failed to fetch organization');
  }
});

// PATCH /api/organizations/[id] - Update organization
export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();
  const adminSupabase = await createSupabaseAdminClient();
  // Extract organization ID from URL path
  const pathname = req.nextUrl.pathname;
  const orgId = pathname.split('/').pop();

  if (!orgId) {
    throw apiError.badRequest('Organization ID is required');
  }

  try {
    // Check if user is org admin or super admin
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (roleError) throw roleError;

    const { data: superAdminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    const isOrgAdmin = userRole?.role === 'admin' || userRole?.role === 'org_admin';
    const isSuperAdmin = !!superAdminRole;

    if (!isOrgAdmin && !isSuperAdmin) {
      throw apiError.forbidden('You do not have permission to update this organization');
    }

    const body = await req.json();
    const allowedFields = [
      'name', 'type', 'email', 'phone', 'address',
      'subdomain', 'custom_domain', 'branding', 'settings', 'subscription'
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Only super admins can change certain fields
    if (!isSuperAdmin) {
      delete updates.subdomain;
      delete updates.custom_domain;
      delete updates.subscription;
      delete updates.type;
    }

    updates.updated_at = new Date().toISOString();

    // Use admin client if super admin, otherwise regular client
    const client = isSuperAdmin ? adminSupabase : supabase;

    const { data: organization, error: updateError } = await client
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();

    if (updateError) throw updateError;

    return success({ organization }, 'Organization updated successfully');
  } catch (error) {
    console.error('Error updating organization:', error);
    if (error instanceof Error && 'status' in error) {
      throw error;
    }
    throw apiError.internal('Failed to update organization');
  }
});

// DELETE /api/organizations/[id] - Delete organization (super admin only)
export const DELETE = withAuth(async (req: NextRequest, { user }) => {
  const adminSupabase = await createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  // Extract organization ID from URL path
  const pathname = req.nextUrl.pathname;
  const orgId = pathname.split('/').pop();

  if (!orgId) {
    throw apiError.badRequest('Organization ID is required');
  }

  try {
    // Check if user is super admin
    const { data: superAdminRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (roleError) throw roleError;

    if (!superAdminRole) {
      throw apiError.forbidden('Only super admins can delete organizations');
    }

    // Soft delete - set deleted_at
    const { error: deleteError } = await adminSupabase
      .from('organizations')
      .update({ 
        is_active: false,
        deleted_at: new Date().toISOString()
      })
      .eq('id', orgId);

    if (deleteError) throw deleteError;

    return success({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Error deleting organization:', error);
    if (error instanceof Error && 'status' in error) {
      throw error;
    }
    throw apiError.internal('Failed to delete organization');
  }
});
