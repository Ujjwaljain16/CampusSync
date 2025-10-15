import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { apiError, parseAndValidateBody } from '@/lib/api';

interface SetSessionBody {
  access_token: string;
  refresh_token: string;
}

export async function POST(request: NextRequest) {
  const result = await parseAndValidateBody<SetSessionBody>(request, ['access_token', 'refresh_token']);
  if (result.error) return result.error;

  const { access_token, refresh_token } = result.data;

  // Create response with cookie handling
  const response = NextResponse.json({ success: true });
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Set the session using the provided tokens
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) {
    console.error('Error setting session:', error);
    throw apiError.internal(error.message);
  }

  return response;
}
