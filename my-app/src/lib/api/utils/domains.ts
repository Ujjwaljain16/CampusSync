/**
 * Allowed e-mail domain validation + anti-squatting.
 *
 * Domains decide who may sign up into an organization, so they must be
 * (a) well-formed, (b) never a public mail provider / public suffix, and
 * (c) claimed by at most one organization.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Public mail providers: claiming one would let anyone join the organization. */
export const PUBLIC_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'ymail.com',
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'pm.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru',
  'rediffmail.com', 'qq.com', '163.com', '126.com', 'tutanota.com', 'fastmail.com',
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com',
]);

/** Public suffixes that must never be claimed as a whole. */
const PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk', 'ac.uk', 'org.uk', 'gov.uk', 'com.au', 'edu.au', 'ac.in', 'co.in', 'edu.in',
  'ac.jp', 'co.jp', 'ac.nz', 'co.nz', 'edu.pk', 'ac.za', 'co.za', 'com.br', 'edu.br',
  'com.cn', 'edu.cn', 'ac.kr', 'co.kr',
]);

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type DomainCheck =
  | { ok: true; domain: string; wildcard: boolean }
  | { ok: false; error: string };

/**
 * Normalize + validate a domain entry.
 * Accepts `example.edu` or `*.example.edu` (wildcard only as a leading `*.`
 * followed by a registrable domain with at least two labels).
 */
export function validateDomain(input: unknown): DomainCheck {
  if (typeof input !== 'string') return { ok: false, error: 'Domain must be a string' };
  const domain = input.trim().toLowerCase();
  if (!domain || domain.length > 253) return { ok: false, error: 'Invalid domain' };

  const wildcard = domain.startsWith('*.');
  const base = wildcard ? domain.slice(2) : domain;

  if (base.includes('*')) return { ok: false, error: 'Wildcards are only allowed as a leading "*."' };
  if (!DOMAIN_RE.test(base)) return { ok: false, error: `Invalid domain: ${base.slice(0, 80)}` };
  if (base.split('.').length < 2) return { ok: false, error: 'Invalid domain' };

  if (PUBLIC_SUFFIXES.has(base)) {
    return { ok: false, error: 'Public suffixes cannot be used as an allowed domain' };
  }
  for (const blocked of PUBLIC_MAIL_DOMAINS) {
    if (base === blocked || base.endsWith('.' + blocked)) {
      return { ok: false, error: 'Public e-mail provider domains cannot be used as an allowed domain' };
    }
  }
  return { ok: true, domain, wildcard };
}

/** True when two domain entries (exact or `*.x`) can match the same e-mail host. */
export function domainsOverlap(a: string, b: string): boolean {
  const matches = (pattern: string, host: string): boolean =>
    pattern.startsWith('*.')
      ? host.endsWith('.' + pattern.slice(2)) || host === pattern.slice(2)
      : host === pattern;
  const hostA = a.startsWith('*.') ? a.slice(2) : a;
  const hostB = b.startsWith('*.') ? b.slice(2) : b;
  return matches(a, hostB) || matches(b, hostA);
}

type Db = Pick<SupabaseClient, 'from'>;

/**
 * Domains claimed by organizations OTHER than `orgId`, from both stores:
 *  - organization_domains (organization_id, domain): the authoritative table
 *  - organizations.settings.allowed_email_domains: still read by the signup flow;
 *    a database trigger mirrors it into the table, reading it here as well also
 *    covers the window before that trigger/table exists in an environment.
 * Must be called with a client that can see every tenant (service role).
 */
export async function getDomainsClaimedByOthers(
  db: Db,
  orgId: string
): Promise<Array<{ domain: string; organization_id: string }>> {
  const claimed: Array<{ domain: string; organization_id: string }> = [];

  const { data: rows, error } = await db
    .from('organization_domains')
    .select('domain, organization_id')
    .neq('organization_id', orgId);
  if (error) throw new Error(`domain lookup failed: ${error.message}`);
  for (const r of (rows ?? []) as Array<{ domain: string; organization_id: string | null }>) {
    if (r.domain && r.organization_id) {
      claimed.push({ domain: r.domain.toLowerCase(), organization_id: r.organization_id });
    }
  }

  const { data: orgs, error: orgErr } = await db
    .from('organizations')
    .select('id, settings')
    .neq('id', orgId);
  if (orgErr) throw new Error(`domain lookup failed: ${orgErr.message}`);
  for (const o of (orgs ?? []) as Array<{ id: string; settings?: { allowed_email_domains?: unknown } | null }>) {
    const list = o.settings?.allowed_email_domains;
    if (Array.isArray(list)) {
      for (const d of list) {
        if (typeof d === 'string') claimed.push({ domain: d.toLowerCase(), organization_id: o.id });
      }
    }
  }
  return claimed;
}

/** Returns the first domain in `candidates` that another organization already claims, or null. */
export async function findDomainConflict(
  db: Db,
  orgId: string,
  candidates: readonly string[]
): Promise<{ domain: string } | null> {
  const others = await getDomainsClaimedByOthers(db, orgId);
  for (const candidate of candidates) {
    if (others.some((o) => domainsOverlap(candidate, o.domain))) return { domain: candidate };
  }
  return null;
}

/** Postgres unique_violation (a domain already claimed by another organization). */
export function isUniqueViolation(err: { code?: string } | null | undefined): boolean {
  return err?.code === '23505';
}

/** Domains of one organization, from organization_domains, sorted. */
export async function listOrgDomains(
  db: Db,
  orgId: string
): Promise<{ rows: Array<{ id: string; domain: string; created_at: string | null }>; error: unknown }> {
  const { data, error } = await db
    .from('organization_domains')
    .select('id, domain, created_at')
    .eq('organization_id', orgId)
    .order('domain', { ascending: true });
  return {
    rows: (data ?? []) as Array<{ id: string; domain: string; created_at: string | null }>,
    error,
  };
}

/**
 * Rewrite organizations.settings.allowed_email_domains from the organization_domains
 * table (merge: every other settings key is kept). The signup flow still reads this
 * JSON; the database trigger then sees identical content and does nothing.
 * Returns false when anything fails; the caller must then undo its table change.
 */
export async function syncOrgDomainSetting(db: Db, orgId: string): Promise<boolean> {
  try {
    const { rows, error } = await listOrgDomains(db, orgId);
    if (error) {
      console.error('Domain setting sync: reading organization_domains failed:', error);
      return false;
    }
    const { data: org, error: fetchError } = await db
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle();
    if (fetchError || !org) {
      console.error('Domain setting sync: loading organization failed:', fetchError);
      return false;
    }
    const current = (org as { settings?: Record<string, unknown> | null }).settings;
    const settings = {
      ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
      allowed_email_domains: rows.map((r) => r.domain),
    };
    const { error: updateError } = await db.from('organizations').update({ settings }).eq('id', orgId);
    if (updateError) {
      console.error('Domain setting sync: updating organization failed:', updateError);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Domain setting sync failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Global educational suffix list (allowed_domains): not organization data.
// ---------------------------------------------------------------------------

const SUFFIX_RE = /^\.?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** Validate a global suffix entry: ".edu", "ac.in" or a plain domain; lowercase, at most 100 chars. */
export function validateGlobalSuffix(input: unknown): DomainCheck {
  if (typeof input !== 'string') return { ok: false, error: 'Domain must be a string' };
  const domain = input.trim().toLowerCase();
  if (!domain || domain.length > 100) return { ok: false, error: 'Suffix must be 1 to 100 characters' };
  if (!SUFFIX_RE.test(domain)) {
    return { ok: false, error: 'Suffix must be a plain domain or start with a single dot (for example ".edu" or "ac.in")' };
  }
  return { ok: true, domain, wildcard: false };
}
