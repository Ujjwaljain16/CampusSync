'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { apiFetchJson, ApiError } from '@/lib/apiClient';
import { generateHolderKey, present } from '@/lib/sdjwt';

interface CertRow {
  id: string;
  title: string;
  institution: string;
  date_issued: string;
  verification_status: string;
}

interface IssueResponse {
  sdJwt: string;
  disclosable: string[];
  expiresAt: string;
}

interface ShareResult {
  url: string;
  revealed: string[];
  expiresAt: string;
  bound: boolean;
}

const CLAIM_OPTIONS: Array<{ name: string; label: string; hint: string }> = [
  { name: 'title', label: 'Credential title', hint: 'e.g. "BSc Computer Science"' },
  { name: 'institution', label: 'Institution', hint: 'The issuing institution' },
  { name: 'date_issued', label: 'Date issued', hint: 'When the certificate was issued' },
  { name: 'certificate_id', label: 'Certificate reference id', hint: 'The internal id of this certificate' },
];

function randomNonce(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Student-controlled selective disclosure. The full SD-JWT (with every
 * disclosure) is fetched from the server over the authenticated session and
 * lives only in this tab. The presentation is built HERE in the browser from
 * the claims the student ticks, and the share link carries it in the URL
 * fragment, which browsers never send to any server.
 */
export default function StudentSharePage() {
  const baseId = useId();
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [bind, setBind] = useState(false);
  const [audience, setAudience] = useState('');
  const [nonce, setNonce] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetchJson<CertRow[]>('/api/certificates/mine');
      const verified = (Array.isArray(rows) ? rows : []).filter((r) => r.verification_status === 'verified');
      setCerts(verified);
      const preselect = new URLSearchParams(window.location.search).get('cert');
      if (preselect && verified.some((c) => c.id === preselect)) setSelected(preselect);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your certificates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = CLAIM_OPTIONS.filter((c) => reveal[c.name]).map((c) => c.name);

  async function createLink() {
    setError(null);
    setResult(null);
    setCopied(false);
    if (!selected) {
      setError('Choose a certificate first.');
      return;
    }
    setBusy(true);
    try {
      const holder = bind ? await generateHolderKey() : null;
      const issued = await apiFetchJson<IssueResponse>('/api/credentials/sd/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId: selected, ...(holder ? { holderPublicJwk: holder.publicJwk } : {}) }),
      });
      const available = new Set(issued.disclosable);
      const revealNow = chosen.filter((n) => available.has(n));
      const aud = audience.trim() || undefined;
      const non = bind ? nonce.trim() || randomNonce() : undefined;
      const presentation = await present(issued.sdJwt, {
        reveal: revealNow,
        holderKey: holder?.privateKey,
        audience: bind ? aud : undefined,
        nonce: non,
      });
      // The full SD-JWT (all disclosures) is dropped here; only the presentation is kept.
      setResult({
        url: `${window.location.origin}/verify/sd#${presentation}`,
        revealed: revealNow,
        expiresAt: issued.expiresAt,
        bound: Boolean(holder),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the share link. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      setCopied(false);
      setError('Copy failed. Select the link text and copy it manually.');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm">
        <Link href="/student/dashboard" className="underline">
          &larr; Back to dashboard
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Share a credential</h1>
      <p className="mt-2 text-sm text-gray-600">
        Choose exactly which facts a recipient can see. Anything you leave unticked stays hidden: it is not included in
        the link at all, so the recipient cannot recover it. The recipient can check that the issuer signed what you
        reveal.
      </p>

      <div role="alert" aria-live="assertive" className="mt-4 min-h-6 text-sm text-red-700">
        {error}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-gray-600">Loading&hellip;</p>
      ) : certs.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">You have no verified certificates to share yet.</p>
      ) : (
        <form
          className="mt-4 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void createLink();
          }}
        >
          <div>
            <label htmlFor={`${baseId}-cert`} className="block text-sm font-medium">
              Certificate
            </label>
            <select
              id={`${baseId}-cert`}
              className="mt-1 w-full rounded border p-2 text-sm"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setResult(null);
              }}
            >
              <option value="">Select a verified certificate&hellip;</option>
              {certs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} &mdash; {c.institution}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Facts to reveal</legend>
            <p className="text-xs text-gray-600">Nothing is revealed unless you tick it. Your name, email and phone are never part of this credential.</p>
            <div className="mt-2 space-y-2">
              {CLAIM_OPTIONS.map((c) => (
                <div key={c.name} className="flex items-start gap-3">
                  <input
                    id={`${baseId}-${c.name}`}
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={Boolean(reveal[c.name])}
                    onChange={(e) => {
                      setReveal((prev) => ({ ...prev, [c.name]: e.target.checked }));
                      setResult(null);
                    }}
                  />
                  <label htmlFor={`${baseId}-${c.name}`} className="text-sm">
                    <span className="block font-medium">{c.label}</span>
                    <span className="text-gray-600">{c.hint}</span>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">Recipient label (optional)</legend>
            <div className="mt-2 flex items-start gap-3">
              <input
                id={`${baseId}-bind`}
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={bind}
                onChange={(e) => setBind(e.target.checked)}
              />
              <label htmlFor={`${baseId}-bind`} className="text-sm">
                <span className="block font-medium">Sign a recipient label into the link</span>
                <span className="text-gray-600">
                  Creates a one-time key in this browser that signs the audience and nonce below together with exactly
                  what you reveal. This is an integrity label, not a lock: anyone who has the link can still open it.
                </span>
              </label>
            </div>
            {bind && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${baseId}-aud`} className="block text-sm">
                    Audience (e.g. recruiter or company)
                  </label>
                  <input
                    id={`${baseId}-aud`}
                    className="mt-1 w-full rounded border p-2 text-sm"
                    value={audience}
                    maxLength={200}
                    onChange={(e) => setAudience(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor={`${baseId}-nonce`} className="block text-sm">
                    Nonce (leave empty to generate)
                  </label>
                  <input
                    id={`${baseId}-nonce`}
                    className="mt-1 w-full rounded border p-2 text-sm"
                    value={nonce}
                    maxLength={200}
                    onChange={(e) => setNonce(e.target.value)}
                  />
                </div>
              </div>
            )}
          </fieldset>

          <button
            type="submit"
            disabled={busy || !selected}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Creating link…' : 'Create share link'}
          </button>
        </form>
      )}

      {result && (
        <section aria-labelledby={`${baseId}-result`} className="mt-8 rounded-lg border p-4">
          <h2 id={`${baseId}-result`} className="text-lg font-semibold">
            Your share link
          </h2>
          <p className="mt-1 text-sm text-gray-700">
            Reveals: {result.revealed.length > 0 ? result.revealed.join(', ') : 'nothing except that a valid credential exists'}.
            {result.bound ? ' Signed with a recipient label.' : ''} Expires {new Date(result.expiresAt).toLocaleDateString()}.
          </p>
          <label htmlFor={`${baseId}-url`} className="mt-3 block text-sm font-medium">
            Link
          </label>
          <textarea
            id={`${baseId}-url`}
            readOnly
            rows={4}
            className="mt-1 w-full break-all rounded border p-2 font-mono text-xs"
            value={result.url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => void copy()} className="rounded border px-3 py-1.5 text-sm">
              Copy link
            </button>
            <span role="status" aria-live="polite" className="text-sm text-green-700">
              {copied ? 'Copied.' : ''}
            </span>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-gray-600">
            <li>The revealed facts live in the part of the link after the # sign, which browsers never send to a server.</li>
            <li>Anyone holding the link can see the revealed facts until the credential expires or is revoked. Share it only with people you trust.</li>
            <li>Revoking the underlying credential makes every link stop verifying.</li>
          </ul>
        </section>
      )}
    </main>
  );
}
