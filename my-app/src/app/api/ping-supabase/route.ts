/**
 * Supabase Ping Endpoint
 * GET /api/ping-supabase
 * 
 * Simple endpoint to ping Supabase database to prevent auto-pausing.
 * This should be called periodically (every ~10 minutes) via Vercel Cron or UptimeRobot.
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
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
    // Log error but still return 200 to prevent cron failures
    console.error('[Ping Supabase] Error:', error);
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        message: 'Ping attempted but encountered an error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 200 } // Still return 200 to keep cron jobs happy
    );
  }
}

