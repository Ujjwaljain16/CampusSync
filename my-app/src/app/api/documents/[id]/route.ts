import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/documents/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', params.id)
    .single();
  
  if (error) throw apiError.notFound('Document not found');
  return success(data);
}

// PATCH /api/documents/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createSupabaseServerClient();
  const body = await req.json();
  
  const { data, error } = await supabase
    .from('documents')
    .update({
      title: body.title,
      institution: body.institution,
      issue_date: body.issue_date,
      verification_status: body.verification_status,
      metadata: body.metadata
    })
    .eq('id', params.id)
    .select()
    .single();
  
  if (error) throw apiError.internal(error.message);
  return success(data);
}


