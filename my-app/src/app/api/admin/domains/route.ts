import { NextRequest } from 'next/server';
import { withAuth, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

interface AddDomainBody {
  domain: string;
  description?: string;
}

// GET - Fetch allowed domains
export const GET = withAuth(async () => {
  const supabase = await createSupabaseServerClient();
  
  const { data: domains, error } = await supabase
    .from('allowed_domains')
    .select('*')
    .order('domain', { ascending: true });

  if (error) {
    console.error('Error fetching domains:', error);
    throw apiError.internal(error.message);
  }

  return success({ domains });
});

// POST - Add new domain
export const POST = withAuth(async (req: NextRequest) => {
  const result = await parseAndValidateBody<AddDomainBody>(req, ['domain']);
  if (result.error) return result.error;

  const { domain, description } = result.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('allowed_domains')
    .insert({
      domain: domain.toLowerCase().trim(),
      description: description || '',
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding domain:', error);
    throw apiError.internal(error.message);
  }

  return success(data, 'Domain added successfully', 201);
});

// DELETE - Remove domain
export const DELETE = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');

  if (!domain) {
    throw apiError.badRequest('Domain is required');
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('allowed_domains')
    .delete()
    .eq('domain', domain);

  if (error) {
    console.error('Error deleting domain:', error);
    throw apiError.internal(error.message);
  }

  return success({ message: 'Domain removed successfully' });
});

