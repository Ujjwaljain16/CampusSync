'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface PendingCert {
  id: string;
  title: string;
  institution: string;
  date_issued: string;
  description?: string;
  file_url?: string;
  user_id: string;
  created_at: string;
}

export default function FacultyDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingCert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/certificates/pending');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.data as PendingCert[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const onApprove = useCallback(async (certificateId: string, cert: PendingCert) => {
    setActioning(certificateId);
    setError(null);
    try {
      // 1) Approve
      {
        const res = await fetch('/api/certificates/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateId, status: 'approved' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Approve failed');
      }

      // 2) Issue VC
      {
        const subject = {
          id: cert.user_id,
          certificateId: cert.id,
          title: cert.title,
          institution: cert.institution,
          dateIssued: cert.date_issued,
          description: cert.description,
        };
        const res = await fetch('/api/certificates/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentialSubject: subject }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Issuance failed');
      }

      await fetchRows();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setActioning(null);
    }
  }, [fetchRows]);

  const onReject = useCallback(async (certificateId: string) => {
    setActioning(certificateId);
    setError(null);
    try {
      const res = await fetch('/api/certificates/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId, status: 'rejected' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Reject failed');
      await fetchRows();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setActioning(null);
    }
  }, [fetchRows]);

  const content = useMemo(() => {
    if (loading) return <p className="text-white/90">Loading…</p>;
    if (error) return <p className="text-red-400">{error}</p>;
    if (rows.length === 0) return <p className="text-white/80">No pending certificates.</p>;
    return (
      <div className="overflow-x-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/10 text-white/80">
              <th className="p-3">Title</th>
              <th className="p-3">Student</th>
              <th className="p-3">Institution</th>
              <th className="p-3">Date</th>
              <th className="p-3">File</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="p-3 text-white">{r.title}</td>
                <td className="p-3 text-white/80">{r.user_id}</td>
                <td className="p-3 text-white/80">{r.institution}</td>
                <td className="p-3 text-white/80">{new Date(r.date_issued).toLocaleDateString()}</td>
                <td className="p-3">{r.file_url ? <a className="text-blue-300 underline" href={r.file_url} target="_blank" rel="noreferrer">View</a> : <span className="text-white/50">-</span>}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700 transition-all disabled:opacity-50" onClick={() => onApprove(r.id, r)} disabled={actioning === r.id}>Approve + Issue</button>
                    <button className="bg-rose-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-rose-700 transition-all disabled:opacity-50" onClick={() => onReject(r.id)} disabled={actioning === r.id}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [loading, error, rows, actioning, onApprove, onReject]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-6">
          <h1 className="text-white text-2xl font-bold">Faculty Dashboard</h1>
          <p className="text-white/70">Review pending certificates and issue credentials</p>
        </div>
        {content}
      </div>
    </div>
  );
}


