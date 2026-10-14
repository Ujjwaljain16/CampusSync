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
 *  - allowed_domains (organization_id, domain)
 *  - organizations.settings.allowed_email_domains
 * Must be called with a client that can see every tenant (service role).
 */
export async function getDomainsClaimedByOthers(
  db: Db,
  orgId: string
): Promise<Array<{ domain: string; organization_id: string }>> {
  const claimed: Array<{ domain: string; organization_id: string }> = [];

  const { data: rows, error } = await db
    .from('allowed_domains')
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
