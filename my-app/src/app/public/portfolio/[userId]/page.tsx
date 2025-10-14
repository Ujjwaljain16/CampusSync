'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { VerifiableCredential } from '@/types/index';

interface Row {
  id: string;
  issuer: string;
  issuance_date: string;
  credential: VerifiableCredential;
}

export default function PublicPortfolioPage({ params }: { params: Promise<{ userId: string }> }) {
  const [userId, setUserId] = useState<string>('');
  
  useEffect(() => {
    params.then(p => setUserId(p.userId));
  }, [params]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/portfolio/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.data as Row[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const onVerify = useCallback(async (row: Row) => {
    try {
      const jws = row.credential.proof?.jws;
      if (!jws) throw new Error('No JWS on credential');
      const res = await fetch('/api/certificates/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jws }),
      });
      const json = await res.json();
      const ok = Boolean(json?.data?.valid);
      setVerifyResult(prev => ({ ...prev, [row.id]: ok }));
    } catch {
      setVerifyResult(prev => ({ ...prev, [row.id]: false }));
    }
  }, []);

  if (loading) return <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10"><div className="max-w-5xl mx-auto px-6 text-white/90">Loading…</div></div>;
  if (error) return <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10"><div className="max-w-5xl mx-auto px-6 text-red-400">{error}</div></div>;

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-white text-2xl font-bold mb-6">Public Portfolio</h1>
        {rows.length === 0 ? (
          <p className="text-white/80">No credentials yet.</p>
        ) : (
          <ul className="space-y-4">
            {rows.map(r => (
              <li key={r.id} className="rounded-2xl p-5 border border-white/20 bg-white/5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white font-medium">{r.credential.credentialSubject.title}</p>
                    <p className="text-sm text-white/70">{r.credential.credentialSubject.institution}</p>
                    <p className="text-sm text-white/70">Issued {new Date(r.issuance_date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-all" onClick={() => onVerify(r)}>
                      Verify Credential
                    </button>
                    {verifyResult[r.id] === true && <span className="text-emerald-300">Valid</span>}
                    {verifyResult[r.id] === false && <span className="text-rose-300">Invalid</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


