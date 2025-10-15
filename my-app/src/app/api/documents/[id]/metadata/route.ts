import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/documents/[id]/metadata
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { id } = await params;
  
  const { data, error } = await supabase
    .from('document_metadata')
    .select('*')
    .eq('document_id', id)
    .maybeSingle();
  
  if (error && error.code !== 'PGRST116') {
    throw apiError.internal(error.message);
  }
  
  return success(data || null);
}

// POST /api/documents/[id]/metadata
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const body = await req.json();
  const { id } = await params;
  
  const { data, error } = await supabase
    .from('document_metadata')
    .upsert({
      document_id: id,
      ai_confidence_score: body.ai_confidence_score,
      verification_details: body.verification_details,
      extracted_fields: body.extracted_fields,
      updated_at: new Date().toISOString()
    }, { onConflict: 'document_id' })
    .select()
    .single();
  
  if (error) throw apiError.internal(error.message);
  return success(data);
}


