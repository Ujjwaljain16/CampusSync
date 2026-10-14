// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  domainMatchesAllowedEntry,
  domainMatchesAllowedList,
  domainMatchesGlobalPattern,
  matchesEducationalPattern,
  validateEmailWithPatterns,
} from '@/lib/emailValidation';

describe('shared domain matching', () => {
  it('org entries match the exact domain only', () => {
    expect(domainMatchesAllowedEntry('scaler.com', 'scaler.com')).toBe(true);
    expect(domainMatchesAllowedEntry('SCALER.com', ' scaler.COM ')).toBe(true);
    expect(domainMatchesAllowedEntry('sub.scaler.com', 'scaler.com')).toBe(false);
    expect(domainMatchesAllowedEntry('scaler.com.evil.com', 'scaler.com')).toBe(false);
    expect(domainMatchesAllowedEntry('evilscaler.com', 'scaler.com')).toBe(false);
  });

  it('wildcard entries match subdomains on a label boundary, not the apex', () => {
    expect(domainMatchesAllowedEntry('cs.mit.edu', '*.mit.edu')).toBe(true);
    expect(domainMatchesAllowedEntry('mit.edu', '*.mit.edu')).toBe(false);
    expect(domainMatchesAllowedEntry('evilmit.edu', '*.mit.edu')).toBe(false);
    expect(domainMatchesAllowedEntry('cs.mit.edu.evil.com', '*.mit.edu')).toBe(false);
  });

  it('domainMatchesAllowedList tolerates bad data', () => {
    expect(domainMatchesAllowedList('a.edu', undefined)).toBe(false);
    expect(domainMatchesAllowedList('a.edu', 'a.edu')).toBe(false);
    expect(domainMatchesAllowedList('a.edu', [null, 5, 'a.edu'])).toBe(true);
  });

  it('global patterns use label-boundary suffix matching', () => {
    expect(domainMatchesGlobalPattern('cs.stanford.edu', '.edu')).toBe(true);
    expect(domainMatchesGlobalPattern('stanford.edu', 'edu')).toBe(true);
    expect(domainMatchesGlobalPattern('x.ac.in', 'ac.in')).toBe(true);
    expect(domainMatchesGlobalPattern('x.edu.evil.com', '.edu')).toBe(false);
    expect(domainMatchesGlobalPattern('notedu', '.edu')).toBe(false);
    expect(domainMatchesGlobalPattern('myedu', 'edu')).toBe(false);
    expect(domainMatchesGlobalPattern('evil.com', '.edu')).toBe(false);
  });

  it('fallback educational patterns are anchored', () => {
    expect(matchesEducationalPattern('a@cs.stanford.edu')).toBe(true);
    expect(matchesEducationalPattern('a@iitb.ac.in')).toBe(true);
    expect(matchesEducationalPattern('a@unsw.edu.au')).toBe(true);
    expect(matchesEducationalPattern('a@x.edu.evil.com')).toBe(false);
    expect(matchesEducationalPattern('a@university.evil.com')).toBe(false);
    expect(matchesEducationalPattern('a@college.evil.com')).toBe(false);
    expect(matchesEducationalPattern('a@evil.com/.edu')).toBe(false);
    expect(validateEmailWithPatterns('a@x.edu.evil.com').isValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /api/auth/validate-email
// ---------------------------------------------------------------------------

const fromMock = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseAdminClient: vi.fn(async () => ({ from: (...a: unknown[]) => fromMock(...a) })),
}));

function table(rows: unknown[]) {
  return { select: () => ({ eq: async () => ({ data: rows, error: null }) }) };
}

async function callValidate(email: string, ip = '203.0.113.7') {
  const { POST } = await import('@/app/api/auth/validate-email/route');
  const req = new Request('http://localhost/api/auth/validate-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({ email }),
  });
  return POST(req as never);
}

describe('POST /api/auth/validate-email', () => {
  beforeEach(() => {
    fromMock.mockImplementation((name: string) =>
      name === 'organizations'
        ? table([{ id: 'org-1', settings: { allowed_email_domains: ['campus.test', '*.dept.campus.test'] } }])
        : table([{ domain: '.edu' }])
    );
  });

  it('accepts an exact org domain and does not leak the organization', async () => {
    const res = await callValidate('a@campus.test', '203.0.113.10');
    const body = await res.json();
    expect(body).toEqual({ isValid: true, domain: 'campus.test' });
  });

  it('accepts a wildcard subdomain', async () => {
    const body = await (await callValidate('a@cs.dept.campus.test', '203.0.113.11')).json();
    expect(body.isValid).toBe(true);
  });

  it('accepts a real .edu domain via the global table', async () => {
    const body = await (await callValidate('a@cs.stanford.edu', '203.0.113.12')).json();
    expect(body.isValid).toBe(true);
  });

  it.each(['a@x.edu.evil.com', 'a@campus.test.evil.com', 'a@evilcampus.test', 'a@notedu', 'a@evil.com'])(
    'rejects lookalike domain %s',
    async (email) => {
      const body = await (await callValidate(email, '203.0.113.13')).json();
      expect(body.isValid).toBe(false);
    }
  );
});
