'use client';

import { useCallback, useEffect, useId, useState } from 'react';

interface VerifyData {
  valid: boolean;
  reason: string;
  claims: Record<string, unknown>;
  disclosed: string[];
  notDisclosed: string[];
  keyBound: boolean;
  keyBinding?: { audience?: string; nonce?: string; iat: number } | null;
  issuer: string | null;
  expiresAt: number | null;
  credentialStatus: string;
}

const LABELS: Record<string, string> = {
  title: 'Credential title',
  institution: 'Institution',
  date_issued: 'Date issued',
  certificate_id: 'Certificate reference id',
  degree_level: 'Degree level',
  description: 'Description',
};

const REASONS: Record<string, string> = {
  bad_signature: 'The issuer signature does not match the content.',
  expired: 'This credential has expired.',
  not_yet_valid: 'This credential is not valid yet.',
  credential_revoked: 'The issuer has revoked the underlying credential.',
  credential_inactive: 'The underlying credential is not active.',
  credential_not_found: 'The underlying credential could not be found.',
  revocation_check_failed: 'The revocation status could not be checked, so the credential is treated as not valid.',
  unknown_disclosure_digest: 'A revealed claim was altered or does not belong to this credential.',
  duplicate_disclosure: 'A revealed claim appears more than once.',
  malformed_presentation: 'This link does not contain a readable presentation.',
  key_binding_required: 'The link carries no recipient signature, but you asked for one.',
  kb_audience_mismatch: 'The link was signed for a different audience.',
  kb_nonce_mismatch: 'The link was signed with a different nonce.',
  no_matching_key: 'The signing key is not one this service trusts.',
  issuer_mismatch: 'The credential was not issued by this service.',
  verifier_not_configured: 'Verification is not configured on this server.',
};

function label(name: string): string {
  return LABELS[name] ?? name;
}

function display(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Public verification of a shared credential. The presentation is read from
 * the URL fragment (never sent to a server by the browser); only an explicit
 * POST from this page sends it to the verification endpoint, which does not
 * store or log it.
 */
export default function VerifySdPage() {
  const baseId = useId();
  const [presentation, setPresentation] = useState<string | null>(null);
  const [audience, setAudience] = useState('');
  const [nonce, setNonce] = useState('');
  const [data, setData] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let last: string | null = null;
    const read = () => {
      const raw = window.location.hash.replace(/^#/, '');
      if (raw === last) return; // ignore no-op hashchange events
      last = raw;
      setPresentation(raw);
      setData(null);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const verify = useCallback(
    async (p: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/credentials/sd/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            presentation: p,
            ...(audience.trim() ? { audience: audience.trim() } : {}),
            ...(nonce.trim() ? { nonce: nonce.trim() } : {}),
          }),
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        });
        const json = (await res.json().catch(() => null)) as { data?: VerifyData; error?: string } | null;
        if (!res.ok || !json?.data) {
          setData(null);
          setError(res.status === 429 ? 'Too many requests. Please wait a minute and try again.' : json?.error ?? 'Verification failed.');
          return;
        }
        setData(json.data);
      } catch {
        setError('Could not reach the verification service.');
      } finally {
        setLoading(false);
      }
    },
    [audience, nonce]
  );

  // Verify automatically once a presentation is present in the fragment.
  useEffect(() => {
    if (presentation) void verify(presentation);
    // Intentionally only re-run when the presentation changes; audience/nonce use the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Verify a shared credential</h1>
      <p className="mt-2 text-sm text-gray-600">
        The holder chose which facts to reveal. This page checks the issuer&apos;s signature on exactly those facts and
        whether the credential is still active. Facts the holder withheld are not in the link and cannot be recovered.
      </p>

      <div role="alert" aria-live="assertive" className="mt-4 min-h-6 text-sm text-red-700">
        {error}
      </div>

      {presentation === null ? (
        <p className="mt-6 text-sm text-gray-600">Loading&hellip;</p>
      ) : presentation === '' ? (
        <p className="mt-6 text-sm">No credential found in this link. Ask the holder to send the full share link.</p>
      ) : (
        <>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer">Optional checks (recipient label)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${baseId}-aud`} className="block">
                  Expected audience
                </label>
                <input id={`${baseId}-aud`} className="mt-1 w-full rounded border p-2" value={audience} onChange={(e) => setAudience(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${baseId}-nonce`} className="block">
                  Expected nonce
                </label>
                <input id={`${baseId}-nonce`} className="mt-1 w-full rounded border p-2" value={nonce} onChange={(e) => setNonce(e.target.value)} />
              </div>
            </div>
            <button type="button" className="mt-2 rounded border px-3 py-1.5" disabled={loading} onClick={() => void verify(presentation)}>
              Verify again
            </button>
          </details>

          <div role="status" aria-live="polite" className="mt-6">
            {loading && <p className="text-sm text-gray-600">Verifying&hellip;</p>}
            {!loading && data && (
              <section aria-labelledby={`${baseId}-result`}>
                <h2
                  id={`${baseId}-result`}
                  className={`rounded border p-3 text-lg font-semibold ${data.valid ? 'border-green-700 text-green-800' : 'border-red-700 text-red-800'}`}
                >
                  {data.valid ? 'Valid: signed by the issuer and not revoked' : 'Not valid'}
                </h2>
                {!data.valid && <p className="mt-2 text-sm">{REASONS[data.reason] ?? `Reason code: ${data.reason}`}</p>}

                {data.valid && (
                  <>
                    <h3 className="mt-5 font-medium">Facts the holder revealed</h3>
                    {data.disclosed.length === 0 ? (
                      <p className="mt-1 text-sm text-gray-700">None. Only the existence of a valid credential is confirmed.</p>
                    ) : (
                      <dl className="mt-2 divide-y rounded border">
                        {data.disclosed.map((name) => (
                          <div key={name} className="grid gap-1 p-3 sm:grid-cols-3">
                            <dt className="text-sm text-gray-600">{label(name)}</dt>
                            <dd className="break-words text-sm sm:col-span-2">{display(data.claims[name])}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    <h3 className="mt-5 font-medium">Withheld by the holder</h3>
                    {data.notDisclosed.length === 0 ? (
                      <p className="mt-1 text-sm text-gray-700">All standard facts were revealed.</p>
                    ) : (
                      <ul className="mt-2 list-disc pl-5 text-sm">
                        {data.notDisclosed.map((name) => (
                          <li key={name}>{label(name)}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 text-xs text-gray-600">
                      Names are listed for the standard fields of this credential type; the link itself does not reveal what else exists.
                    </p>

                    <h3 className="mt-5 font-medium">Details</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      <li>Issuer: {data.issuer ?? 'unknown'}</li>
                      <li>Credential status: {data.credentialStatus}</li>
                      {data.expiresAt && <li>This link expires: {new Date(data.expiresAt * 1000).toLocaleDateString()}</li>}
                      <li>
                        Recipient label:{' '}
                        {data.keyBound
                          ? `signed by the holder${data.keyBinding?.audience ? ` for "${data.keyBinding.audience}"` : ''}${data.keyBinding?.nonce ? ` (nonce ${data.keyBinding.nonce})` : ''}`
                          : 'none'}
                      </li>
                    </ul>
                  </>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}
