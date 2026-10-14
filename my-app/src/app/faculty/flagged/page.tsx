'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { CertificateFileLink } from '@/components/CertificateFileLink';

interface FlaggedCert {
  id: string;
  title: string;
  institution: string;
  date_issued: string;
  description?: string;
  file_url?: string;
  student_id: string;
  created_at: string;
  confidence_score?: number | null;
  auto_approved?: boolean | null;
  verification_details?: Record<string, unknown> | null;
}

export default function FacultyFlaggedPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FlaggedCert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/certificates/pending');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.data as FlaggedCert[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const approveOne = useCallback(async (cert: FlaggedCert) => {
    setActioning(true);
    setActionError(null);
    try {
      const res = await fetch('/api/certificates/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId: cert.id, status: 'approved', approveReason: 'manual review pass' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Approve failed');
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setActioning(false);
      load();
    }
  }, [load]);

  const rejectOne = useCallback(async (cert: FlaggedCert) => {
    setActioning(true);
    setActionError(null);
    try {
      const res = await fetch('/api/certificates/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId: cert.id, status: 'rejected', rejectReason: 'failed manual review' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Reject failed');
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setActioning(false);
      load();
    }
  }, [load]);

  const batchApprove = useCallback(async () => {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (ids.length === 0) return;
    setActioning(true);
    setActionError(null);
    try {
      const failures: string[] = [];
      for (const id of ids) {
        try {
          const res = await fetch('/api/certificates/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ certificateId: id, status: 'approved', approveReason: 'batch manual approve' }),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            failures.push(`${id}: ${json.error || res.statusText || 'failed'}`);
          }
        } catch (e: unknown) {
          failures.push(`${id}: ${e instanceof Error ? e.message : 'network error'}`);
        }
      }
      if (failures.length > 0) {
        setActionError(`${failures.length} of ${ids.length} failed - ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '; ...' : ''}`);
      }
    } finally {
      setActioning(false);
      setSelected({});
      load();
    }
  }, [selected, load]);

  const batchReject = useCallback(async () => {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (ids.length === 0) return;
    setActioning(true);
    setActionError(null);
    try {
      const failures: string[] = [];
      for (const id of ids) {
        try {
          const res = await fetch('/api/certificates/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ certificateId: id, status: 'rejected', rejectReason: 'batch manual reject' }),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            failures.push(`${id}: ${json.error || res.statusText || 'failed'}`);
          }
        } catch (e: unknown) {
          failures.push(`${id}: ${e instanceof Error ? e.message : 'network error'}`);
        }
      }
      if (failures.length > 0) {
        setActionError(`${failures.length} of ${ids.length} failed - ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '; ...' : ''}`);
      }
    } finally {
      setActioning(false);
      setSelected({});
      load();
    }
  }, [selected, load]);

  const content = useMemo(() => {
    if (loading) return <p className="text-white/80">Loading…</p>;
    if (error) return <p className="text-rose-300">{error}</p>;
    if (rows.length === 0) return <p className="text-white/80">No flagged certificates.</p>;

    return (
      <div className="space-y-4">
        {actionError && <p role="alert" className="text-rose-300">{actionError}</p>}
        <div className="flex gap-2">
          <button disabled={actioning} onClick={batchApprove} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700 transition-all disabled:opacity-50">Batch Approve</button>
          <button disabled={actioning} onClick={batchReject} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-rose-700 transition-all disabled:opacity-50">Batch Reject</button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/10 text-white/80">
                <th className="p-3"><input type="checkbox" onChange={(e) => {
                  const checked = e.target.checked;
                  const map: Record<string, boolean> = {};
                  rows.forEach(r => { map[r.id] = checked; });
                  setSelected(map);
                }} /></th>
                <th className="p-3">Title</th>
                <th className="p-3">Confidence</th>
                <th className="p-3">Explainability</th>
                <th className="p-3">File</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const conf = r.confidence_score ?? null;
                return (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="p-3"><input type="checkbox" checked={!!selected[r.id]} onChange={() => toggle(r.id)} /></td>
                    <td className="p-3 text-white">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-white/70 text-sm">{r.institution} • {new Date(r.date_issued).toLocaleDateString()}</div>
                      <div className="text-white/60 text-xs">{r.student_id}</div>
                    </td>
                    <td className="p-3 text-white/80">{conf !== null ? `${(Number(conf) * 100).toFixed(1)}%` : '-'}</td>
                    <td className="p-3">
                      {r.verification_details ? (() => {
                        const details = r.verification_details as Record<string, unknown>;
                        const qrVerif = details?.qr_verification as Record<string, unknown> | undefined;
                        const logoMatch = details?.logo_match as Record<string, unknown> | undefined;
                        const templateMatch = details?.template_match as Record<string, unknown> | undefined;
                        const aiConf = details?.ai_confidence as Record<string, unknown> | undefined;
                        
                        return (
                          <div className="text-white/80 text-sm space-y-1">
                            {qrVerif && <div>QR: {qrVerif.verified ? 'verified' : 'not verified'}</div>}
                            {logoMatch?.score !== undefined && <div>Logo match: {typeof logoMatch.score === 'number' ? logoMatch.score.toFixed(2) : String(logoMatch.score)}</div>}
                            {templateMatch?.score !== undefined && <div>Template: {typeof templateMatch.score === 'number' ? templateMatch.score.toFixed(2) : String(templateMatch.score)}</div>}
                            {aiConf?.score !== undefined && <div>AI: {typeof aiConf.score === 'number' ? aiConf.score.toFixed(2) : String(aiConf.score)}</div>}
                          </div>
                        );
                      })() : <span className="text-white/50">-</span>}
                    </td>
                    <td className="p-3">{r.file_url ? <CertificateFileLink certificateId={r.id} className="text-blue-300 underline">View</CertificateFileLink> : <span className="text-white/50">-</span>}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button disabled={actioning} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700 transition-all disabled:opacity-50" onClick={() => approveOne(r)}>Approve</button>
                        <button disabled={actioning} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-rose-700 transition-all disabled:opacity-50" onClick={() => rejectOne(r)}>Reject</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }, [loading, error, actionError, rows, selected, actioning, toggle, batchApprove, batchReject, approveOne, rejectOne]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-6xl mx-auto px-6">
        <h1 className="text-white text-2xl font-bold mb-6 flex items-center gap-2"><AlertCircle className="w-6 h-6" /> Flagged Certificates</h1>
        {content}
      </div>
    </div>
  );
}


