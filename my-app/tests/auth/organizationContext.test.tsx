import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OrganizationProvider, useOrganization } from '@/contexts/OrganizationContext';
import { emitAuthEvent } from '@/lib/authEvents';

const ORG_A = { id: 'org-a', name: 'Alpha University', type: 'university', is_active: true };
const ORG_B = { id: 'org-b', name: 'Beta College', type: 'college', is_active: true };

type Route = () => Response;
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let routes: Record<string, Route>;
let fetchMock: ReturnType<typeof vi.fn>;

function installFetch() {
  fetchMock = vi.fn(async (url: string) => {
    const route = routes[String(url).split('?')[0]];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
}

function Probe() {
  const { currentOrganization, organizations, isLoading } = useOrganization();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="current">{currentOrganization?.name ?? 'none'}</span>
      <span data-testid="count">{organizations.length}</span>
    </div>
  );
}

const renderProvider = () => render(<OrganizationProvider><Probe /></OrganizationProvider>);

beforeEach(() => {
  // worker threads share BroadcastChannel names, so other test files would leak events in
  vi.stubGlobal('BroadcastChannel', undefined);
  localStorage.clear();
  routes = {
    '/api/auth/me': () => jsonRes({ user_id: 'u1', role: 'student' }),
    '/api/organizations': () => jsonRes({ data: { organizations: [ORG_A, ORG_B] } }),
  };
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OrganizationContext', () => {
  it('does not import a browser Supabase client or listen for auth state changes', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/contexts/OrganizationContext.tsx'), 'utf8');
    expect(src).not.toMatch(/supabase\/client|supabaseClient|createBrowserClient|@supabase\//);
    expect(src).not.toMatch(/onAuthStateChange/);
    expect(src).not.toMatch(/document\.cookie/);
  });

  it('loads the organizations through the API routes and selects the first one', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('current').textContent).toBe('Alpha University');
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/auth/me', '/api/organizations']);
  });

  it('restores the stored selection', async () => {
    localStorage.setItem('currentOrganizationId', 'org-b');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('Beta College'));
  });

  it('ignores a stored selection the user cannot access', async () => {
    localStorage.setItem('currentOrganizationId', 'org-zzz');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('Alpha University'));
  });

  it('signed out (401): empty state, stale selections cleared, no organization request', async () => {
    localStorage.setItem('currentOrganizationId', 'org-b');
    localStorage.setItem('selectedOrganizationId', 'org-b');
    routes['/api/auth/me'] = () => jsonRes({ error: 'Not authenticated' }, 401);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('current').textContent).toBe('none');
    expect(localStorage.getItem('currentOrganizationId')).toBeNull();
    expect(localStorage.getItem('selectedOrganizationId')).toBeNull();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/auth/me']);
  });

  it('super admins get every active organization from the super-admin route', async () => {
    routes['/api/auth/me'] = () => jsonRes({ user_id: 'u1', role: 'super_admin' });
    routes['/api/v2/admin/super/organizations'] = () =>
      jsonRes({ data: [{ ...ORG_B }, { ...ORG_A }, { id: 'org-c', name: 'Closed', is_active: false }] });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('current').textContent).toBe('Alpha University'); // sorted by name, inactive dropped
  });

  it('refreshes when the window regains focus (at most every 30 s) and keeps the selection', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.setItem('currentOrganizationId', 'org-b');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('Beta College'));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(fetchMock).toHaveBeenCalledTimes(2); // too soon

    vi.setSystemTime(Date.now() + 31_000);
    routes['/api/organizations'] = () => jsonRes({ data: { organizations: [ORG_B, ORG_A, { id: 'org-d', name: 'Delta', is_active: true }] } });
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('3'));
    expect(screen.getByTestId('current').textContent).toBe('Beta College');
  });

  it('clears everything on a logout event and reloads on a login event', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    localStorage.setItem('selectedOrganizationId', 'org-a');

    act(() => emitAuthEvent('logout'));
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
    expect(localStorage.getItem('selectedOrganizationId')).toBeNull();

    routes['/api/organizations'] = () => jsonRes({ data: { organizations: [ORG_B] } });
    act(() => emitAuthEvent('login'));
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('Beta College'));
  });

  it('keeps the previous list when a refresh fails', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    routes['/api/organizations'] = () => jsonRes({ error: 'x' }, 500);
    act(() => emitAuthEvent('login'));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.getByTestId('count').textContent).toBe('2');
  });
});
