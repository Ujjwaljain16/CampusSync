import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, requireRole } from '@/lib/supabaseServer';
import type { TrustedIssuer } from '../../../../types';

export async function GET(_req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('trusted_issuers')
    .select('*')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await req.json().catch(() => null) as Partial<TrustedIssuer> | null;
  if (!body || !body.name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await req.json().catch(() => null) as { id: string } & Partial<TrustedIssuer> | null;
  if (!body || !body.id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('trusted_issuers')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true } });
}

