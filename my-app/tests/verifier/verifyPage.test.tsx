/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * UI wiring of the public /verify page. The cryptography is covered by verify.test.ts and
 * interop.test.ts; here the verifier module is replaced so only the page behaviour is under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ verify: null as any }));
vi.mock('@/lib/offlineVerify/verify.mjs', () => ({
  verifyCredentialOffline: (...a: unknown[]) => h.verify(...a),
}));

import VerifyPage from '@/app/verify/page';

const validResult = {
  valid: true,
  reason: 'ok',
  signatureVerified: true,
  issuer: 'did:web:campussync.test',
  subject: 'student-1',
  credentialId: 'urn:uuid:abc',
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2028-01-01T00:00:00.000Z',
  keyId: 'kid-1',
  revoked: false,
  credential: { credentialSubject: { id: 'student-1', title: 'Intro <b>to</b> Testing' } },
  checks: [
    { id: 'signature', ok: true, detail: 'EdDSA signature valid' },
    { id: 'status', ok: true, detail: 'bit 5 is clear' },
  ],
};

beforeEach(() => {
  cleanup();
  h.verify = vi.fn(async () => validResult);
});

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('/verify page', () => {
  it('has labelled inputs and an aria-live result region', () => {
    render(<VerifyPage />);
    for (const l of [/Credential \(compact JWS/, /Or choose a credential file/, /Expected issuer/, /Issuer keys URL/, /Or paste a JWKS/]) {
      expect(screen.getByLabelText(l)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Verify credential' })).toBeTruthy();
    expect(screen.getByLabelText('Verification result').getAttribute('aria-live')).toBe('polite');
  });

  it('verifies in the browser and shows each check and the signed fields (as text, not HTML)', async () => {
    render(<VerifyPage />);
    type(/Credential \(compact JWS/, 'a.b.c');
    type(/Expected issuer/, 'did:web:campussync.test');
    fireEvent.click(screen.getByRole('button', { name: 'Verify credential' }));

    expect(await screen.findByText('Valid credential')).toBeTruthy();
    expect(h.verify).toHaveBeenCalledWith('a.b.c', { jwks: undefined, jwksUrl: undefined, expectedIssuer: 'did:web:campussync.test' });
    expect(screen.getByText(/EdDSA signature valid/)).toBeTruthy();
    expect(screen.getByText(/bit 5 is clear/)).toBeTruthy();
    expect(screen.getAllByText('Passed').length).toBe(2);
    expect(screen.getByText('urn:uuid:abc')).toBeTruthy();
    // credential text is rendered as text; no element was created from it
    expect(document.querySelector('pre b')).toBeNull();
    expect(screen.getByLabelText('Credential subject').textContent).toContain('<b>to</b>');
  });

  it('shows a failure with a plain-language reason and the stable code', async () => {
    h.verify = vi.fn(async () => ({ ...validResult, valid: false, reason: 'revoked', revoked: true, checks: [{ id: 'status', ok: false, detail: 'bit 5 is set' }] }));
    render(<VerifyPage />);
    type(/Credential \(compact JWS/, 'a.b.c');
    fireEvent.click(screen.getByRole('button', { name: 'Verify credential' }));
    expect(await screen.findByText('Not valid')).toBeTruthy();
    expect(screen.getByText(/revoked this credential/)).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('revoked', { selector: 'code' })).toBeTruthy();
  });

  it('passes a pasted JWKS (and takes precedence over a URL); the URL is used otherwise', async () => {
    render(<VerifyPage />);
    type(/Credential \(compact JWS/, 'a.b.c');
    type(/Issuer keys URL/, 'https://keys.example/jwks.json');
    fireEvent.click(screen.getByRole('button', { name: 'Verify credential' }));
    await waitFor(() => expect(h.verify).toHaveBeenCalledTimes(1));
    expect((h.verify as any).mock.calls[0][1]).toMatchObject({ jwksUrl: 'https://keys.example/jwks.json', jwks: undefined });

    type(/Or paste a JWKS/, '{"keys":[]}');
    fireEvent.click(screen.getByRole('button', { name: 'Verify credential' }));
    await waitFor(() => expect(h.verify).toHaveBeenCalledTimes(2));
    expect((h.verify as any).mock.calls[1][1]).toMatchObject({ jwks: { keys: [] }, jwksUrl: undefined });
  });

  it('reports unparsable pasted keys with role=alert and does not call the verifier', async () => {
    render(<VerifyPage />);
    type(/Credential \(compact JWS/, 'a.b.c');
    type(/Or paste a JWKS/, '{nope');
    fireEvent.click(screen.getByRole('button', { name: 'Verify credential' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not valid JSON/);
    expect(h.verify).not.toHaveBeenCalled();
  });

  it('rejects oversized credential files', async () => {
    render(<VerifyPage />);
    const input = screen.getByLabelText(/Or choose a credential file/) as HTMLInputElement;
    const big = new File(['x'.repeat(100_001)], 'big.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [big] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/too large/);
  });
});
