import { withRole, success } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';

/**
 * GET /api/debug/domains
 *
 * Development-only diagnostic listing registered email domains.
 * Disabled in production and restricted to super admins.
 */
export const GET = withRole(['super_admin'], async () => {
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 });
  }

  const supabase = await createSupabaseAdminClient();

  const { data: allOrgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, type, settings')
    .eq('is_active', true);

  const { data: globalDomains, error: domainError } = await supabase
    .from('allowed_domains')
    .select('*')
    .eq('is_active', true);

  const orgs = (allOrgs || []).filter((org: { settings?: { allowed_email_domains?: string[] } }) => {
    const domains = org.settings?.allowed_email_domains;
    return Array.isArray(domains) && domains.length > 0;
  });

  return success({
    organizations: orgs.map((org: { id: string; name: string; slug: string; type: string; settings?: { allowed_email_domains?: string[] } }) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      allowedDomains: org.settings?.allowed_email_domains || [],
    })),
    globalDomains: globalDomains || [],
    errors: { orgError: orgError?.message || null, domainError: domainError?.message || null },
  });
});
