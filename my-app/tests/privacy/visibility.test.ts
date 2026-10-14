// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getStudentVisibility,
  getVisibilityForStudents,
  isMissingColumnError,
  resetVisibilityWarningForTests,
  SECURE_VISIBILITY_DEFAULTS,
} from '@/lib/privacy/visibility';
import { createMockClient, type QueryState } from './helpers/mockSupabase';

const A = '33333333-3333-4333-8333-333333333331';
const B = '33333333-3333-4333-8333-333333333332';
const asClient = (c: unknown) => c as SupabaseClient;

describe('visibility defaults', () => {
  beforeEach(() => {
    resetVisibilityWarningForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('are private by default', () => {
    expect(SECURE_VISIBILITY_DEFAULTS).toEqual({ publicPortfolioEnabled: false, recruiterShareContact: false });
  });

  it('only a literal true enables a flag', async () => {
    const client = createMockClient({
      profiles: () => ({
        data: [
          { id: A, public_portfolio_enabled: true, recruiter_share_contact: false },
          { id: B, public_portfolio_enabled: 'true', recruiter_share_contact: 1 },
        ],
      }),
    });
    const map = await getVisibilityForStudents(asClient(client), [A, B]);
    expect(map.get(A)).toEqual({ publicPortfolioEnabled: true, recruiterShareContact: false });
    expect(map.get(B)).toEqual({ publicPortfolioEnabled: false, recruiterShareContact: false });
  });

  it('returns defaults for students without a profile row', async () => {
    const client = createMockClient({ profiles: () => ({ data: [] }) });
    const map = await getVisibilityForStudents(asClient(client), [A]);
    expect(map.get(A)).toEqual({ publicPortfolioEnabled: false, recruiterShareContact: false });
  });

  it('falls back to defaults when the columns do not exist (42703) and warns once', async () => {
    const missing = { code: '42703', message: 'column profiles.public_portfolio_enabled does not exist' };
    const client = createMockClient({ profiles: () => ({ data: null, error: missing }) });

    const first = await getStudentVisibility(asClient(client), A);
    const second = await getStudentVisibility(asClient(client), A);
    expect(first).toEqual({ publicPortfolioEnabled: false, recruiterShareContact: false });
    expect(second).toEqual(first);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('honours the column that exists when only one is missing', async () => {
    const client = createMockClient({
      profiles: (s: QueryState) => {
        const select = String(s.find('select')?.args[0]);
        if (select.includes('public_portfolio_enabled') && select.includes('recruiter_share_contact')) {
          return { data: null, error: { code: '42703', message: 'column does not exist' } };
        }
        if (select.includes('public_portfolio_enabled')) {
          return { data: [{ id: A, public_portfolio_enabled: true }] };
        }
        return { data: null, error: { code: '42703', message: 'column does not exist' } };
      },
    });
    const v = await getStudentVisibility(asClient(client), A);
    expect(v).toEqual({ publicPortfolioEnabled: true, recruiterShareContact: false });
  });

  it('fails closed (and logs) on unrelated database errors', async () => {
    const client = createMockClient({ profiles: () => ({ data: null, error: { code: '57014', message: 'timeout' } }) });
    const v = await getStudentVisibility(asClient(client), A);
    expect(v).toEqual({ publicPortfolioEnabled: false, recruiterShareContact: false });
    expect(console.error).toHaveBeenCalled();
  });

  it('fails closed when the client throws', async () => {
    const client = {
      from: () => {
        throw new Error('network down');
      },
    };
    const v = await getStudentVisibility(asClient(client), A);
    expect(v).toEqual({ publicPortfolioEnabled: false, recruiterShareContact: false });
  });

  it('does not query for an empty id list', async () => {
    const client = createMockClient({});
    const map = await getVisibilityForStudents(asClient(client), []);
    expect(map.size).toBe(0);
    expect(client.calls).toHaveLength(0);
  });
});

describe('isMissingColumnError', () => {
  it('recognises postgres and PostgREST variants', () => {
    expect(isMissingColumnError({ code: '42703' })).toBe(true);
    expect(isMissingColumnError({ code: 'PGRST204' })).toBe(true);
    expect(isMissingColumnError({ message: 'column "x" does not exist' })).toBe(true);
    expect(isMissingColumnError({ message: "Could not find the 'x' column of 'profiles' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});
