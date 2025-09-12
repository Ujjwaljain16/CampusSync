'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface Row {
  id: string;
  title: string;
  institution: string;
  date_issued: string;
  file_url?: string;
  verification_status: 'verified' | 'pending' | 'rejected';
}

export default function StudentDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [details, setDetails] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/certificates/mine');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      const list = json.data as Row[];
      setRows(list);
      // Fetch metadata for confidence per cert
      const confMap: Record<string, number> = {};
      const detMap: Record<string, any> = {};
      for (const r of list) {
        const mdRes = await fetch(`/api/certificates/metadata/${encodeURIComponent(r.id)}`);
        if (mdRes.ok) {
          const md = await mdRes.json();
          const ai = md?.data?.ai_confidence_score;
          confMap[r.id] = typeof ai === 'number' ? ai : (md?.data?.verification_details?.ai_confidence?.score ?? 0);
          detMap[r.id] = md?.data?.verification_details ?? {};
        }
      }
      setConfidence(confMap);
      setDetails(detMap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const content = useMemo(() => {
    if (loading) return <p className="text-white/80">Loading…</p>;
    if (error) return <p className="text-rose-300">{error}</p>;
    if (rows.length === 0) return <p className="text-white/80">No certificates yet.</p>;
    return (
      <div className="overflow-x-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/10 text-white/80">
              <th className="p-3">Title</th>
              <th className="p-3">Institution</th>
              <th className="p-3">Date</th>
              <th className="p-3">Status</th>
              <th className="p-3">Confidence</th>
              <th className="p-3">Reason</th>
              <th className="p-3">File</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="p-3 text-white">{r.title}</td>
                <td className="p-3 text-white/80">{r.institution}</td>
                <td className="p-3 text-white/80">{new Date(r.date_issued).toLocaleDateString()}</td>
                <td className="p-3">
                  {r.verification_status === 'verified' && <span className="text-emerald-300">auto-approved/approved</span>}
                  {r.verification_status === 'pending' && <span className="text-yellow-300">pending</span>}
                  {r.verification_status === 'rejected' && <span className="text-rose-300">rejected</span>}
                </td>
                <td className="p-3 text-white/80">{confidence[r.id] !== undefined ? `${(confidence[r.id] * 100).toFixed(1)}%` : '-'}</td>
                <td className="p-3 text-white/70 text-sm">
                  {details[r.id]?.qr_verification?.verified && 'QR verified'}
                  {!details[r.id]?.qr_verification?.verified && details[r.id]?.logo_match?.score && `Logo match ${Number(details[r.id]?.logo_match?.score).toFixed(2)}`}
                </td>
                <td className="p-3">{r.file_url ? <a className="text-blue-300 underline" href={r.file_url} target="_blank" rel="noreferrer">View</a> : <span className="text-white/50">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [rows, loading, error, confidence, details]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-6xl mx-auto px-6">
        <h1 className="text-white text-2xl font-bold mb-6">Student Dashboard</h1>
        {content}
      </div>
    </div>
  );
}


