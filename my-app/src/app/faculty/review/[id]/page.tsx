"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { formatConfidence, submitDocumentReview } from "@/lib/documents/reviewClient";

type Evidence = {
  qr?: { data?: string; verified?: boolean } | null;
  mrz?: { found?: boolean; valid?: boolean; lines?: string[] } | null;
  logo?: { score?: number; method?: string } | null;
  policy?: { score?: number; outcome?: string } | null;
  extracted?: Record<string, unknown> | null;
  confidence?: number;
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

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : fallback;
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = (params?.id as string) || "";
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetchJson<StatusResponse>(
        `/api/documents/status?documentId=${encodeURIComponent(documentId)}`,
        { cache: "no-store" }
      );
      if (isCancelled()) return;
      setStatus(data);

      try {
        const ev = await apiFetchJson<Evidence>(
          `/api/documents/evidence?documentId=${encodeURIComponent(documentId)}`,
          { cache: "no-store" }
        );
        if (!isCancelled()) setEvidence(ev);
      } catch {
        // Fall back to the evidence embedded in the status payload
        const details = (data?.details as Record<string, unknown>) || {};
        const fallback: Evidence = {
          qr: (details.qr as Evidence["qr"]) || null,
          mrz: (details.mrz as Evidence["mrz"]) || null,
          logo: (details.logo as Evidence["logo"]) || null,
          policy: (details.policy as Evidence["policy"]) || null,
          extracted: (details.extracted as Record<string, unknown>) || null,
        };
        if (!isCancelled()) setEvidence(fallback);
      }
    } catch (e: unknown) {
      if (!isCancelled()) setError(errorMessage(e, "Failed to load document"));
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    if (documentId) load(() => cancelled);
    return () => { cancelled = true; };
  }, [documentId, load]);

  async function decide(decision: "verified" | "rejected") {
    if (busy) return;
    if (decision === "rejected" && !reason.trim()) {
      setActionMessage({ kind: "error", text: "Please enter a reason for rejecting this document." });
      return;
    }
    setBusy(true);
    setActionMessage(null);
    try {
      await submitDocumentReview(documentId, decision, {
        reason: reason.trim() || undefined,
        confidence: decision === "verified" ? status?.confidence : undefined,
      });
      setActionMessage({ kind: "ok", text: decision === "verified" ? "Document approved." : "Document rejected." });
      setRejecting(false);
      setReason("");
      await load();
    } catch (e: unknown) {
      setActionMessage({ kind: "error", text: errorMessage(e, "Action failed") });
    } finally {
      setBusy(false);
    }
  }

  const canDecide = status?.status === "pending";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Review Document</h1>
        <button className="px-3 py-2 rounded-md bg-gray-200 hover:bg-gray-300" onClick={() => router.push('/faculty/dashboard')}>Back to Dashboard</button>
      </div>

      {loading && <div role="status">Loading…</div>}
      {error && <div className="text-red-600" role="alert">{error}</div>}
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
              <div><span className="text-gray-500">Confidence:</span> {formatConfidence(status.confidence ?? evidence?.confidence)}</div>
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

          <section className="space-y-3" aria-label="Review decision">
            {rejecting && (
              <div>
                <label htmlFor="reject-reason" className="block text-sm font-medium mb-1">Reason for rejection</label>
                <textarea
                  id="reject-reason"
                  className="w-full border rounded-md p-2 text-sm"
                  rows={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                disabled={busy || !canDecide}
                onClick={() => decide("verified")}
              >Approve</button>
              {!rejecting ? (
                <button
                  className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={busy || !canDecide}
                  onClick={() => setRejecting(true)}
                >Reject</button>
              ) : (
                <>
                  <button
                    className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => decide("rejected")}
                  >Confirm rejection</button>
                  <button
                    className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300"
                    disabled={busy}
                    onClick={() => { setRejecting(false); setReason(""); }}
                  >Cancel</button>
                </>
              )}
            </div>
            {!canDecide && (
              <p className="text-sm text-gray-500">
                This document is {status.status}; only pending documents can be approved or rejected here.
              </p>
            )}
            <div aria-live="polite">
              {actionMessage && (
                <p className={actionMessage.kind === "ok" ? "text-green-700 text-sm" : "text-red-600 text-sm"} role={actionMessage.kind === "error" ? "alert" : "status"}>
                  {actionMessage.text}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
