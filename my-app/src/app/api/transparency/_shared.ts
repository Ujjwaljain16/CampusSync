/**
 * Shared plumbing for the PUBLIC, read-only transparency log endpoints:
 * feature flag, rate limit, service-role access, strict query parsing,
 * error mapping and cache headers. (Not a route: Next ignores `_`-prefixed files.)
 */
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RateLimitPresets, enforceRateLimit } from '@/lib/rateLimit';
import { TlogError, isTransparencyLogEnabled } from '@/lib/transparencyLog';

/** Cache policies. Proofs for a fixed (index,treeSize) never change; heads and listings move with the log. */
export const CACHE = {
  head: 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
  listing: 'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
  immutable: 'public, max-age=3600, s-maxage=86400, immutable',
  none: 'no-store',
} as const;

/** Strict non-negative integer from a query string value: digits only, no sign/space/exponent, <= 15 digits. */
export function parseUintParam(raw: string | null): number | null {
  if (raw === null || !/^(?:0|[1-9]\d{0,14})$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

const json = (body: unknown, status: number, cache: string) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': cache } });

export async function runTlogRoute(
  request: Request,
  scope: string,
  handler: (db: SupabaseClient, url: URL) => Promise<{ body: unknown; cache: string }>
): Promise<Response> {
  if (!isTransparencyLogEnabled()) return json({ error: 'Not found' }, 404, CACHE.none);

  const limited = enforceRateLimit(request, `tlog:${scope}`, RateLimitPresets.relaxed);
  if (limited) return limited;

  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabaseServer');
    const db = (await createSupabaseAdminClient()) as unknown as SupabaseClient;
    const { body, cache } = await handler(db, new URL(request.url));
    return json(body, 200, cache);
  } catch (e) {
    if (e instanceof TlogError) {
      if (e.code === 'bad_request') return json({ error: e.message }, 400, CACHE.none);
      if (e.code === 'not_found') return json({ error: e.message }, 404, CACHE.none);
      if (e.code === 'integrity') console.error('[tlog] integrity error while serving', scope);
      return json({ error: 'Transparency log is unavailable' }, 503, CACHE.none);
    }
    console.error('[tlog] unexpected error while serving', scope, e instanceof Error ? e.name : 'unknown');
    return json({ error: 'Transparency log is unavailable' }, 503, CACHE.none);
  }
}
