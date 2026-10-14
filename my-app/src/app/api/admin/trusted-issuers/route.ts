import { NextRequest } from 'next/server';
import { withRole, withSuperAdmin, success, apiError, parseAndValidateBody, isUuid, writeAudit } from '@/lib/api';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';

interface TrustedIssuerInput {
  name: string;
  domain?: string;
  template_patterns?: string[];
  confidence_threshold?: number;
  qr_verification_url?: string;
  is_active?: boolean;
}

const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

type Cleaned = Partial<{
  name: string;
  domain: string | null;
  template_patterns: string[];
  confidence_threshold: number;
  qr_verification_url: string | null;
  is_active: boolean;
}>;

/** Validate the fields that are present; returns an error message or the cleaned fields. */
function validateIssuer(body: Partial<TrustedIssuerInput>, requireName: boolean): { error: string } | { value: Cleaned } {
  const out: Cleaned = {};

  if (body.name !== undefined || requireName) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) {
      return { error: 'name must be a non-empty string (max 200 characters)' };
    }
    out.name = body.name.trim();
  }
  if (body.domain !== undefined && body.domain !== null && body.domain !== '') {
    if (typeof body.domain !== 'string' || !HOSTNAME_RE.test(body.domain.trim())) {
      return { error: 'domain must be a valid hostname' };
    }
    out.domain = body.domain.trim().toLowerCase();
  }
  if (body.template_patterns !== undefined) {
    if (
      !Array.isArray(body.template_patterns) ||
      body.template_patterns.length > 50 ||
      body.template_patterns.some((p) => typeof p !== 'string' || p.length > 200)
    ) {
      return { error: 'template_patterns must be an array of up to 50 short strings' };
    }
    out.template_patterns = body.template_patterns;
  }
  if (body.confidence_threshold !== undefined) {
    const c = body.confidence_threshold;
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) {
      return { error: 'confidence_threshold must be a number between 0 and 1' };
    }
    out.confidence_threshold = c;
  }
  if (body.qr_verification_url !== undefined && body.qr_verification_url !== null && body.qr_verification_url !== '') {
    let url: URL | null = null;
    try {
      url = typeof body.qr_verification_url === 'string' ? new URL(body.qr_verification_url) : null;
    } catch {
      url = null;
    }
    if (!url || url.protocol !== 'https:' || body.qr_verification_url.length > 2048) {
      return { error: 'qr_verification_url must be a valid https URL' };
    }
    out.qr_verification_url = url.toString();
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return { error: 'is_active must be a boolean' };
    out.is_active = body.is_active;
  }
  return { value: out };
}

// Trusted issuers are GLOBAL resources (organization_id = NULL): every admin may read them...
export const GET = withRole(['admin', 'org_admin', 'super_admin'], async () => {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('trusted_issuers')
    .select('*')
    .is('organization_id', null) // Only global trusted issuers
    .order('name');

  if (error) {
    console.error('Error fetching trusted issuers:', error);
    return apiError.internal('Failed to fetch trusted issuers');
  }

  return success(data);
});

// ...but only a super_admin may change them (a tenant admin must not alter what
// every other tenant trusts).
export const POST = withSuperAdmin(async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<TrustedIssuerInput>(req, ['name']);
  if (result.error) return result.error;

  const cleaned = validateIssuer(result.data, true);
  if ('error' in cleaned) return apiError.validation(cleaned.error);
  const v = cleaned.value;

  const admin = await createSupabaseAdminClient();
  const { data, error } = await admin
    .from('trusted_issuers')
    .insert({
      name: v.name,
      domain: v.domain ?? null,
      template_patterns: v.template_patterns ?? [],
      confidence_threshold: v.confidence_threshold ?? 0.9,
      qr_verification_url: v.qr_verification_url ?? null,
      is_active: v.is_active ?? true,
      organization_id: null, // Global resource
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating trusted issuer:', error);
    return apiError.internal('Failed to create trusted issuer');
  }

  await writeAudit(admin, {
    actorId: user.id,
    action: 'trusted_issuer_create',
    targetType: 'trusted_issuer',
    targetId: data?.id ?? null,
    details: { name: v.name },
  });

  return success(data, 'Trusted issuer created successfully', 201);
});

export const PUT = withSuperAdmin(async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<{ id: string } & TrustedIssuerInput>(req, ['id']);
  if (result.error) return result.error;

  const body = result.data;
  if (!isUuid(body.id)) return apiError.validation('Invalid id');

  const cleaned = validateIssuer(body, false);
  if ('error' in cleaned) return apiError.validation(cleaned.error);

  const admin = await createSupabaseAdminClient();
  const { data, error } = await admin
    .from('trusted_issuers')
    .update({ ...cleaned.value, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .is('organization_id', null) // Only update global resources
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating trusted issuer:', error);
    return apiError.internal('Failed to update trusted issuer');
  }
  if (!data) return apiError.notFound('Trusted issuer not found');

  await writeAudit(admin, {
    actorId: user.id,
    action: 'trusted_issuer_update',
    targetType: 'trusted_issuer',
    targetId: body.id,
    details: { fields: Object.keys(cleaned.value) },
  });

  return success(data, 'Trusted issuer updated successfully');
});

export const DELETE = withSuperAdmin(async (req: NextRequest, { user }) => {
  const id = new URL(req.url).searchParams.get('id');

  if (!id) return apiError.badRequest('Missing id parameter');
  if (!isUuid(id)) return apiError.validation('Invalid id');

  const admin = await createSupabaseAdminClient();
  const { data, error } = await admin
    .from('trusted_issuers')
    .delete()
    .eq('id', id)
    .is('organization_id', null) // Only delete global resources
    .select('id');

  if (error) {
    console.error('Error deleting trusted issuer:', error);
    return apiError.internal('Failed to delete trusted issuer');
  }
  if (!data || data.length === 0) return apiError.notFound('Trusted issuer not found');

  await writeAudit(admin, {
    actorId: user.id,
    action: 'trusted_issuer_delete',
    targetType: 'trusted_issuer',
    targetId: id,
  });

  return success({ deleted: true }, 'Trusted issuer deleted successfully');
});
