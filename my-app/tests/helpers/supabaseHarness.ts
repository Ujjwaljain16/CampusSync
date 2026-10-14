/**
 * Route-test harness: replaces the Supabase client factories with one shared
 * in-memory FakeDb, so the REAL supabaseServer / authorization / route code runs.
 *
 * Usage (must be the first import of the test file):
 *   import { harness, req } from '../helpers/supabaseHarness';
 *   beforeEach(() => harness.reset());
 *   harness.signIn(userId); harness.db.seed('user_roles', [...]);
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FakeDb } from './fakeSupabase';

export const harness = {
  db: new FakeDb(),
  userId: null as string | null,
  reset() {
    this.db = new FakeDb();
    this.userId = null;
  },
  signIn(userId: string | null) {
    this.userId = userId;
  },
};

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined, get: () => undefined }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => harness.db.client(harness.userId),
}));

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, createClient: () => harness.db.client('service-role') };
});

vi.mock('@/lib/emailService', () => ({
  emailService: new Proxy({}, { get: () => async () => undefined }),
}));

export function req(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): NextRequest {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  let body: string | undefined;
  if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers['content-type'] = 'application/json';
  }
  return new NextRequest(`http://localhost${url}`, { method: init.method ?? 'GET', headers, body });
}

export function params<T extends Record<string, string>>(p: T): { params: Promise<T> } {
  return { params: Promise.resolve(p) };
}
