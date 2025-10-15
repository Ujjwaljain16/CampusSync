import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { success, apiError } from '@/lib/api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');
  if (!documentId) throw apiError.badRequest('documentId required');

  const { data, error } = await supabase
    .from('document_metadata')
    .select('verification_details, ai_confidence_score')
    .eq('document_id', documentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return success({});

  const details = (data as Record<string, unknown>).verification_details as Record<string, unknown> || {};
  const out = {
    qr: details.qr || null,
    mrz: details.mrz || null,
    logo: details.logo || null,
    policy: details.policy || null,
    extracted: details.extracted || null,
    confidence: (data as Record<string, unknown>).ai_confidence_score ?? undefined
  };
  return success(out);
}


