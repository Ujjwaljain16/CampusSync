// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { clampInt, isIsoDateString, isUuid, sanitizeFilterTerm, sanitizeTermList } from '@/lib/privacy/sanitize';
import { safeEmail, safeHttpUrl } from '@/lib/privacy/safeUrl';

describe('sanitizeFilterTerm', () => {
  it('passes ordinary text through', () => {
    expect(sanitizeFilterTerm('Computer Science')).toBe('Computer Science');
    expect(sanitizeFilterTerm('  Ana   Maria  ')).toBe('Ana Maria');
  });

  it('removes every PostgREST structural character', () => {
    const hostile = 'x,id.neq.0),(full_name.ilike.%a%*\\"\'';
    const out = sanitizeFilterTerm(hostile);
    for (const ch of [',', '(', ')', '%', '*', '\\', '"', "'"]) {
      expect(out).not.toContain(ch);
    }
    expect(out).not.toContain('.');
  });

  it('cannot smuggle an extra condition into an or() list', () => {
    const term = sanitizeFilterTerm('abc,email.neq.null');
    const filter = `full_name.ilike.%${term}%,major.ilike.%${term}%`;
    // exactly one top-level separator between the two intended conditions
    expect(filter.split(',')).toHaveLength(2);
    expect(filter).not.toContain('email.neq');
  });

  it('turns dots into single-char wildcards instead of delimiters', () => {
    expect(sanitizeFilterTerm('john.doe')).toBe('john_doe');
  });

  it('drops control characters and caps the length', () => {
    expect(sanitizeFilterTerm('a\u0000b\nc')).toBe('a b c');
    expect(sanitizeFilterTerm('a'.repeat(500))).toHaveLength(64);
  });

  it('returns empty for non-strings and wildcard-only input', () => {
    expect(sanitizeFilterTerm(undefined)).toBe('');
    expect(sanitizeFilterTerm(42)).toBe('');
    expect(sanitizeFilterTerm({})).toBe('');
    expect(sanitizeFilterTerm('%%%***')).toBe('');
    expect(sanitizeFilterTerm('...')).toBe('');
    expect(sanitizeFilterTerm('   ')).toBe('');
  });
});

describe('sanitizeTermList', () => {
  it('dedupes, drops empties and caps the count', () => {
    expect(sanitizeTermList(['Python', 'python', '', ',,,', 'Python'])).toEqual(['Python', 'python']);
    expect(sanitizeTermList(Array.from({ length: 50 }, (_, i) => `t${i}`), 5)).toHaveLength(5);
  });
  it('accepts comma separated strings and ignores other types', () => {
    expect(sanitizeTermList('a, b ,c')).toEqual(['a', 'b', 'c']);
    expect(sanitizeTermList(undefined)).toEqual([]);
    expect(sanitizeTermList({ a: 1 })).toEqual([]);
  });
});

describe('clampInt', () => {
  it('clamps into range', () => {
    expect(clampInt('1000', 1, 50, 20)).toBe(50);
    expect(clampInt(0, 1, 50, 20)).toBe(1);
    expect(clampInt(-5, 0, 100, 0)).toBe(0);
    expect(clampInt('7.9', 1, 50, 20)).toBe(7);
  });
  it('falls back for garbage', () => {
    expect(clampInt('abc', 1, 50, 20)).toBe(20);
    expect(clampInt(NaN, 1, 50, 20)).toBe(20);
    expect(clampInt(null, 1, 50, 20)).toBe(20);
    expect(clampInt('', 1, 50, 20)).toBe(20);
  });
});

describe('validators', () => {
  it('isUuid', () => {
    expect(isUuid('33333333-3333-4333-8333-333333333331')).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("33333333-3333-4333-8333-333333333331'--")).toBe(false);
  });
  it('isIsoDateString', () => {
    expect(isIsoDateString('2024-05-01')).toBe(true);
    expect(isIsoDateString('2024-13-45')).toBe(false);
    expect(isIsoDateString('yesterday')).toBe(false);
  });
  it('safeHttpUrl only allows http(s)', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,x')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
  it('safeEmail rejects header-injection style input', () => {
    expect(safeEmail('a@b.co')).toBe('a@b.co');
    expect(safeEmail('a@b.co?bcc=evil@x.com')).toBeNull();
    expect(safeEmail('a@b.co,evil@x.com')).toBeNull();
    expect(safeEmail(undefined)).toBeNull();
  });
});
