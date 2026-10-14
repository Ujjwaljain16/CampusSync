/**
 * Supabase Ping Endpoint
 * GET /api/ping-supabase
 *
 * Simple endpoint to ping Supabase database to prevent auto-pausing.
 * Configure UptimeRobot to call this endpoint every ~10 minutes.
 *
 * Returns 200 only when the query actually succeeded; otherwise 503 with a
 * generic body (no error text), so monitors alert on real failures.
 *
 * Setup in UptimeRobot:
 * - Monitor Type: HTTP(s)
 * - URL: https://your-domain.com/api/ping-supabase
 * - Interval: 10 minutes
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function failure() {
  return NextResponse.json(
    {
      success: false,
      timestamp: new Date().toISOString(),
      message: 'Supabase ping failed',
    },
    { status: 503 }
  );
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[Ping Supabase] Missing Supabase environment variables');
      return failure();
    }

    // Use direct client (no cookies) for UptimeRobot compatibility
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Lightweight query that keeps the database active
    const { error } = await supabase
      .from('organizations')
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    if (error) {
      console.error('[Ping Supabase] Query failed:', error.code ?? 'unknown');
      return failure();
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
    console.error('[Ping Supabase] Error:', error instanceof Error ? error.name : 'unknown');
    return failure();
  }
}
