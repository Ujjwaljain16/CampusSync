// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';

const originalNodeEnv = process.env.NODE_ENV;
const setNodeEnv = (v: string) => {
  (process.env as Record<string, string | undefined>).NODE_ENV = v;
};

afterEach(() => {
  setNodeEnv(originalNodeEnv as string);
});

describe('config-presence endpoints', () => {
  it('/api/diagnose is 404 in production', async () => {
    setNodeEnv('production');
    const { GET } = await import('@/app/api/diagnose/route');
    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('/api/auth/check-env is 404 in production', async () => {
    setNodeEnv('production');
    const { GET } = await import('@/app/api/auth/check-env/route');
    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('/api/auth/check-env still works outside production', async () => {
    setNodeEnv('development');
    const { GET } = await import('@/app/api/auth/check-env/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('configured');
  });

  it('/api/diagnose still responds outside production', async () => {
    setNodeEnv('development');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { GET } = await import('@/app/api/diagnose/route');
    const res = await GET();
    expect(res.status).toBe(200);
    vi.unstubAllEnvs();
  });

  it('the dev-upsert-user route no longer exists', async () => {
    expect(existsSync(path.resolve(__dirname, '../../src/app/api/auth/dev-upsert-user/route.ts'))).toBe(false);
  });
});
