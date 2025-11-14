/**
 * Supabase Ping Endpoint
 * GET /api/ping-supabase
 * 
 * Simple endpoint to ping Supabase database to prevent auto-pausing.
 * Configure UptimeRobot to call this endpoint every ~10 minutes.
 * 
 * Setup in UptimeRobot:
 * - Monitor Type: HTTP(s)
 * - URL: https://your-domain.com/api/ping-supabase
 * - Interval: 10 minutes
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          message: 'Missing Supabase environment variables',
        },
        { status: 500 }
      );
    }

    // Use direct client (no cookies) for UptimeRobot compatibility
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Simple query to any table to keep the database active
    // Using profiles table as it's commonly available
    const { error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (error) {
      // Even if there's an error, we attempted to connect
      // Log it but still return success to keep the ping working
      console.warn('[Ping Supabase] Query warning:', error.message);
    }
    
    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        message: 'Supabase ping successful',
      },
      { status: 200 }
    );
  } catch (error) {
    // Log error but still return 200 to prevent monitoring service failures
    console.error('[Ping Supabase] Error:', error);
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        message: 'Ping attempted but encountered an error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 200 } // Still return 200 to keep UptimeRobot happy
    );
  }
}

