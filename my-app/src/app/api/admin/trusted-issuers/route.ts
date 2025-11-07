import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

interface TrustedIssuerInput {
  name: string;
  domain?: string;
  template_patterns?: string[];
  confidence_threshold?: number;
  qr_verification_url?: string;
  is_active?: boolean;
}

export const GET = withRole(['admin', 'org_admin', 'super_admin'], async () => {
  const supabase = await createSupabaseServerClient();
  
  // NOTE: Trusted issuers are global resources (organization_id = NULL)
  // All admins can view trusted issuers regardless of organization
  const { data, error } = await supabase
    .from('trusted_issuers')
    .select('*')
    .is('organization_id', null) // Only global trusted issuers
    .order('name');

  if (error) {
    console.error('Error fetching trusted issuers:', error);
    throw apiError.internal(error.message);
  }

  return success(data);
});

export const POST = withRole(['admin', 'super_admin'], async (req: NextRequest) => {
  const result = await parseAndValidateBody<TrustedIssuerInput>(req, ['name']);
  if (result.error) return result.error;

  const body = result.data;

  const supabase = await createSupabaseServerClient();
  
  // NOTE: Trusted issuers are global resources (organization_id = NULL)
  // Only super_admin should create trusted issuers (global resources)
  const { data, error } = await supabase
    .from('trusted_issuers')
    .insert({
      name: body.name,
      domain: body.domain,
      template_patterns: body.template_patterns || [],
      confidence_threshold: body.confidence_threshold || 0.9,
      qr_verification_url: body.qr_verification_url,
      is_active: body.is_active !== undefined ? body.is_active : true,
      organization_id: null, // Global resource
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating trusted issuer:', error);
    throw apiError.internal(error.message);
  }

  return success(data, 'Trusted issuer created successfully', 201);
});

export const PUT = withRole(['admin', 'super_admin'], async (req: NextRequest) => {
  const result = await parseAndValidateBody<{ id: string } & TrustedIssuerInput>(req, ['id']);
  if (result.error) return result.error;

  const body = result.data;

  const supabase = await createSupabaseServerClient();
  
  // NOTE: Only update global trusted issuers (organization_id = NULL)
  const { data, error } = await supabase
    .from('trusted_issuers')
    .update({
      name: body.name,
      domain: body.domain,
      template_patterns: body.template_patterns,
      confidence_threshold: body.confidence_threshold,
      qr_verification_url: body.qr_verification_url,
      is_active: body.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .is('organization_id', null) // Only update global resources
    .select()
    .single();

  if (error) {
    console.error('Error updating trusted issuer:', error);
    throw apiError.internal(error.message);
  }

  return success(data, 'Trusted issuer updated successfully');
});

export const DELETE = withRole(['admin', 'super_admin'], async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  
  if (!id) {
    throw apiError.badRequest('Missing id parameter');
  }

  const supabase = await createSupabaseServerClient();
  
  // NOTE: Only delete global trusted issuers (organization_id = NULL)
  const { error } = await supabase
    .from('trusted_issuers')
    .delete()
    .eq('id', id)
    .is('organization_id', null); // Only delete global resources

  if (error) {
    console.error('Error deleting trusted issuer:', error);
    throw apiError.internal(error.message);
  }

  return success({ deleted: true }, 'Trusted issuer deleted successfully');
});

