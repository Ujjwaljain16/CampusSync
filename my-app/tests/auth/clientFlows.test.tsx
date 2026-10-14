import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast }));

import LoginPage from '@/app/login/page';
import ResetPasswordPage from '@/app/reset-password/page';
import LogoutButton from '@/components/LogoutButton';
import { onAuthEvent } from '@/lib/authEvents';

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
let routes: Record<string, () => Response>;
function installFetch() {
  fetchMock = vi.fn(async (url: string) => {
    const r = routes[url];
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return r();
  });
  vi.stubGlobal('fetch', fetchMock);
}
const bodyOf = (url: string) => {
  const call = fetchMock.mock.calls.find((c) => c[0] === url);
  return call ? JSON.parse(call[1].body) : undefined;
};

const realLocation = window.location;
function stubLocation() {
  const loc = { href: 'http://localhost/start', origin: 'http://localhost', search: '', hash: '', pathname: '/' };
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: loc });
  return loc;
}

beforeEach(() => {
  // worker threads share BroadcastChannel names, so other test files would leak events in
  vi.stubGlobal('BroadcastChannel', undefined);
  push.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation });
});

describe('no browser Supabase client anywhere in the auth UI', () => {
  it.each([
    'src/app/login/page.tsx',
    'src/app/reset-password/page.tsx',
    'src/app/test-email/page.tsx',
    'src/components/LogoutButton.tsx',
  ])('%s', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(src).not.toMatch(/supabase\/client|supabaseClient|createBrowserClient|@supabase\/|supabase\.auth|document\.cookie/);
  });
});

describe('login page', () => {
  function fillAndSubmit(email = 'student@campus.test', password = 'secret-pass') {
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } });
    fireEvent.submit(document.getElementById('login-panel')!);
  }

  it('signs in through POST /api/auth/login only and follows the redirect target', async () => {
    const loc = stubLocation();
    routes = { '/api/auth/login': () => jsonRes({ ok: true, role: 'student', redirectTo: '/student/dashboard' }) };
    installFetch();
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(loc.href).toBe('/student/dashboard'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf('/api/auth/login')).toEqual({ email: 'student@campus.test', password: 'secret-pass' });
  });

  it('announces the login so other tabs / listeners refresh', async () => {
    stubLocation();
    routes = { '/api/auth/login': () => jsonRes({ ok: true, redirectTo: '/dashboard' }) };
    installFetch();
    const seen: string[] = [];
    const off = onAuthEvent((k) => seen.push(k));
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(seen).toEqual(['login']));
    off();
  });

  it('ignores a redirect target that leaves the site', async () => {
    const loc = stubLocation();
    routes = { '/api/auth/login': () => jsonRes({ ok: true, redirectTo: 'https://evil.example/x' }) };
    installFetch();
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(loc.href).toBe('/dashboard'));
  });

  it('shows the server message on failure and does not navigate', async () => {
    const loc = stubLocation();
    routes = { '/api/auth/login': () => jsonRes({ error: 'Invalid email or password' }, 401) };
    installFetch();
    render(<LoginPage />);
    fillAndSubmit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid email or password'));
    expect(loc.href).toBe('http://localhost/start');
  });

  it('forgot password: asks the server, never checks whether the account exists, and says so generically', async () => {
    routes = { '/api/auth/password-reset/request': () => jsonRes({ ok: true, message: 'x' }) };
    installFetch();
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'someone@campus.test' } });
    fireEvent.click(screen.getByText('Forgot password?'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(bodyOf('/api/auth/password-reset/request')).toEqual({ email: 'someone@campus.test' });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/auth/password-reset/request']);
    expect(String(toast.success.mock.calls[0][0])).toMatch(/If an account exists/);
  });

  it('forgot password without an email asks for one and sends nothing', async () => {
    routes = {};
    installFetch();
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Forgot password?'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Google sign-in still goes through the server OAuth route', () => {
    const loc = stubLocation();
    routes = {};
    installFetch();
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Continue with Google'));
    expect(loc.href).toBe('/api/auth/oauth/google?redirectTo=%2Fdashboard');
  });
});

describe('logout button', () => {
  it('calls POST /api/auth/signout, clears per-user selections, announces it and goes to /login', async () => {
    const loc = stubLocation();
    localStorage.setItem('currentOrganizationId', 'o1');
    localStorage.setItem('selectedOrganizationId', 'o1');
    routes = { '/api/auth/signout': () => jsonRes({ data: { success: true } }) };
    installFetch();
    const seen: string[] = [];
    const off = onAuthEvent((k) => seen.push(k));
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(loc.href).toBe('/login'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/signout');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(localStorage.getItem('currentOrganizationId')).toBeNull();
    expect(localStorage.getItem('selectedOrganizationId')).toBeNull();
    expect(seen).toEqual(['logout']);
    off();
  });

  it('still goes to /login when the request fails', async () => {
    const loc = stubLocation();
    routes = { '/api/auth/signout': () => jsonRes({ error: 'x' }, 500) };
    installFetch();
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(loc.href).toBe('/login'));
  });
});

describe('reset password page', () => {
  const typePasswords = (a: string, b: string) => {
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: a } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: b } });
    fireEvent.submit(screen.getByLabelText(/new password/i).closest('form')!);
  };

  it('email-link flow: posts the token to the server, scrubs it from the address bar, and sets the password through the server', async () => {
    window.history.pushState({}, '', '/reset-password?token_hash=tok123&type=recovery');
    routes = {
      '/api/auth/password-reset/verify': () => jsonRes({ ok: true }),
      '/api/auth/password-reset/update': () => jsonRes({ ok: true }),
    };
    installFetch();
    render(<ResetPasswordPage />);
    await waitFor(() => expect(bodyOf('/api/auth/password-reset/verify')).toEqual({ token_hash: 'tok123', type: 'recovery' }));
    await waitFor(() => expect(window.location.search).toBe(''));

    vi.useFakeTimers();
    typePasswords('a-new-password', 'a-new-password');
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(bodyOf('/api/auth/password-reset/update')).toEqual({ password: 'a-new-password' });
    expect(screen.getByText('Password reset successful!')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?message=/));
  });

  it('callback flow (no token in the URL): asks the server whether a recovery session exists', async () => {
    window.history.pushState({}, '', '/reset-password');
    routes = { '/api/auth/me': () => jsonRes({ user_id: 'u1' }), '/api/auth/password-reset/update': () => jsonRes({ ok: true }) };
    installFetch();
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.queryByText(/Validating reset link/)).toBeNull());
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/auth/me']);
    expect(screen.queryByText(/Could not establish session/)).toBeNull();
  });

  it('no session and no token: says the link is invalid', async () => {
    window.history.pushState({}, '', '/reset-password');
    routes = { '/api/auth/me': () => jsonRes({ error: 'Not authenticated' }, 401) };
    installFetch();
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getByText(/Could not establish session/)).toBeTruthy());
  });

  it('an expired token shows the server message', async () => {
    window.history.pushState({}, '', '/reset-password?token_hash=old&type=recovery');
    routes = { '/api/auth/password-reset/verify': () => jsonRes({ error: 'Invalid or expired reset link. Please request a new one.' }, 400) };
    installFetch();
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getByText(/Invalid or expired reset link/)).toBeTruthy());
  });

  it('legacy #access_token links are refused without calling the server', async () => {
    window.history.pushState({}, '', '/reset-password#access_token=abc&refresh_token=def');
    routes = {};
    installFetch();
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getByText(/no longer supported/)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('refuses a weak or mismatched password in the page, before any request', async () => {
    window.history.pushState({}, '', '/reset-password');
    routes = { '/api/auth/me': () => jsonRes({ user_id: 'u1' }) };
    installFetch();
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.queryByText(/Validating reset link/)).toBeNull());
    typePasswords('short', 'short');
    expect(screen.getByText(/at least 8 characters/)).toBeTruthy();
    typePasswords('long-enough-1', 'long-enough-2');
    expect(screen.getByText('Passwords do not match')).toBeTruthy();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/auth/me']);
  });

  it('shows the server error when the update is refused (expired session)', async () => {
    window.history.pushState({}, '', '/reset-password');
    routes = {
      '/api/auth/me': () => jsonRes({ user_id: 'u1' }),
      '/api/auth/password-reset/update': () => jsonRes({ error: 'Your reset session has expired. Please request a new password reset link.' }, 401),
    };
    installFetch();
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.queryByText(/Validating reset link/)).toBeNull());
    typePasswords('a-new-password', 'a-new-password');
    await waitFor(() => expect(screen.getByText(/reset session has expired/)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
});
