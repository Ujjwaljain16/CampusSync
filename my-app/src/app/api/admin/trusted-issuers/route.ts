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

export const GET = withRole(['admin'], async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('trusted_issuers')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching trusted issuers:', error);
    throw apiError.internal(error.message);
  }

  return success(data);
});

export const POST = withRole(['admin'], async (req: NextRequest) => {
  const result = await parseAndValidateBody<TrustedIssuerInput>(req, ['name']);
  if (result.error) return result.error;

  const body = result.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('trusted_issuers')
    .insert({
      name: body.name,
      domain: body.domain,
      template_patterns: body.template_patterns || [],
      confidence_threshold: body.confidence_threshold || 0.9,
      qr_verification_url: body.qr_verification_url,
      is_active: body.is_active !== undefined ? body.is_active : true,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating trusted issuer:', error);
    throw apiError.internal(error.message);
  }

  return success(data, 'Trusted issuer created successfully', 201);
});

export const PUT = withRole(['admin'], async (req: NextRequest) => {
  const result = await parseAndValidateBody<{ id: string } & TrustedIssuerInput>(req, ['id']);
  if (result.error) return result.error;

  const body = result.data;

  const supabase = await createSupabaseServerClient();
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
    .select()
    .single();

  if (error) {
    console.error('Error updating trusted issuer:', error);
    throw apiError.internal(error.message);
  }

  return success(data, 'Trusted issuer updated successfully');
});

export const DELETE = withRole(['admin'], async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  
  if (!id) {
    throw apiError.badRequest('Missing id parameter');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('trusted_issuers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting trusted issuer:', error);
    throw apiError.internal(error.message);
  }

  return success({ deleted: true }, 'Trusted issuer deleted successfully');
});

