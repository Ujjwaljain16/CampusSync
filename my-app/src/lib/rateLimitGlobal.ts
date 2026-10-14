/**
 * Global (cross-instance) rate limiter backed by Postgres.
 *
 * The in-memory limiter in `rateLimit.ts` keeps its counters per server
 * instance, so on serverless platforms it only slows abuse down. This module
 * keeps a fixed-window counter in `public.rate_limits` through the atomic
 * `public.rate_limit_hit` function (service role only), so every instance
 * shares the same counters. It is meant for the few high-value endpoints
 * (login completion, signup, email checks, OCR, public verification).
 *
 * Failure policy: FAIL OPEN. If the database call errors, times out or the
 * table / function does not exist yet, the request is never blocked because of
 * the infrastructure: the decision falls back to the in-memory limiter. After
 * repeated failures a short circuit breaker skips the database call so a
 * database problem does not add latency to every request.
 *
 * See docs/RATE-LIMITING.md.
 */
import { createHash } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { enforceRateLimit, getClientIp } from '@/lib/rateLimit';

export interface GlobalRateLimitConfig {
  /** Maximum requests per window. */
  limit: number;
  /** Window length in seconds (fixed windows aligned to the epoch). */
  windowSeconds: number;
}

/** Consecutive failures after which the database call is skipped. */
export const BREAKER_FAILURE_THRESHOLD = 3;
/** How long the breaker stays open, in milliseconds. */
export const BREAKER_OPEN_MS = 30_000;
/** Per-call timeout for the database round trip, in milliseconds. */
export const RPC_TIMEOUT_MS = 800;

let consecutiveFailures = 0;
let breakerOpenUntil = 0;

/** Test helper (not used by application code). */
export function __resetGlobalRateLimiter(): void {
  consecutiveFailures = 0;
  breakerOpenUntil = 0;
}

/** Test helper (not used by application code). */
export function __globalRateLimiterState(): { failures: number; openUntil: number } {
  return { failures: consecutiveFailures, openUntil: breakerOpenUntil };
}

/** `scope:` + SHA-256 of the identity, so IPs and e-mail addresses never reach the table in clear. */
export function globalRateLimitKey(scope: string, identity: string): string {
  return `${scope}:${createHash('sha256').update(`rl1:${scope}:${identity}`).digest('hex')}`;
}

interface HitRow {
  allowed: boolean;
  remaining: number;
  reset_at: string;
}

function parseRow(data: unknown): HitRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.allowed !== 'boolean') return null;
  return {
    allowed: r.allowed,
    remaining: typeof r.remaining === 'number' ? r.remaining : 0,
    reset_at: typeof r.reset_at === 'string' ? r.reset_at : '',
  };
}

function withTimeout<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rate limit rpc timed out after ${ms}ms`)), ms);
    Promise.resolve(work).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.max(1, retryAfterSeconds)) },
  });
}

function recordFailure(scope: string, reason: unknown): void {
  consecutiveFailures += 1;
  const message = reason instanceof Error ? reason.message : String((reason as { message?: unknown })?.message ?? reason);
  if (consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_OPEN_MS;
  }
  console.warn(
    `[rate-limit] global limiter unavailable for "${scope}" (${consecutiveFailures} consecutive failures)` +
      (consecutiveFailures >= BREAKER_FAILURE_THRESHOLD ? `; skipping it for ${BREAKER_OPEN_MS / 1000}s` : '') +
      `: ${message}`
  );
}

/**
 * Enforce a global fixed-window limit. Returns a 429 Response when the limit is
 * exceeded, or null when the request may proceed. Never throws.
 *
 * @param scope      route / purpose label (part of the counter key)
 * @param config     limit per window and window length in seconds
 * @param identifier overrides the client IP (e.g. user id or e-mail address)
 */
export async function enforceGlobalRateLimit(
  request: Request,
  scope: string,
  config: GlobalRateLimitConfig,
  identifier?: string
): Promise<Response | null> {
  const identity = identifier ?? getClientIp(request);

  const fallback = (): Response | null =>
    enforceRateLimit(
      request,
      `global:${scope}`,
      { interval: config.windowSeconds * 1000, uniqueTokenPerInterval: config.limit },
      identity
    );

  try {
    if (Date.now() < breakerOpenUntil) return fallback();

    const admin = await createSupabaseAdminClient();
    const { data, error } = await withTimeout(
      admin.rpc('rate_limit_hit', {
        p_key: globalRateLimitKey(scope, identity),
        p_window_seconds: config.windowSeconds,
        p_limit: config.limit,
      }),
      RPC_TIMEOUT_MS
    );
    if (error) {
      recordFailure(scope, error);
      return fallback();
    }
    const row = parseRow(data);
    if (!row) {
      recordFailure(scope, new Error('unexpected rate_limit_hit response'));
      return fallback();
    }

    consecutiveFailures = 0;
    breakerOpenUntil = 0;
    if (row.allowed) return null;

    const resetMs = Date.parse(row.reset_at);
    const retryAfter = Number.isFinite(resetMs)
      ? Math.ceil((resetMs - Date.now()) / 1000)
      : config.windowSeconds;
    return tooManyRequests(Math.min(retryAfter, config.windowSeconds));
  } catch (err) {
    recordFailure(scope, err);
    try {
      return fallback();
    } catch {
      return null;
    }
  }
}
