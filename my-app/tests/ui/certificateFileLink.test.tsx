import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ApiError } from '@/lib/apiClient';

const h = vi.hoisted(() => ({ apiFetchJson: vi.fn() }));

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return { ...actual, apiFetchJson: h.apiFetchJson };
});

import { CertificateFileLink } from '@/components/CertificateFileLink';

const ID = '00000010-0000-4000-8000-000000000000';
const SIGNED = 'https://proj.supabase.co/storage/v1/object/sign/certificates/u/f.pdf?token=t';

function fakeTab() {
  return { opener: {} as unknown, close: vi.fn(), location: { href: '' } };
}

beforeEach(() => {
  h.apiFetchJson.mockReset();
});

describe('<CertificateFileLink>', () => {
  it('renders no href: the file is only reachable through the server', () => {
    const { container } = render(<CertificateFileLink certificateId={ID} title="View">x</CertificateFileLink>);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
  });

  it('asks the server for a signed URL on click and points the opened tab at it', async () => {
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    h.apiFetchJson.mockResolvedValue({ url: SIGNED, expiresIn: 300 });

    render(<CertificateFileLink certificateId={ID}>View</CertificateFileLink>);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(tab.location.href).toBe(SIGNED));
    expect(h.apiFetchJson).toHaveBeenCalledWith(`/api/certificates/${ID}/file`, { cache: 'no-store' });
    expect(open).toHaveBeenCalledTimes(1);
    expect(tab.opener).toBeNull();
  });

  it('shows a loading state while the URL is fetched', async () => {
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    let resolve!: (v: unknown) => void;
    h.apiFetchJson.mockReturnValue(new Promise((r) => { resolve = r; }));

    render(<CertificateFileLink certificateId={ID}>View</CertificateFileLink>);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true'));
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);

    resolve({ url: SIGNED });
    await waitFor(() => expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('false'));
  });

  it('shows a generic error and closes the blank tab when the server refuses', async () => {
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    h.apiFetchJson.mockRejectedValue(new ApiError('relation "secret" does not exist', 404));

    render(<CertificateFileLink certificateId={ID}>View</CertificateFileLink>);
    fireEvent.click(screen.getByRole('button'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('File unavailable');
    expect(document.body.textContent).not.toContain('secret');
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe('');
  });

  it('rejects a non-http(s) URL from the server', async () => {
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    h.apiFetchJson.mockResolvedValue({ url: 'javascript:alert(1)' });

    render(<CertificateFileLink certificateId={ID}>View</CertificateFileLink>);
    fireEvent.click(screen.getByRole('button'));

    expect((await screen.findByRole('alert')).textContent).toBe('File unavailable');
    expect(tab.location.href).toBe('');
  });

  it('falls back to opening the URL directly when the pop-up was blocked', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValueOnce(null).mockReturnValue(null);
    h.apiFetchJson.mockResolvedValue({ url: SIGNED });

    render(<CertificateFileLink certificateId={ID}>View</CertificateFileLink>);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(open).toHaveBeenCalledWith(SIGNED, '_blank', 'noopener,noreferrer'));
  });
});
