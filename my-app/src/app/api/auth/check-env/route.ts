import { success } from '@/lib/api';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const configured = !!(supabaseUrl && supabaseAnonKey && 
    supabaseUrl !== 'your_supabase_project_url' && 
    supabaseAnonKey !== 'your_supabase_anon_key');
  
  return success({ 
    configured,
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlPlaceholder: supabaseUrl === 'your_supabase_project_url',
    keyPlaceholder: supabaseAnonKey === 'your_supabase_anon_key'
  });
}
