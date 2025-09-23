import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const diagnostics = {
    environment: {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      urlValue: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 20) + '...',
      isPlaceholder: process.env.NEXT_PUBLIC_SUPABASE_URL === 'your_supabase_project_url'
    },
    supabase: {
      connection: false,
      auth: false,
      database: false,
      error: null as string | null
    }
  };

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      diagnostics.supabase.error = 'Missing environment variables';
      return NextResponse.json(diagnostics);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    diagnostics.supabase.connection = true;

    // Test auth
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (!authError) {
        diagnostics.supabase.auth = true;
      } else {
        diagnostics.supabase.error = `Auth error: ${authError.message}`;
      }
    } catch (authErr) {
      diagnostics.supabase.error = `Auth error: ${authErr instanceof Error ? authErr.message : 'Unknown'}`;
    }

    // Test database
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('count')
        .limit(1);
      
      if (!error) {
        diagnostics.supabase.database = true;
      } else {
        let errorType = 'Database error';
        let solution = 'This usually means the database migrations haven\'t been run.';
        
        if (error.message.includes('infinite recursion detected in policy')) {
          errorType = 'Policy Recursion Error';
          solution = 'The RLS policies are causing infinite recursion. Run the policy fix migration (003_fix_recursion_completely.sql).';
        } else if (error.message.includes('relation "user_roles" does not exist')) {
          errorType = 'Missing Table Error';
          solution = 'The user_roles table doesn\'t exist. Run the database migrations starting with 001_create_user_roles.sql.';
        } else if (error.message.includes('permission denied')) {
          errorType = 'Permission Error';
          solution = 'Database permissions are not set correctly. Check RLS policies.';
        }
        
        diagnostics.supabase.error = `${errorType}: ${error.message}. ${solution}`;
      }
    } catch (dbErr) {
      diagnostics.supabase.error = `Database error: ${dbErr instanceof Error ? dbErr.message : 'Unknown'}`;
    }

  } catch (error) {
    diagnostics.supabase.error = `Connection error: ${error instanceof Error ? error.message : 'Unknown'}`;
  }

  return NextResponse.json(diagnostics);
}
