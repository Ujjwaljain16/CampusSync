'use client';

import React, { use, useCallback, useEffect, useState } from 'react';

interface PortfolioCertificate {
  id: string;
  title: string | null;
  institution: string | null;
  date_issued: string | null;
  credential?: { id: string; jws?: string };
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; certificates: PortfolioCertificate[] }
  | { kind: 'private' }
  | { kind: 'error'; message: string };

type VerifyState = 'checking' | 'valid' | 'invalid' | 'unavailable';

const MAX_AUTO_VERIFY = 20;

const shell = 'min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10';

/**
 * Public portfolio. API contract: GET /api/public/portfolio/:id ->
 *   { data: { certificates: [{ id, title, institution, date_issued, credential?: { id, jws? } }] } }
 * 404 means private or unknown (deliberately indistinguishable).
 */
export default function PublicPortfolioPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [verify, setVerify] = useState<Record<string, VerifyState>>({});

  const verifyOne = useCallback(async (cert: PortfolioCertificate, signal?: AbortSignal) => {
    const jws = cert.credential?.jws;
    if (!jws) return;
    setVerify((prev) => ({ ...prev, [cert.id]: 'checking' }));
    try {
      const res = await fetch('/api/certificates/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jws }),
        signal,
      });
      if (!res.ok) {
        // e.g. 429 - could not be checked, which is different from "invalid"
        setVerify((prev) => ({ ...prev, [cert.id]: 'unavailable' }));
        return;
      }
      const json = await res.json();
      setVerify((prev) => ({ ...prev, [cert.id]: json?.data?.valid === true ? 'valid' : 'invalid' }));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setVerify((prev) => ({ ...prev, [cert.id]: 'unavailable' }));
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setState({ kind: 'loading' });
    setVerify({});

    (async () => {
      try {
        const res = await fetch(`/api/public/portfolio/${encodeURIComponent(userId)}`, { signal: controller.signal });
        if (res.status === 404) {
          setState({ kind: 'private' });
          return;
        }
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setState({ kind: 'error', message: (json && typeof json.error === 'string' && json.error) || 'Failed to load portfolio' });
          return;
        }
        // Envelope: { data: { certificates } }
        const certificates: PortfolioCertificate[] = Array.isArray(json?.data?.certificates) ? json.data.certificates : [];
        setState({ kind: 'ready', certificates });

        // Check signatures sequentially (the verify endpoint is rate limited).
        for (const cert of certificates.filter((c) => c.credential?.jws).slice(0, MAX_AUTO_VERIFY)) {
          if (controller.signal.aborted) return;
          await verifyOne(cert, controller.signal);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setState({ kind: 'error', message: 'Failed to load portfolio' });
      }
    })();

    return () => controller.abort();
  }, [userId, verifyOne]);

  const status = (() => {
    switch (state.kind) {
      case 'loading':
        return 'Loading portfolio…';
      case 'private':
        return 'This portfolio is private.';
      case 'error':
        return state.message;
      case 'ready':
        return state.certificates.length === 0
          ? 'No verified credentials yet.'
          : `${state.certificates.length} verified credential${state.certificates.length === 1 ? '' : 's'}`;
    }
  })();

  return (
    <div className={shell}>
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-white text-2xl font-bold mb-6">Public Portfolio</h1>
        <p
          role={state.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={state.kind === 'error' ? 'text-red-400 mb-4' : 'text-white/80 mb-4'}
        >
          {status}
        </p>

        {state.kind === 'ready' && state.certificates.length > 0 && (
          <ul className="space-y-4">
            {state.certificates.map((cert) => {
              const v = verify[cert.id];
              const hasJws = Boolean(cert.credential?.jws);
              return (
                <li key={cert.id} className="rounded-2xl p-5 border border-white/20 bg-white/5 backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-white font-medium">{cert.title || 'Untitled credential'}</p>
                      {cert.institution && <p className="text-sm text-white/70">{cert.institution}</p>}
                      <p className="text-sm text-white/70">
                        {cert.date_issued && !Number.isNaN(Date.parse(cert.date_issued))
                          ? `Issued ${new Date(cert.date_issued).toLocaleDateString()}`
                          : 'Issue date not available'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3" aria-live="polite">
                      {hasJws ? (
                        <>
                          {v === 'checking' && <span className="text-white/70">Checking signature…</span>}
                          {v === 'valid' && <span className="text-emerald-300">Signature verified</span>}
                          {v === 'invalid' && <span className="text-rose-300">Signature invalid</span>}
                          {(v === 'unavailable' || v === undefined) && (
                            <button
                              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-all"
                              onClick={() => verifyOne(cert)}
                            >
                              Verify credential
                            </button>
                          )}
                          {v === 'unavailable' && <span className="text-yellow-300">Could not check</span>}
                          {v === 'invalid' && (
                            <button
                              className="bg-white/10 text-white px-3 py-1.5 rounded-lg hover:bg-white/20"
                              onClick={() => verifyOne(cert)}
                            >
                              Retry
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-white/50 text-sm">No signed credential</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
