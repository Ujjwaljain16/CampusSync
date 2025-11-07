import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';

/**
 * GET /api/admin/organizations/[orgId]/domains
 * Get allowed email domains for an organization
 * 
 * PUT /api/admin/organizations/[orgId]/domains
 * Update allowed email domains for an organization
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const userWithRole = await getServerUserWithRole();

    if (!userWithRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role } = userWithRole;

    // Only super_admins and org_admins can view domains
    if (role !== 'super_admin' && role !== 'admin' && role !== 'org_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    const { orgId } = await params;

    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, name, slug, settings')
      .eq('id', orgId)
      .single();

    if (error || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const allowedDomains = org.settings?.allowed_email_domains || [];

    return NextResponse.json({
      organizationId: org.id,
      organizationName: org.name,
      allowedDomains
    });

  } catch (error) {
    console.error('Error fetching domains:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const userWithRole = await getServerUserWithRole();

    if (!userWithRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role } = userWithRole;

    // Only super_admins and org_admins can update domains
    if (role !== 'super_admin' && role !== 'admin' && role !== 'org_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    const { orgId } = await params;
    const { domains } = await request.json();

    if (!Array.isArray(domains)) {
      return NextResponse.json({ error: 'domains must be an array' }, { status: 400 });
    }

    // Validate domain format
    const invalidDomains = domains.filter((d: string) => {
      const trimmed = d.trim();
      // Should be a valid domain pattern (e.g., "university.edu" or "*.university.edu")
      return !trimmed || !/^(\*\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
    });

    if (invalidDomains.length > 0) {
      return NextResponse.json({
        error: 'Invalid domain format',
        invalidDomains
      }, { status: 400 });
    }

    // Update organization settings
    const { data: org, error: fetchError } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single();

    if (fetchError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const updatedSettings = {
      ...org.settings,
      allowed_email_domains: domains.map((d: string) => d.trim().toLowerCase())
    };

    const { error: updateError } = await supabase
      .from('organizations')
      .update({ settings: updatedSettings })
      .eq('id', orgId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      organizationId: orgId,
      allowedDomains: updatedSettings.allowed_email_domains
    });

  } catch (error) {
    console.error('Error updating domains:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
