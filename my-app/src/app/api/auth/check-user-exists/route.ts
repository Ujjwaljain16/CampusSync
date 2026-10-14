import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rateLimit';
import { createClient } from '@supabase/supabase-js';
import { findAuthUserByEmail } from '@/lib/auth/findUserByEmail';

export async function POST(request: NextRequest) {
  // Account-enumeration surface: keep it tightly rate limited
  const limited = enforceRateLimit(request, 'check-user-exists', { interval: 60 * 1000, uniqueTokenPerInterval: 10 });
  if (limited) return limited;

  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Create admin client to check auth.users table
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Paginated lookup (listUsers() alone only returns the first page)
    let userExists: boolean;
    try {
      userExists = !!(await findAuthUserByEmail(supabaseAdmin, email));
    } catch (lookupError) {
      console.error('Error checking user:', lookupError);
      return NextResponse.json(
        { error: 'Failed to check user' },
        { status: 500 }
      );
    }

    return NextResponse.json({ exists: userExists });

  } catch (error) {
    console.error('Error in check-user-exists:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
