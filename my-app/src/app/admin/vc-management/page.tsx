'use client';

import React, { useRef, useState } from 'react';
import { Key, CheckCircle, XCircle, RefreshCw, AlertTriangle, Search, Info } from 'lucide-react';
import { apiFetchJson, ApiError } from '@/lib/apiClient';

/**
 * VC management.
 *
 * The server only exposes per-credential endpoints (`GET /api/vcs/verify?vcId=`,
 * `POST /api/vcs/revoke`, `POST /api/certificates/issue`); there are no aggregate
 * statistics endpoints, so no counts are shown (and none are invented).
 */

interface VerifyResult {
  valid?: boolean;
  revoked?: boolean;
  reason?: string;
  status?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : fallback;
}

type Tab = 'overview' | 'verify' | 'revoke' | 'keys';

export default function VCManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Verify
  const [vcId, setVcId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const verifyReq = useRef(0);

  // Revoke
  const [revokeId, setRevokeId] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const id = vcId.trim();
    setVerifyResult(null);
    setVerifyError(null);
    if (!UUID_RE.test(id)) {
      setVerifyError('Enter a valid credential ID (UUID).');
      return;
    }
    const reqId = ++verifyReq.current;
    setVerifying(true);
    try {
      const result = await apiFetchJson<VerifyResult>(`/api/vcs/verify?vcId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (reqId !== verifyReq.current) return;
      setVerifyResult(result && typeof result === 'object' ? result : {});
    } catch (err) {
      if (reqId !== verifyReq.current) return;
      setVerifyError(messageOf(err, 'Verification request failed'));
    } finally {
      if (reqId === verifyReq.current) setVerifying(false);
    }
  }

  async function handleRevoke() {
    if (revoking) return;
    setRevoking(true);
    setRevokeMessage(null);
    try {
      await apiFetchJson('/api/vcs/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: revokeId.trim(), reason: reason.trim() }),
      });
      setRevokeMessage({ kind: 'ok', text: 'Credential revoked.' });
      setRevokeId('');
      setReason('');
    } catch (err) {
      setRevokeMessage({ kind: 'error', text: messageOf(err, 'Revocation failed') });
    } finally {
      setRevoking(false);
      setConfirming(false);
    }
  }

  function requestRevoke(e: React.FormEvent) {
    e.preventDefault();
    setRevokeMessage(null);
    if (!UUID_RE.test(revokeId.trim())) {
      setRevokeMessage({ kind: 'error', text: 'Enter a valid credential ID (UUID).' });
      return;
    }
    if (!reason.trim()) {
      setRevokeMessage({ kind: 'error', text: 'A reason is required to revoke a credential.' });
      return;
    }
    setConfirming(true);
  }

  const tabs: { id: Tab; name: string; icon: typeof Search }[] = [
    { id: 'overview', name: 'Overview', icon: Info },
    { id: 'verify', name: 'Verify credential', icon: CheckCircle },
    { id: 'revoke', name: 'Revoke credential', icon: XCircle },
    { id: 'keys', name: 'Key management', icon: Key },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-white">VC Management</h1>
          <p className="text-gray-300 mt-1">Verify and revoke individual Verifiable Credentials</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="border-b border-gray-700">
          <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="VC management sections">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Overview</h2>
            <div className="bg-gray-800 rounded-lg p-6" role="status">
              <p className="text-gray-200">Issuance, verification and revocation statistics are unavailable.</p>
              <p className="text-gray-400 text-sm mt-2">
                The server does not expose aggregate VC statistics. Use the tabs above to verify or revoke a specific
                credential. Credentials are issued per certificate from the faculty review flow.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'verify' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Verify a credential</h2>
            <form onSubmit={handleVerify} className="bg-gray-800 rounded-lg p-6 space-y-4">
              <div>
                <label htmlFor="vc-verify-id" className="block text-sm text-gray-300 mb-1">Credential ID</label>
                <input
                  id="vc-verify-id"
                  value={vcId}
                  onChange={(e) => setVcId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono text-sm"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                disabled={verifying}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
              >
                {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>{verifying ? 'Checking…' : 'Verify'}</span>
              </button>
              <div aria-live="polite">
                {verifyError && (
                  <p className="text-red-300 flex items-center" role="alert">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    {verifyError}
                  </p>
                )}
                {verifyResult && (
                  <div className={`rounded p-4 border ${verifyResult.valid ? 'border-green-500/50 bg-green-900/20' : 'border-red-500/50 bg-red-900/20'}`}>
                    <p className="font-semibold">
                      {verifyResult.valid ? 'Credential is valid' : verifyResult.revoked ? 'Credential is revoked' : 'Credential is not valid'}
                    </p>
                    {verifyResult.status && <p className="text-sm text-gray-300">Status: {verifyResult.status}</p>}
                    {verifyResult.reason && <p className="text-sm text-gray-300">Reason: {verifyResult.reason}</p>}
                  </div>
                )}
              </div>
            </form>
          </div>
        )}

        {activeTab === 'revoke' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Revoke a credential</h2>
            <form onSubmit={requestRevoke} className="bg-gray-800 rounded-lg p-6 space-y-4">
              <div>
                <label htmlFor="vc-revoke-id" className="block text-sm text-gray-300 mb-1">Credential ID</label>
                <input
                  id="vc-revoke-id"
                  value={revokeId}
                  onChange={(e) => setRevokeId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono text-sm"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="vc-revoke-reason" className="block text-sm text-gray-300 mb-1">Reason</label>
                <textarea
                  id="vc-revoke-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
                />
              </div>
              {!confirming ? (
                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">
                  Revoke…
                </button>
              ) : (
                <div className="flex items-center space-x-3" role="alertdialog" aria-label="Confirm revocation">
                  <span className="text-sm text-red-200">Revoking is permanent. Continue?</span>
                  <button type="button" onClick={handleRevoke} disabled={revoking} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg">
                    {revoking ? 'Revoking…' : 'Confirm revoke'}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={revoking} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg">
                    Cancel
                  </button>
                </div>
              )}
              <div aria-live="polite">
                {revokeMessage && (
                  <p className={revokeMessage.kind === 'ok' ? 'text-green-300' : 'text-red-300'} role={revokeMessage.kind === 'error' ? 'alert' : 'status'}>
                    {revokeMessage.text}
                  </p>
                )}
              </div>
            </form>
          </div>
        )}

        {activeTab === 'keys' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Key management</h2>
            <div className="bg-gray-800 rounded-lg p-6" role="status">
              <p className="text-gray-200">Key rotation and export are unavailable from this page.</p>
              <p className="text-gray-400 text-sm mt-2">
                Signing keys are managed through server configuration; there is no API for rotating or exporting them.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
