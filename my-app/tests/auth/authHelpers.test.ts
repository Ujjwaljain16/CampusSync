import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { validateNewPassword } from '@/lib/auth/passwordRules';
import { resolvePostLogin } from '@/lib/auth/postLogin';
import { emitAuthEvent, onAuthEvent } from '@/lib/authEvents';

describe('validateNewPassword', () => {
  it('accepts 8 to 72 bytes', () => {
    expect(validateNewPassword('12345678')).toBeNull();
    expect(validateNewPassword('x'.repeat(72))).toBeNull();
  });
  it('refuses short, long, empty and non-string input', () => {
    expect(validateNewPassword('1234567')).toMatch(/at least 8/);
    expect(validateNewPassword('x'.repeat(73))).toMatch(/at most 72/);
    expect(validateNewPassword('')).not.toBeNull();
    expect(validateNewPassword(undefined)).not.toBeNull();
    expect(validateNewPassword(12345678)).not.toBeNull();
  });
  it('counts bytes, not characters', () => {
    expect(validateNewPassword('é'.repeat(37))).toMatch(/at most 72/); // 74 bytes
  });
});

describe('resolvePostLogin', () => {
  const row = (role: string, approval_status: string | null, organization_id: string | null = null, created_at = '2026-01-01') => ({
    role,
    approval_status,
    organization_id,
    created_at,
  });

  it('sends each approved role to its dashboard', () => {
    expect(resolvePostLogin([row('student', 'approved', 'o1')]).redirectTo).toBe('/student/dashboard');
    expect(resolvePostLogin([row('faculty', 'approved', 'o1')]).redirectTo).toBe('/faculty/dashboard');
    expect(resolvePostLogin([row('recruiter', 'approved')]).redirectTo).toBe('/recruiter/dashboard');
    expect(resolvePostLogin([row('admin', 'approved', 'o1')]).redirectTo).toBe('/dashboard');
    expect(resolvePostLogin([row('super_admin', 'approved')]).redirectTo).toBe('/dashboard');
  });

  it('sends unapproved faculty / recruiters to their waiting pages, other roles to /dashboard', () => {
    expect(resolvePostLogin([row('recruiter', 'pending')]).redirectTo).toBe('/recruiter/waiting');
    expect(resolvePostLogin([row('recruiter', 'denied')]).redirectTo).toBe('/recruiter/waiting');
    expect(resolvePostLogin([row('faculty', 'pending', 'o1')]).redirectTo).toBe('/faculty/waiting');
    expect(resolvePostLogin([row('org_admin', 'pending', 'o1')]).redirectTo).toBe('/dashboard');
  });

  it('treats a legacy NULL status as approved for non-admin roles only', () => {
    expect(resolvePostLogin([row('student', null, 'o1')]).redirectTo).toBe('/student/dashboard');
    expect(resolvePostLogin([row('admin', null, 'o1')]).redirectTo).toBe('/dashboard');
    expect(resolvePostLogin([row('admin', null, 'o1')]).approval_status).toBeNull();
  });

  it('picks the highest APPROVED row, ignoring a higher pending one', () => {
    const info = resolvePostLogin([row('student', 'approved', 'o1'), row('faculty', 'approved', 'o2', '2026-01-02'), row('org_admin', 'pending', 'o1', '2026-01-03')]);
    expect(info).toEqual({ role: 'faculty', organization_id: 'o2', approval_status: 'approved', redirectTo: '/faculty/dashboard' });
  });

  it('with nothing approved reports the highest remaining row', () => {
    expect(resolvePostLogin([row('student', 'pending', 'o1'), row('recruiter', 'pending')]).role).toBe('recruiter');
  });

  it('copes with no rows, unknown roles and junk', () => {
    expect(resolvePostLogin([])).toEqual({ role: null, organization_id: null, approval_status: null, redirectTo: '/dashboard' });
    expect(resolvePostLogin(null)).toMatchObject({ role: null, redirectTo: '/dashboard' });
    expect(resolvePostLogin([row('wizard', 'approved')]).redirectTo).toBe('/dashboard');
  });
});

describe('auth events', () => {
  beforeEach(() => {
    // worker threads share BroadcastChannel names, so other test files would leak events in
    vi.stubGlobal('BroadcastChannel', undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('delivers login and logout to listeners in this window and stops after unsubscribe', () => {
    const seen: string[] = [];
    const off = onAuthEvent((k) => seen.push(k));
    emitAuthEvent('login');
    emitAuthEvent('logout');
    expect(seen).toEqual(['login', 'logout']);
    off();
    emitAuthEvent('login');
    expect(seen).toEqual(['login', 'logout']);
  });

  it('ignores foreign events with an unknown kind', () => {
    const handler = vi.fn();
    const off = onAuthEvent(handler);
    window.dispatchEvent(new CustomEvent('campussync:auth', { detail: { kind: 'bogus' } }));
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('passes events between windows over BroadcastChannel and ignores its own broadcast', () => {
    const channels: Array<{ onmessage: ((m: MessageEvent) => void) | null }> = [];
    class FakeChannel {
      onmessage: ((m: MessageEvent) => void) | null = null;
      constructor() { channels.push(this); }
      postMessage(data: unknown) {
        channels.filter((c) => c !== this).forEach((c) => c.onmessage?.({ data } as MessageEvent));
      }
      close() { channels.splice(channels.indexOf(this), 1); }
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);

    const seen: string[] = [];
    const off = onAuthEvent((k) => seen.push(k));
    // another tab announces a logout
    const other = new FakeChannel();
    other.postMessage({ kind: 'logout', from: 'some-other-window' });
    expect(seen).toEqual(['logout']);
    // this window's own emit arrives once (as the local event), not twice
    emitAuthEvent('login');
    expect(seen).toEqual(['logout', 'login']);
    // junk is ignored
    other.postMessage({ kind: 'nonsense', from: 'x' });
    other.postMessage(null);
    expect(seen).toEqual(['logout', 'login']);
    off();
  });
});
