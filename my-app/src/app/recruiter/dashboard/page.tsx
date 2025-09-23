'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface StudentRow {
  user_id: string;
  skills?: string[];
  institutions?: string[];
  certificates?: { id: string; title: string; institution: string; date_issued?: string; verification_status?: string; credential?: any }[];
  portfolio_url?: string;
}

export default function RecruiterDashboard() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, boolean>>({});
  const [pagination, setPagination] = useState<{ total: number; limit: number; offset: number; has_more: boolean } | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/recruiter/search-students', window.location.origin);
      if (q) url.searchParams.set('q', q);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      setRows(json.data?.students || []);
      setPagination(json.data?.pagination || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { search(); }, []);

  const bulkVerify = useCallback(async (credentialIds: string[]) => {
    for (const id of credentialIds) {
      try {
        const url = new URL('/api/recruiter/verify-credential', window.location.origin);
        url.searchParams.set('id', id);
        const res = await fetch(url.toString());
        const json = await res.json();
        setVerifyResult(prev => ({ ...prev, [id]: !!json?.data?.valid }));
      } catch {
        setVerifyResult(prev => ({ ...prev, [id]: false }));
      }
    }
  }, []);

  const content = useMemo(() => {
    if (loading) return <p className="text-white/80">Loading…</p>;
    if (error) return <p className="text-rose-300">{error}</p>;
    return (
      <div className="space-y-4">
        {rows.map(r => (
          <div key={r.user_id} className="rounded-2xl p-5 border border-white/20 bg-white/5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-semibold">{r.user_id}</div>
                <div className="text-white/70 text-sm">Skills: {(r.skills || []).join(', ') || '-'}</div>
                <div className="text-white/70 text-sm">Institutions: {(r.institutions || []).join(', ') || '-'}</div>
              </div>
              <div className="flex items-center gap-2">
                {r.portfolio_url && <a className="text-blue-300 underline" href={r.portfolio_url} target="_blank" rel="noreferrer">Portfolio</a>}
                <button className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-all" onClick={() => bulkVerify((r.certificates || []).map(c => c.id))}>Bulk Verify</button>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-white/80 text-sm mb-2">Certificates</div>
              <ul className="grid md:grid-cols-2 gap-3">
                {(r.certificates || []).map((c: any) => (
                  <li key={c.id} className="p-3 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-white">{c.title}</div>
                      <div className="text-white/70 text-sm">{c.institution}</div>
                      <div className="text-white/60 text-xs">{c.date_issued ? new Date(c.date_issued).toLocaleDateString() : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="bg-white/10 text-white px-2 py-1 rounded-lg" onClick={() => bulkVerify([c.id])}>Verify</button>
                      {verifyResult[c.id] === true && <span className="text-emerald-300 text-sm">Valid</span>}
                      {verifyResult[c.id] === false && <span className="text-rose-300 text-sm">Invalid</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
        {pagination && (
          <div className="flex items-center justify-between text-white/80">
            <div>Total: {pagination.total}</div>
            <div className="flex gap-2">
              <button disabled={pagination.offset <= 0} onClick={() => {
                const prevOffset = Math.max(0, (pagination.offset || 0) - (pagination.limit || 20));
                const url = new URL('/api/recruiter/search-students', window.location.origin);
                if (q) url.searchParams.set('q', q);
                url.searchParams.set('offset', String(prevOffset));
                url.searchParams.set('limit', String(pagination.limit || 20));
                fetch(url.toString()).then(res => res.json()).then(json => {
                  setRows(json.data?.students || []);
                  setPagination(json.data?.pagination || null);
                });
              }} className="bg-white/10 px-3 py-1.5 rounded-lg disabled:opacity-50">Prev</button>
              <button disabled={!pagination.has_more} onClick={() => {
                const nextOffset = (pagination.offset || 0) + (pagination.limit || 20);
                const url = new URL('/api/recruiter/search-students', window.location.origin);
                if (q) url.searchParams.set('q', q);
                url.searchParams.set('offset', String(nextOffset));
                url.searchParams.set('limit', String(pagination.limit || 20));
                fetch(url.toString()).then(res => res.json()).then(json => {
                  setRows(json.data?.students || []);
                  setPagination(json.data?.pagination || null);
                });
              }} className="bg-white/10 px-3 py-1.5 rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    );
  }, [rows, loading, error, verifyResult, bulkVerify]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-6xl mx-auto px-6">
        <h1 className="text-white text-2xl font-bold mb-6">Recruiter Dashboard</h1>
        <div className="mb-4 flex gap-2">
          <input className="px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 w-full" placeholder="Search students by skill/certification" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={search} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-all">Search</button>
        </div>
        {content}
      </div>
    </div>
  );
}


