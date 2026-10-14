/**
 * Client-side helpers for the document review pages.
 * All calls go through `apiFetchJson`, which unwraps the `{ data }` envelope and
 * throws `ApiError` (with the server's message) on non-OK responses.
 */
import { apiFetchJson } from '@/lib/apiClient';

export type ReviewDecision = 'verified' | 'rejected' | 'pending';

export interface ReviewResult {
  documentId: string;
  verificationStatus: string;
  previousStatus?: string;
}

/** Approve / reject / re-open a document. "Reject" is a real `rejected` status (not a revoke). */
export function submitDocumentReview(
  documentId: string,
  decision: ReviewDecision,
  opts: { reason?: string; confidence?: number } = {}
): Promise<ReviewResult> {
  return apiFetchJson<ReviewResult>('/api/documents/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId,
      verificationStatus: decision,
      reason: opts.reason,
      confidence: opts.confidence,
    }),
  });
}

/** Revoke a previously verified document (requires a reason). */
export function revokeDocument(documentId: string, reason: string): Promise<{ documentId: string; status: string }> {
  return apiFetchJson('/api/documents/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId, reason }),
  });
}

/** 0..1 confidence -> "85%" (also tolerates legacy 0..100 values) */
export function formatConfidence(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const pct = value > 1 ? value : value * 100;
  return `${Math.round(pct)}%`;
}
