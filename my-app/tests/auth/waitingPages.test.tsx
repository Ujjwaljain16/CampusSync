import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push, refresh: () => undefined }) }));

import FacultyWaitingPage from '@/app/faculty/waiting/page';
import RecruiterWaitingPage from '@/app/recruiter/waiting/page';
import WaitingPage from '@/app/waiting/page';

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

let responses: Array<() => Response>;
let fetchMock: ReturnType<typeof vi.fn>;
function installFetch() {
  fetchMock = vi.fn(async () => (responses.length > 1 ? responses.shift()! : responses[0])());
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
  push.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const facultyBody = (approval_status: string) => ({
  role: 'faculty',
  has_role: true,
  organization_id: 'org-1',
  organization_name: 'Northfield University',
  approval_status,
  requested_at: '2026-02-01T00:00:00Z',
  approved_at: approval_status === 'approved' ? '2026-02-02T00:00:00Z' : null,
  approval_notes: null,
});

describe('waiting pages use no browser Supabase client', () => {
  it.each(['src/app/waiting/page.tsx', 'src/app/faculty/waiting/page.tsx', 'src/app/recruiter/waiting/page.tsx'])('%s', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(src).not.toMatch(/supabase\/client|supabaseClient|createBrowserClient|@supabase\/|\.channel\(|postgres_changes|removeChannel/);
  });
});

describe('/faculty/waiting', () => {
  it('polls the server, redirects 2 s after approval, then stops polling', async () => {
    responses = [() => jsonRes(facultyBody('pending')), () => jsonRes(facultyBody('pending')), () => jsonRes(facultyBody('approved'))];
    installFetch();
    render(<FacultyWaitingPage />);
    await tick(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/approval-status?role=faculty');
    expect(screen.getByText('Northfield University')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();

    await tick(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();

    await tick(10_000); // third poll: approved
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(push).not.toHaveBeenCalled();
    await tick(2_000);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/faculty/dashboard');

    await tick(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('polls only every 60 s while the tab is hidden and checks again as soon as it is shown', async () => {
    responses = [() => jsonRes(facultyBody('pending'))];
    installFetch();
    render(<FacultyWaitingPage />);
    await tick(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility('hidden'));
    await tick(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => setVisibility('visible'));
    await tick(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shows the denied state', async () => {
    responses = [() => jsonRes({ ...facultyBody('denied'), approval_notes: 'Not on the staff list' })];
    installFetch();
    render(<FacultyWaitingPage />);
    await tick(0);
    expect(screen.getByText('Request Denied')).toBeTruthy();
    expect(screen.getByText('Not on the staff list')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to /login and stops polling', async () => {
    responses = [() => jsonRes({ error: 'Not authenticated' }, 401)];
    installFetch();
    render(<FacultyWaitingPage />);
    await tick(0);
    expect(push).toHaveBeenCalledWith('/login');
    await tick(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps trying (with backoff) after a failed poll and shows the error', async () => {
    responses = [() => jsonRes({ error: 'x' }, 500), () => jsonRes(facultyBody('pending'))];
    installFetch();
    render(<FacultyWaitingPage />);
    await tick(0);
    expect(screen.getByText(/Failed to fetch approval status/)).toBeTruthy();
    await tick(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Failed to fetch approval status/)).toBeNull();
  });

  it('stops polling on unmount', async () => {
    responses = [() => jsonRes(facultyBody('pending'))];
    installFetch();
    const { unmount } = render(<FacultyWaitingPage />);
    await tick(0);
    unmount();
    await tick(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('/recruiter/waiting', () => {
  const body = (approval_status: string) => ({
    role: 'recruiter',
    has_role: true,
    organization_id: null,
    organization_name: null,
    approval_status,
    requested_at: '2026-02-01T00:00:00Z',
  });

  it('redirects to the recruiter dashboard the moment a poll reports approval, once', async () => {
    responses = [() => jsonRes(body('pending')), () => jsonRes(body('approved'))];
    installFetch();
    render(<RecruiterWaitingPage />);
    await tick(0);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/approval-status?role=recruiter');
    expect(push).not.toHaveBeenCalled();

    await tick(10_000);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/recruiter/dashboard');

    await tick(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('stays put while pending', async () => {
    responses = [() => jsonRes(body('pending'))];
    installFetch();
    render(<RecruiterWaitingPage />);
    await tick(35_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('/waiting (access requests)', () => {
  const requests = (status: string) => ({
    requests: [{ id: 'r1', status, organization: { id: 'o1', name: 'Northfield', slug: 'northfield' }, requested_at: '2026-02-01T00:00:00Z' }],
  });

  it('polls the access-request list and redirects once when one is approved', async () => {
    responses = [() => jsonRes(requests('pending')), () => jsonRes(requests('approved'))];
    installFetch();
    render(<WaitingPage />);
    await tick(0);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/recruiter/request-access');
    await tick(10_000);
    expect(push).not.toHaveBeenCalled();
    await tick(2_000);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/recruiter/dashboard');
    await tick(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('redirects a signed-out visitor to /login', async () => {
    responses = [() => jsonRes({ error: 'Unauthorized' }, 401)];
    installFetch();
    render(<WaitingPage />);
    await tick(0);
    expect(push).toHaveBeenCalledWith('/login');
  });
});
