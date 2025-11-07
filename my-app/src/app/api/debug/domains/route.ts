import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * GET /api/debug/domains
 * 
 * Debug endpoint to check what domains are registered
 * Shows both organization-specific and global domains
 */
export async function GET() {
  try {
    const supabase = await createSupabaseAdminClient();

    // Get all active organizations
    const { data: allOrgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, slug, type, is_active, settings')
      .eq('is_active', true);

    console.log('[Debug Domains] Total active orgs:', allOrgs?.length);
    console.log('[Debug Domains] All orgs data:', JSON.stringify(allOrgs, null, 2));

    // Filter to only orgs with non-empty allowed_email_domains
    const orgs = allOrgs?.filter((org: { name: string; settings?: { allowed_email_domains?: string[] } }) => {
      const domains = org.settings?.allowed_email_domains;
      const hasValidDomains = Array.isArray(domains) && domains.length > 0;
      console.log(`[Debug Domains] Org ${org.name}: settings=${JSON.stringify(org.settings)}, hasValidDomains=${hasValidDomains}`);
      return hasValidDomains;
    }) || [];

    console.log('[Debug Domains] Filtered orgs count:', orgs.length);

    // Get all global allowed domains
    const { data: globalDomains, error: domainError } = await supabase
      .from('allowed_domains')
      .select('*')
      .eq('is_active', true);

    return NextResponse.json({
      success: true,
      organizations: {
        count: orgs?.length || 0,
        data: orgs?.map((org: { id: string; name: string; slug: string; type: string; settings?: { allowed_email_domains?: string[] } }) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          type: org.type,
          allowedDomains: org.settings?.allowed_email_domains || [],
          rawSettings: org.settings
        })) || []
      },
      globalDomains: {
        count: globalDomains?.length || 0,
        data: globalDomains || []
      },
      errors: {
        orgError: orgError?.message || null,
        domainError: domainError?.message || null
      }
    });

  } catch (error) {
    console.error('Debug domains error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
