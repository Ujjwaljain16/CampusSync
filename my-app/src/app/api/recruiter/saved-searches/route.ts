import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';

export const GET = withRole(['recruiter', 'admin'], async (req: NextRequest, { user }) => {
  const supabase = await createSupabaseServerClient();
  const requestedOrgId = getRequestedOrgId(req);
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  const { data: searches, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('user_id', user.id)
    .in('organization_id', targetOrgIds) // Multi-org filter
    .order('created_at', { ascending: false });

  if (error) {
    throw apiError.internal(error.message);
  }

  return success({
    data: searches || [],
    total: searches?.length || 0
  });
});

export const POST = withRole(['recruiter', 'admin'], async (req: NextRequest, { user }) => {
  const body = await req.json() as {
    name: string;
    description?: string;
    filters: {
      skills?: string[];
      institutions?: string[];
      verification_status?: string[];
      confidence_min?: number;
      date_from?: string;
      date_to?: string;
    };
    is_public?: boolean;
  };

  if (!body.name || !body.filters) {
    throw apiError.badRequest('Missing required fields: name, filters');
  }

  const supabase = await createSupabaseServerClient();
  const requestedOrgId = getRequestedOrgId(req);
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  const targetOrgId = requestedOrgId || 
    ('organizationId' in orgContext ? orgContext.organizationId : null) || 
    ('organizationIds' in orgContext && Array.isArray(orgContext.organizationIds) ? orgContext.organizationIds[0] : null) || null;
  
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: user.id,
      organization_id: targetOrgId, // Multi-org field
      name: body.name,
      description: body.description || null,
      search_filters: body.filters,
      is_public: body.is_public || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    throw apiError.internal(error.message);
  }

  // Log the creation
  await supabase.from('audit_logs').insert({
    user_id: user.id,
    organization_id: targetOrgId, // Multi-org field
    action: 'create_saved_search',
    target_id: data.id,
    details: {
      name: body.name,
      filters: body.filters,
      is_public: body.is_public
    },
    created_at: new Date().toISOString()
  });

  return success({
    data: data,
    message: 'Saved search created successfully'
  });
});
