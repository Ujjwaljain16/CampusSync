import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { isPlainObject } from '@/lib/privacy/sanitize';

const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;
const MAX_FILTERS_JSON = 4000;

// GET: saved searches of the current user. Response: { data: { data: [...], total } }
export const GET = withRole(['recruiter', 'admin'], async (req: NextRequest, { user }) => {
  const limited = enforceRateLimit(req, 'recruiter-saved-searches', RateLimitPresets.relaxed, user.id);
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const orgContext = await getOrganizationContext(user, getRequestedOrgId(req));
    const targetOrgIds = getTargetOrganizationIds(orgContext);
    if (targetOrgIds.length === 0) return apiError.forbidden('No approved organization access');

    const { data: searches, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', user.id)
      .in('organization_id', targetOrgIds)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[saved-searches] fetch failed', error);
      return apiError.internal('Failed to fetch saved searches');
    }
    return success({ data: searches ?? [], total: searches?.length ?? 0 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[saved-searches] GET failed', err);
    return apiError.internal('Internal server error');
  }
});

export const POST = withRole(['recruiter', 'admin'], async (req: NextRequest, { user }) => {
  const limited = enforceRateLimit(req, 'recruiter-saved-searches-write', RateLimitPresets.standard, user.id);
  if (limited) return limited;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError.badRequest('Invalid JSON body');
    }
    if (!isPlainObject(body)) return apiError.badRequest('Request body must be a JSON object');

    const { name, description, filters, is_public } = body;
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > MAX_NAME) {
      return apiError.badRequest(`name is required (max ${MAX_NAME} characters)`);
    }
    if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > MAX_DESCRIPTION)) {
      return apiError.badRequest(`description must be a string of at most ${MAX_DESCRIPTION} characters`);
    }
    if (!isPlainObject(filters) || JSON.stringify(filters).length > MAX_FILTERS_JSON) {
      return apiError.badRequest('filters must be an object of reasonable size');
    }
    if (is_public !== undefined && typeof is_public !== 'boolean') {
      return apiError.badRequest('is_public must be a boolean');
    }

    const supabase = await createSupabaseServerClient();
    const orgContext = await getOrganizationContext(user, getRequestedOrgId(req));
    const targetOrgIds = getTargetOrganizationIds(orgContext);
    const targetOrgId = targetOrgIds[0] ?? null;
    if (!targetOrgId) return apiError.forbidden('No approved organization access');

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: user.id,
        organization_id: targetOrgId,
        name: name.trim(),
        description: typeof description === 'string' ? description : null,
        search_filters: filters,
        is_public: is_public === true,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[saved-searches] insert failed', error);
      return apiError.internal('Failed to create saved search');
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      organization_id: targetOrgId,
      action: 'create_saved_search',
      target_id: data.id,
      details: { name: name.trim(), is_public: is_public === true },
      created_at: now,
    });
    if (auditError) console.error('[saved-searches] audit insert failed', auditError);

    return success({ data, message: 'Saved search created successfully' });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[saved-searches] POST failed', err);
    return apiError.internal('Internal server error');
  }
});
