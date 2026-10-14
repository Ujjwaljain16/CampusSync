/**
 * Minimal alerting: POST a compact, redacted JSON message to a chat webhook.
 *
 * - Configured by the optional env var ALERT_WEBHOOK_URL (https only). Without it every
 *   function here is a no-op.
 * - Fire-and-forget: never throws, never blocks the caller, 2 s network timeout.
 * - Throttled per instance: the same fingerprint at most once per 5 minutes, and at most
 *   20 alerts per 10 minutes overall. Alerts dropped by the throttle are counted and
 *   reported as "suppressed N" on the next alert that is allowed through.
 * - Privacy: the message is redacted (emails, JWTs, bearer tokens, API keys, long secrets,
 *   query strings) and truncated. Stacks, headers, request bodies and the `context` objects
 *   passed to logger.error are never sent.
 *
 * This module must not import the logger (the logger imports this module).
 */

export type AlertLevel = 'error' | 'warning' | 'info';

export interface AlertContext {
  /** Route pattern or path, e.g. "/api/certificates/[id]". Query strings are stripped. */
  route?: string;
  requestId?: string;
  /** HTTP status when known. Statuses below 500 are treated as expected and not alerted. */
  status?: number;
  /** Extra short labels (e.g. routerKind, routeType) appended to the payload. */
  routerKind?: string;
  routeType?: string;
  /** Message of the logger.error call, used when no Error object was supplied. */
  logMessage?: string;
}

export interface AlertPayload {
  text: string;
  level: AlertLevel;
  service: 'campussync';
  env: string;
  time: string;
  route?: string;
  requestId?: string;
  errorName: string;
  message: string;
  fingerprint: string;
  routerKind?: string;
  routeType?: string;
  suppressed?: number;
  content?: string;
}

export const ALERT_FINGERPRINT_WINDOW_MS = 5 * 60 * 1000;
export const ALERT_GLOBAL_WINDOW_MS = 10 * 60 * 1000;
export const ALERT_GLOBAL_CAP = 20;
export const ALERT_TIMEOUT_MS = 2000;
export const ALERT_MESSAGE_MAX = 500;

const MAX_TRACKED_FINGERPRINTS = 200;

const lastSentByFingerprint = new Map<string, number>();
let sentTimes: number[] = [];
let suppressedCount = 0;

/** Test helper: forget throttle state. */
export function resetAlertState(): void {
  lastSentByFingerprint.clear();
  sentTimes = [];
  suppressedCount = 0;
}

/** Returns the webhook URL only when configured and https, otherwise null. */
function getWebhookUrl(): URL | null {
  const raw = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const REDACTED = '[redacted]';

function looksLikeSecret(token: string): boolean {
  if (/^[a-f0-9]+$/i.test(token)) return true; // long hex
  return /\d/.test(token) && /[a-z]/.test(token) && /[A-Z]/.test(token); // mixed base64-ish
}

/** Strip anything that could carry personal data or credentials from a free-text message. */
export function redactMessage(input: string): string {
  let s = input;
  // JWTs (and any eyJ... blob, e.g. a JWK or truncated token)
  s = s.replace(/eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*){0,2}/g, REDACTED);
  // Authorization header values
  s = s.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  s = s.replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}/g, `Basic ${REDACTED}`);
  // Connection strings
  s = s.replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/gi, REDACTED);
  // key=value / key: value for sensitive names
  s = s.replace(
    /\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|service[_-]?role[_-]?key|access[_-]?key)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    `$1$2${REDACTED}`
  );
  // Supabase / vendor key formats
  s = s.replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, REDACTED);
  s = s.replace(/\bsbp_[A-Za-z0-9]{20,}/g, REDACTED);
  s = s.replace(/\b(?:sk|pk|rk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{20,}/g, REDACTED);
  s = s.replace(/\bAIza[A-Za-z0-9_-]{30,}/g, REDACTED);
  // Query strings (absolute URLs and relative paths)
  s = s.replace(/(https?:\/\/[^\s?#"'<>]+)\?[^\s"'<>]*/gi, `$1?${REDACTED}`);
  s = s.replace(/(\/[A-Za-z0-9_\-./[\]]*)\?[^\s"'<>]+/g, `$1?${REDACTED}`);
  // Emails
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, REDACTED);
  // Long hex / base64-looking secrets
  s = s.replace(/[A-Za-z0-9+_=-]{32,}/g, (m) => (looksLikeSecret(m) ? REDACTED : m));
  return s;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

function cleanLabel(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const stripped = redactMessage(String(s).split('?')[0]).replace(/[\r\n\t]+/g, ' ').trim();
  return stripped ? truncate(stripped, max) : undefined;
}

// ---------------------------------------------------------------------------
// Fingerprints and throttling
// ---------------------------------------------------------------------------

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** First "at ..." frame of a stack with line/column numbers removed (stable across deploys of the same code). */
function firstFrame(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const line = stack.split('\n').find((l) => /^\s*at\s/.test(l));
  return line ? line.trim().replace(/:\d+(?::\d+)?\)?$/, '') : undefined;
}

function computeFingerprint(name: string, frame: string | undefined, route: string | undefined, seed: string): string {
  const basis = frame ?? route ?? seed.replace(/\d+/g, '#').slice(0, 100);
  return fnv1a(`${name}|${basis}`);
}

/** Decide whether an alert may be sent now; records it when allowed. Returns the suppressed count to attach. */
function admit(fingerprint: string, now: number): { ok: boolean; suppressed: number } {
  sentTimes = sentTimes.filter((t) => now - t < ALERT_GLOBAL_WINDOW_MS);

  const last = lastSentByFingerprint.get(fingerprint);
  const duplicate = last !== undefined && now - last < ALERT_FINGERPRINT_WINDOW_MS;
  if (duplicate || sentTimes.length >= ALERT_GLOBAL_CAP) {
    suppressedCount += 1;
    return { ok: false, suppressed: 0 };
  }

  if (lastSentByFingerprint.size >= MAX_TRACKED_FINGERPRINTS) {
    for (const [fp, t] of lastSentByFingerprint) {
      if (now - t >= ALERT_FINGERPRINT_WINDOW_MS) lastSentByFingerprint.delete(fp);
    }
    if (lastSentByFingerprint.size >= MAX_TRACKED_FINGERPRINTS) lastSentByFingerprint.clear();
  }

  lastSentByFingerprint.set(fingerprint, now);
  sentTimes.push(now);
  const suppressed = suppressedCount;
  suppressedCount = 0;
  return { ok: true, suppressed };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

function deliver(url: URL, payload: AlertPayload): void {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
    const done = () => clearTimeout(timer);
    Promise.resolve(
      fetch(url.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: 'no-store',
      })
    ).then(done, done).catch(() => {});
  } catch {
    // never throw into the caller
  }
}

function send(
  level: AlertLevel,
  errorName: string,
  rawMessage: string,
  fingerprint: string,
  ctx: AlertContext
): void {
  const url = getWebhookUrl();
  if (!url) return;

  const { ok, suppressed } = admit(fingerprint, Date.now());
  if (!ok) return;

  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
  const route = cleanLabel(ctx.route, 200);
  const requestId = cleanLabel(ctx.requestId, 64);
  const message = truncate(redactMessage(rawMessage).replace(/[\r\n]+/g, ' '), ALERT_MESSAGE_MAX);

  let text = `[campussync/${env}] ${level.toUpperCase()} ${errorName}${route ? ` at ${route}` : ''}: ${message}`;
  if (suppressed > 0) text += ` (suppressed ${suppressed} similar alerts since the last one)`;

  const payload: AlertPayload = {
    text,
    level,
    service: 'campussync',
    env,
    time: new Date().toISOString(),
    ...(route ? { route } : {}),
    ...(requestId ? { requestId } : {}),
    errorName,
    message,
    fingerprint,
    ...(ctx.routerKind ? { routerKind: cleanLabel(ctx.routerKind, 40) } : {}),
    ...(ctx.routeType ? { routeType: cleanLabel(ctx.routeType, 40) } : {}),
    ...(suppressed > 0 ? { suppressed } : {}),
  };
  // Discord incoming webhooks read `content`, Slack and generic JSON hooks read `text`.
  if (/(^|\.)discord(app)?\.com$/i.test(url.hostname)) payload.content = text;

  deliver(url, payload);
}

function statusOf(error: unknown, ctx: AlertContext): number | undefined {
  if (typeof ctx.status === 'number') return ctx.status;
  if (typeof Response !== 'undefined' && error instanceof Response) return error.status;
  if (error && typeof error === 'object') {
    const e = error as { status?: unknown; statusCode?: unknown };
    if (typeof e.status === 'number') return e.status;
    if (typeof e.statusCode === 'number') return e.statusCode;
  }
  return undefined;
}

/**
 * Report an unexpected error. Expected client errors (anything with a 4xx status, including
 * Response objects thrown by withAuth/validation) are ignored. Never throws.
 */
export function reportError(error: unknown, context: AlertContext = {}): void {
  try {
    if (typeof window !== 'undefined') return; // server only
    if (!getWebhookUrl()) return;

    const status = statusOf(error, context);
    if (status !== undefined && status < 500) return;

    if (typeof Response !== 'undefined' && error instanceof Response) {
      const name = 'HttpResponse';
      const fingerprint = computeFingerprint(name, undefined, context.route, String(error.status));
      send('error', name, `HTTP ${error.status}`, fingerprint, context);
      return;
    }

    if (error instanceof Error) {
      const name = cleanLabel(error.name, 80) || 'Error';
      const fingerprint = computeFingerprint(name, firstFrame(error.stack), context.route, error.message);
      send('error', name, error.message || context.logMessage || name, fingerprint, context);
      return;
    }

    // Not an Error object: a bare logger.error(message) or a thrown string/object.
    const detail = typeof error === 'string' ? error : error === undefined || error === null ? '' : safeString(error);
    const message = [context.logMessage, detail].filter(Boolean).join(': ') || 'Unknown error';
    const name = 'LoggedError';
    const fingerprint = computeFingerprint(name, undefined, undefined, context.logMessage || message);
    send('error', name, message, fingerprint, context);
  } catch {
    // never throw
  }
}

function safeString(v: unknown): string {
  try {
    if (typeof v === 'object') return JSON.stringify(v) ?? String(v);
    return String(v);
  } catch {
    return 'unserializable value';
  }
}

export interface AlertEventData {
  level?: AlertLevel;
  message?: string;
  route?: string;
  requestId?: string;
}

/** Report a notable non-exception event (e.g. a failed batch job). Only whitelisted fields are sent. */
export function reportEvent(name: string, data: AlertEventData = {}): void {
  try {
    if (typeof window !== 'undefined') return;
    if (!getWebhookUrl()) return;
    const eventName = cleanLabel(name, 80) || 'event';
    const level: AlertLevel = data.level === 'error' || data.level === 'info' ? data.level : 'warning';
    const fingerprint = fnv1a(`event|${eventName}`);
    send(level, eventName, data.message ?? eventName, fingerprint, {
      route: data.route,
      requestId: data.requestId,
    });
  } catch {
    // never throw
  }
}
