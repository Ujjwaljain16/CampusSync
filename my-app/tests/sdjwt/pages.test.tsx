import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import VerifySdPage from '@/app/verify/sd/page';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function stubFetch(data: Record<string, unknown>, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('/verify/sd page', () => {
  it('shows a helpful message when the link has no fragment', async () => {
    window.location.hash = '';
    const fetchMock = stubFetch({});
    render(<VerifySdPage />);
    await waitFor(() => expect(screen.getByText(/No credential found in this link/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the presentation from the URL fragment, posts it, and lists disclosed and withheld claims', async () => {
    window.location.hash = '#header.payload.sig~disclosure~';
    const fetchMock = stubFetch({
      valid: true,
      reason: 'ok',
      claims: { title: 'BSc Computer Science', institution: 'Northfield University' },
      disclosed: ['title', 'institution'],
      notDisclosed: ['date_issued', 'certificate_id'],
      keyBound: false,
      keyBinding: null,
      issuer: 'did:web:example.org',
      expiresAt: 1_900_000_000,
      credentialStatus: 'active',
    });
    render(<VerifySdPage />);
    await waitFor(() => expect(screen.getByText(/Valid: signed by the issuer/i)).toBeTruthy());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/credentials/sd/verify');
    expect(JSON.parse(init.body as string)).toEqual({ presentation: 'header.payload.sig~disclosure~' });

    expect(screen.getByText('BSc Computer Science')).toBeTruthy();
    expect(screen.getByText('Northfield University')).toBeTruthy();
    // withheld claims are named, but never shown with a value
    expect(screen.getByText('Date issued')).toBeTruthy();
    expect(screen.getByText('Certificate reference id')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders an invalid result with a plain-language reason and no claim values', async () => {
    window.location.hash = '#a.b.c~';
    stubFetch({
      valid: false,
      reason: 'credential_revoked',
      claims: {},
      disclosed: [],
      notDisclosed: [],
      keyBound: false,
      issuer: null,
      expiresAt: null,
      credentialStatus: 'revoked',
    });
    render(<VerifySdPage />);
    await waitFor(() => expect(screen.getByText('Not valid')).toBeTruthy());
    expect(screen.getByText(/revoked the underlying credential/i)).toBeTruthy();
  });

  it('escapes claim values instead of rendering HTML', async () => {
    window.location.hash = '#a.b.c~d~';
    stubFetch({
      valid: true,
      reason: 'ok',
      claims: { title: '<img src=x onerror=alert(1)>' },
      disclosed: ['title'],
      notDisclosed: [],
      keyBound: false,
      issuer: 'did:web:example.org',
      expiresAt: null,
      credentialStatus: 'active',
    });
    const { container } = render(<VerifySdPage />);
    await waitFor(() => expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy());
    expect(container.querySelector('img')).toBeNull();
  });
});
