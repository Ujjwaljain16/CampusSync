"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Evidence = {
  qr?: { data?: string; verified?: boolean } | null;
  mrz?: { found?: boolean; valid?: boolean; lines?: string[] } | null;
  logo?: { score?: number; method?: string } | null;
  policy?: { score?: number; outcome?: string } | null;
  extracted?: Record<string, any> | null;
};

type StatusResponse = {
  documentId: string;
  type?: string;
  title?: string;
  institution?: string;
  status?: string;
  confidence?: number;
  details?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  auditTrail?: Array<{ action: string; details: Record<string, unknown>; created_at: string }>; 
};

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = (params?.id as string) || "";
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/documents/status?documentId=${documentId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load status: ${res.status}`);
        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(data);

        const evRes = await fetch(`/api/documents/evidence?documentId=${documentId}`, { cache: "no-store" });
        if (evRes.ok) {
          const ev = (await evRes.json()) as Evidence;
          if (!cancelled) setEvidence(ev);
        } else {
          // Fallback: try to use status.details shape
          const details = (data as Record<string, unknown>)?.details as Record<string, unknown> || {};
          const fallback: Evidence = {
            qr: details.qr || null,
            mrz: details.mrz || null,
            logo: details.logo || null,
            policy: details.policy || null,
            extracted: details.extracted || null,
          };
          if (!cancelled) setEvidence(fallback);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (documentId) load();
    return () => { cancelled = true; };
  }, [documentId]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Review Document</h1>
        <button className="px-3 py-2 rounded-md bg-gray-200 hover:bg-gray-300" onClick={() => router.push('/faculty/dashboard')}>Back to Dashboard</button>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && status && (
        <div className="space-y-6">
          <section className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-3">Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Document ID:</span> {status.documentId}</div>
              <div><span className="text-gray-500">Type:</span> {status.type || '-'}</div>
              <div><span className="text-gray-500">Title:</span> {status.title || '-'}</div>
              <div><span className="text-gray-500">Institution:</span> {status.institution || '-'}</div>
              <div><span className="text-gray-500">Status:</span> {status.status || '-'}</div>
              <div><span className="text-gray-500">Confidence:</span> {status.confidence ?? '-'}</div>
              <div><span className="text-gray-500">Created:</span> {status.createdAt ? new Date(status.createdAt).toLocaleString() : '-'}</div>
              <div><span className="text-gray-500">Updated:</span> {status.updatedAt ? new Date(status.updatedAt).toLocaleString() : '-'}</div>
            </div>
          </section>

          <section className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-3">Evidence</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="border rounded p-3">
                <div className="font-semibold mb-2">QR</div>
                <div>Verified: {evidence?.qr?.verified ? 'Yes' : 'No'}</div>
                <div>Data: {evidence?.qr?.data || '-'}</div>
              </div>
              <div className="border rounded p-3">
                <div className="font-semibold mb-2">MRZ</div>
                <div>Found: {evidence?.mrz?.found ? 'Yes' : 'No'}</div>
                <div>Valid: {evidence?.mrz?.valid ? 'Yes' : 'No'}</div>
                {!!evidence?.mrz?.lines?.length && (
                  <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">{evidence?.mrz?.lines?.join('\n')}</pre>
                )}
              </div>
              <div className="border rounded p-3">
                <div className="font-semibold mb-2">Logo/Template</div>
                <div>Score: {evidence?.logo?.score ?? '-'}</div>
                <div>Method: {evidence?.logo?.method || '-'}</div>
              </div>
              <div className="border rounded p-3">
                <div className="font-semibold mb-2">Policy</div>
                <div>Score: {evidence?.policy?.score ?? '-'}</div>
                <div>Outcome: {evidence?.policy?.outcome || '-'}</div>
              </div>
            </div>
          </section>

          <section className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-3">Extracted Fields</h2>
            <div className="text-sm">
              {evidence?.extracted ? (
                <table className="w-full text-left text-sm">
                  <tbody>
                    {Object.entries(evidence.extracted).map(([k, v]) => (
                      <tr key={k} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 text-gray-500 align-top">{k}</td>
                        <td className="py-2 break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-500">No extracted fields found.</div>
              )}
            </div>
          </section>

          <section className="flex gap-3">
            <button
              className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
              onClick={async () => {
                await fetch('/api/documents/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId, verificationStatus: 'verified', confidence: status?.confidence }) });
                router.refresh();
              }}
            >Approve</button>
            <button
              className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
              onClick={async () => {
                await fetch('/api/documents/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId, reason: 'Manual rejection' }) });
                router.refresh();
              }}
            >Reject</button>
          </section>
        </div>
      )}
    </div>
  );
}


