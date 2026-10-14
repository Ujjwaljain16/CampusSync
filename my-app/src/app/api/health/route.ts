/**
 * Health Check Endpoint
 * GET /api/health
 *
 * - 200 `ok`        everything works
 * - 200 `degraded`  site works, but an optional/feature dependency is missing
 *                   (Gemini key, VC issuer key, SMTP, ...)
 * - 503 `unhealthy` the site cannot serve users (Supabase not configured or
 *                   the database is unreachable)
 *
 * Production responses never include configuration details or error text.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { performHealthCheck } from '@/lib/runtimeEnvCheck';

const DB_PING_TIMEOUT_MS = 2000;

/**
 * Lightweight DB reachability check. Prefers the service-role key when configured so the
 * result does not depend on anon RLS policies for `organizations` (a head/count query only,
 * no rows are returned). Falls back to the anon key. Never throws.
 */
async function pingDatabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const query = supabase
      .from('organizations')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
      .abortSignal(controller.signal);

    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('timeout');
      }, DB_PING_TIMEOUT_MS);
    });

    const result = await Promise.race([Promise.resolve(query), timeout]);
    if (result === 'timeout') return false;
    return !result.error;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const isProd = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();

  try {
    const envCheck = performHealthCheck();

    // Only Supabase configuration is fatal. Gemini / VC issuer / SMTP / URL
    // problems degrade the specific feature, not the whole service.
    const fatalConfigFailed = envCheck.checks.some(
      (c) => c.status === 'fail' && c.name === 'Supabase Configuration'
    );
    // Optional extras (e.g. SMTP) only produce non-critical warnings and do not count as degraded
    const featureProblems = envCheck.checks.some((c) => c.critical && c.status !== 'pass');

    const databaseOk = fatalConfigFailed ? false : await pingDatabase();
    const healthy = !fatalConfigFailed && databaseOk;
    const status: 'ok' | 'degraded' | 'unhealthy' = !healthy
      ? 'unhealthy'
      : featureProblems
        ? 'degraded'
        : 'ok';

    const body: Record<string, unknown> = { status, healthy, timestamp };

    if (!isProd) {
      body.environment = envCheck.environment;
      body.database = databaseOk;
      body.checks = envCheck.checks;
      body.features = envCheck.features;
    }

    return NextResponse.json(body, { status: healthy ? 200 : 503 });
  } catch {
    return NextResponse.json(
      { status: 'unhealthy', healthy: false, timestamp },
      { status: 503 }
    );
  }
}
