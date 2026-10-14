// @vitest-environment node
/**
 * Route inventory / security guard rails.
 *
 * Every `src/app/api/**\/route.ts` must either:
 *   (a) contain a recognised authentication/authorization guard, or
 *   (b) be listed in PUBLIC_ROUTES below with a one-line justification.
 *
 * Note: `/api/*` is excluded from the Next.js middleware matcher, so each route
 * is responsible for its own authentication. This test is a coarse tripwire, not a
 * proof of correctness: it only checks that a guard token appears in the file.
 *
 * MERGE-TIME MAINTENANCE: when a route is added/removed or gains/loses a guard, update
 * PUBLIC_ROUTES. The failure messages below list exactly which files to touch.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');
const API_DIR = join(SRC, 'app', 'api');

/** Route (path under src/app/api, without `/route.ts`) -> why it is intentionally unguarded. */
const PUBLIC_ROUTES: Record<string, string> = {
  'admin/impersonate': 'Disabled stub: every method returns 404, no logic.',
  'auth/check-email': 'Pre-login flow: reports whether an email is registered (rate limited).',
  'auth/check-env': 'Reports only booleans about public Supabase config presence; no secrets.',
  'auth/check-user-exists': 'Pre-login/signup flow: existence check by email (rate limited).',
  'auth/dev-upsert-user': 'Development helper; returns early unless NODE_ENV === "development".',
  'auth/oauth/google': 'OAuth sign-in entry point; unauthenticated by nature.',
  'auth/resend-confirmation': 'Pre-login flow: resend signup confirmation email.',
  'auth/signout': 'Sign-out must work for any caller; only clears the caller session.',
  'auth/signup/recruiter': 'Public sign-up for recruiters.',
  'auth/signup/student-faculty': 'Public sign-up for students/faculty.',
  'auth/validate-email': 'Pre-signup email format/domain validation; no data access.',
  'certificates/verify': 'Public verification of a credential JWS (rate limited); returns validity only.',
  'diagnose': 'Connectivity diagnostics; public (review: consider restricting in production).',
  'health': 'Liveness probe for uptime monitors.',
  'health/detailed': 'Returns 404 in production; development-only diagnostics.',
  'recruiter/bulk-verify': 'Retired: returns 410 Gone and never touches the database (recruiters must not change verification status).',
  'ping-supabase':'Keep-alive ping for external uptime monitors; no user data.',
  'public/portfolio/[userId]': 'Public student portfolio by design (review: expose only opted-in fields).',
  'recruiter/verify-credential': 'Public credential verification by JWS/VC (rate limited).',
  'vcs/verify': 'Public credential verification endpoint (rate limited).',
};

/** Substrings/regexes whose presence in a route file counts as an auth guard. */
const GUARDS: RegExp[] = [
  /withAuth\(/,
  /withRole\(/,
  /withErrorHandler\(/,
  /requireRole\(/,
  /getServerUserWithRole\(/,
  /supabase\.auth\.getUser\(/i, // also matches authSupabase.auth.getUser(
  /WEBHOOK_SECRET/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const posix = (p: string) => p.split(sep).join('/');
const read = (p: string) => readFileSync(p, 'utf8');

const routeFiles = walk(API_DIR).filter((f) => /[\\/]route\.ts$/.test(f));
const routeKey = (f: string) => posix(relative(API_DIR, f)).replace(/\/?route\.ts$/, '');
const routes = routeFiles.map((file) => ({ file, key: routeKey(file), src: read(file) }));

describe('API route inventory', () => {
  it('finds route handlers (sanity check on the glob)', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('every route is guarded or explicitly listed in PUBLIC_ROUTES', () => {
    const offenders = routes
      .filter((r) => !GUARDS.some((g) => g.test(r.src)) && !(r.key in PUBLIC_ROUTES))
      .map((r) => `src/app/api/${r.key}/route.ts`);
    expect(
      offenders,
      `Unguarded routes not in PUBLIC_ROUTES. Add a guard (withAuth/withRole/...) or, if public by design, ` +
        `add an entry with a justification to tests/security/route-inventory.test.ts:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });

  it('PUBLIC_ROUTES has no stale entries (route removed)', () => {
    const existing = new Set(routes.map((r) => r.key));
    const stale = Object.keys(PUBLIC_ROUTES).filter((k) => !existing.has(k));
    expect(
      stale,
      `PUBLIC_ROUTES entries with no matching route file; remove them:\n  ${stale.join('\n  ')}`
    ).toEqual([]);
  });

  it('PUBLIC_ROUTES entries each carry a justification', () => {
    const empty = Object.entries(PUBLIC_ROUTES)
      .filter(([, why]) => why.trim().length < 10)
      .map(([k]) => k);
    expect(empty, `Missing justification for:\n  ${empty.join('\n  ')}`).toEqual([]);
  });

  it('PUBLIC_ROUTES entries that gained a guard are removed from the allowlist', () => {
    const redundant = routes
      .filter((r) => r.key in PUBLIC_ROUTES && GUARDS.some((g) => g.test(r.src)))
      .map((r) => r.key);
    expect(
      redundant,
      `These routes are now guarded; delete them from PUBLIC_ROUTES:\n  ${redundant.join('\n  ')}`
    ).toEqual([]);
  });

  it('no route file uses dangerouslySetInnerHTML', () => {
    const offenders = routes.filter((r) => r.src.includes('dangerouslySetInnerHTML')).map((r) => r.key);
    expect(offenders, `dangerouslySetInnerHTML in routes:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});

describe('client-side secret exposure', () => {
  // Only actual env reads count; instructional text (e.g. the /setup page's .env sample) does not.
  const SERVICE_KEY_USE = /process\.env(?:\.SUPABASE_SERVICE_ROLE_KEY|\[\s*['"`]SUPABASE_SERVICE_ROLE_KEY)/;
  const srcFiles = walk(SRC).filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));

  it('service-role key is never referenced from pages or components', () => {
    const offenders = srcFiles
      .filter((f) => {
        const p = posix(relative(SRC, f));
        return /^app\/(?:.*\/)?page\.tsx$/.test(p) || p.startsWith('components/');
      })
      .filter((f) => SERVICE_KEY_USE.test(read(f)))
      .map((f) => posix(relative(ROOT, f)));
    expect(offenders, `process.env.SUPABASE_SERVICE_ROLE_KEY used in client-facing files:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('no NEXT_PUBLIC_ variable name contains SERVICE, SECRET or PRIVATE', () => {
    const re = /NEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE|SECRET|PRIVATE)[A-Z0-9_]*/g;
    const files = [...srcFiles, join(ROOT, 'next.config.ts'), join(ROOT, '.env.example')];
    const hits: string[] = [];
    for (const f of files) {
      let text: string;
      try {
        text = read(f);
      } catch {
        continue; // file may not exist
      }
      const m = text.match(re);
      if (m) hits.push(`${posix(relative(ROOT, f))}: ${[...new Set(m)].join(', ')}`);
    }
    expect(hits, `Browser-exposed env var names that look secret:\n  ${hits.join('\n  ')}`).toEqual([]);
  });
});
