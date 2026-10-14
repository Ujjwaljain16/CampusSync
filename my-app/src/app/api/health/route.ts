/**
 * Health Check Endpoint
 * GET /api/health          cheap liveness + configuration check (no database call)
 * GET /api/health?deep=1   also pings the database; use this URL for the uptime monitor
 *
 * Shallow:
 * - 200 `ok`        everything configured
 * - 200 `degraded`  site works, but an optional/feature dependency is missing
 *                   (Gemini key, VC issuer key, SMTP, ...)
 * - 503 `unhealthy` the site cannot serve users (Supabase is not configured)
 *
 * Deep (`?deep=1`):
 * - 200 `ok` / `degraded` as above, after a successful database ping
 * - 503 `degraded` when the database ping fails, times out (1.5 s) or Supabase is not configured
 *
 * Production responses never include configuration details or error text.
 */

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { performHealthCheck } from '@/lib/runtimeEnvCheck';

const DB_PING_TIMEOUT_MS = 1500;
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Bounded DB reachability check through the service-role client (so it does not depend on
 * RLS policies): selects at most one row from `organizations`. Never throws.
 */
async function pingDatabase(): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const supabase = await createSupabaseAdminClient();

    const query = supabase
      .from('organizations')
      .select('id')
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

export async function GET(request?: Request) {
  const isProd = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();

  try {
    let deep = false;
    if (request?.url) {
      try {
        const flag = new URL(request.url).searchParams.get('deep');
        deep = flag === '1' || flag === 'true';
      } catch {
        deep = false;
      }
    }

    const envCheck = performHealthCheck();

    // Only Supabase configuration is fatal. Gemini / VC issuer / SMTP / URL
    // problems degrade the specific feature, not the whole service.
    const fatalConfigFailed = envCheck.checks.some(
      (c) => c.status === 'fail' && c.name === 'Supabase Configuration'
    );
    // Optional extras (e.g. SMTP) only produce non-critical warnings and do not count as degraded
    const featureProblems = envCheck.checks.some((c) => c.critical && c.status !== 'pass');

    let databaseOk: boolean | undefined;
    if (deep) databaseOk = fatalConfigFailed ? false : await pingDatabase();

    let status: 'ok' | 'degraded' | 'unhealthy';
    let healthy: boolean;
    if (deep && !databaseOk) {
      status = 'degraded';
      healthy = false;
    } else if (fatalConfigFailed) {
      status = 'unhealthy';
      healthy = false;
    } else {
      status = featureProblems ? 'degraded' : 'ok';
      healthy = true;
    }

    const body: Record<string, unknown> = { status, healthy, timestamp };

    if (!isProd) {
      body.environment = envCheck.environment;
      if (databaseOk !== undefined) body.database = databaseOk;
      body.checks = envCheck.checks;
      body.features = envCheck.features;
    }

    return NextResponse.json(body, { status: healthy ? 200 : 503, headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { status: 'unhealthy', healthy: false, timestamp },
      { status: 503, headers: NO_STORE }
    );
  }
}
