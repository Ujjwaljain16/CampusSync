'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, CheckCircle, XCircle, RotateCcw, Calendar, User, AlertCircle, RefreshCw, ArrowLeft, ScrollText, History, Activity } from 'lucide-react';

interface ApprovalHistory {
  id: string;
  action: string;
  certificateId: string;
  certificate: {
    id: string;
    title: string;
    institution: string;
    user_id: string;
    verification_status: string;
    created_at: string;
  };
  approverRole: string;
  details: Record<string, unknown>;
  createdAt: string;
  reverted: boolean;
  canRevert: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function FacultyHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<ApprovalHistory[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const [showRevertModal, setShowRevertModal] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState('');

  const fetchApprovalHistory = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/certificates/approval-history?page=${page}&limit=20`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch approval history');
      }
      
      setApprovals(data.data.approvals);
      setPagination(data.data.pagination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovalHistory();
  }, [fetchApprovalHistory]);

  const handleRevert = useCallback(async (certificateId: string) => {
    if (!revertReason.trim()) {
      alert('Please provide a reason for reverting this approval');
      return;
    }

    setReverting(certificateId);
    try {
      const response = await fetch('/api/certificates/revert-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          certificateId, 
          reason: revertReason 
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to revert approval');
      }

      // Refresh the history
      await fetchApprovalHistory(pagination.page);
      setShowRevertModal(null);
      setRevertReason('');
      alert('Approval reverted successfully');
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to revert'}`);
    } finally {
      setReverting(null);
    }
  }, [revertReason, fetchApprovalHistory, pagination.page]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'manual_approve':
      case 'batch_approve':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'manual_reject':
      case 'batch_reject':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'manual_approve':
        return 'Manually Approved';
      case 'batch_approve':
        return 'Batch Approved';
      case 'manual_reject':
        return 'Manually Rejected';
      case 'batch_reject':
        return 'Batch Rejected';
      default:
        return action;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handlePageChange = (newPage: number) => {
    fetchApprovalHistory(newPage);
  };

  // Deterministic particles to avoid hydration errors
  const particles = useMemo(() => [
    { top: '10%', left: '5%', duration: '4s', delay: '0s' },
    { top: '20%', right: '10%', duration: '5s', delay: '0.5s' },
    { top: '60%', left: '15%', duration: '3.5s', delay: '1s' },
    { bottom: '15%', right: '20%', duration: '4.5s', delay: '0.3s' },
    { bottom: '30%', left: '25%', duration: '5s', delay: '0.7s' },
  ], []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {particles.map((particle, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-blue-400/30 rounded-full blur-sm animate-float"
              style={{
                top: particle.top,
                left: particle.left,
                right: particle.right,
                bottom: particle.bottom,
                animationDuration: particle.duration,
                animationDelay: particle.delay,
              }}
            />
          ))}
        </div>
        
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full blur-xl opacity-50 animate-pulse" />
              <RefreshCw className="relative w-12 h-12 animate-spin text-blue-300" />
            </div>
            <p className="mt-4 text-white/80 text-lg font-medium">Loading approval history...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Animated Background - matching dashboard */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-blue-400/30 rounded-full blur-sm animate-float"
            style={{
              top: particle.top,
              left: particle.left,
              right: particle.right,
              bottom: particle.bottom,
              animationDuration: particle.duration,
              animationDelay: particle.delay,
            }}
          />
        ))}
        
        {/* Gradient orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>
        
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:radial-gradient(white,transparent_85%)] opacity-10"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 transition-transform duration-300 group-hover:scale-110">
              <Image
                src="/logo-clean.svg"
                alt="CampusSync"
                width={40}
                height={40}
                className="w-full h-full object-contain transition-all duration-300 group-hover:brightness-110 group-hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]"
                priority
              />
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors duration-300">
                CampusSync
              </span>
              <span className="text-[9px] font-medium text-gray-400 tracking-wider uppercase">
                Verified Credentials
              </span>
            </div>
          </Link>

          {/* Navigation Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/faculty/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white transition-all duration-300 group backdrop-blur-sm"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="font-medium">Dashboard</span>
            </Link>
            
            <button
              onClick={() => fetchApprovalHistory(pagination.page)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white transition-all duration-300 group shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
            >
              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
              <span className="font-medium">Refresh</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Header Section */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 pb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <div className="relative p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:scale-110 transition-transform duration-300">
                <History className="w-10 h-10 text-blue-300 drop-shadow-lg" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
                Approval History
              </h1>
              <p className="text-white/80 text-base md:text-lg mt-2 font-medium">
                Track and manage certificate approvals. 
                <span className="text-emerald-300"> Review your actions.</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {error && (
          <div className="mb-6 p-5 rounded-2xl border bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-300" />
              </div>
              <span className="text-red-300 font-semibold">{error}</span>
            </div>
          </div>
        )}

        {/* Stats - Enhanced */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="group bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-white/10 hover:border-emerald-400/30 transition-all duration-300 hover:scale-105">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <CheckCircle className="w-7 h-7 text-emerald-300" />
              </div>
              <div>
                <p className="text-sm text-white/60 font-medium mb-1">Active Approvals</p>
                <p className="text-3xl font-bold text-white">
                  {approvals.filter(a => a.action.includes('approve') && !a.reverted).length}
                </p>
              </div>
            </div>
          </div>

          <div className="group bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-white/10 hover:border-orange-400/30 transition-all duration-300 hover:scale-105">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <RotateCcw className="w-7 h-7 text-orange-300" />
              </div>
              <div>
                <p className="text-sm text-white/60 font-medium mb-1">Reverted</p>
                <p className="text-3xl font-bold text-white">
                  {approvals.filter(a => a.reverted).length}
                </p>
              </div>
            </div>
          </div>

          <div className="group bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-white/10 hover:border-blue-400/30 transition-all duration-300 hover:scale-105">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Activity className="w-7 h-7 text-blue-300" />
              </div>
              <div>
                <p className="text-sm text-white/60 font-medium mb-1">Total Actions</p>
                <p className="text-3xl font-bold text-white">{pagination.total}</p>
              </div>
            </div>
          </div>

          <div className="group bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-white/10 hover:border-purple-400/30 transition-all duration-300 hover:scale-105">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <User className="w-7 h-7 text-purple-300" />
              </div>
              <div>
                <p className="text-sm text-white/60 font-medium mb-1">Your Role</p>
                <p className="text-2xl font-bold text-white">Faculty</p>
              </div>
            </div>
          </div>
        </div>

        {/* Approval History Table - Enhanced */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <div className="px-6 md:px-8 py-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                <History className="w-5 h-5 text-blue-300" />
              </div>
              <h2 className="text-2xl font-bold text-white">Recent Approvals</h2>
            </div>
          </div>
          
          {approvals.length === 0 ? (
            <div className="text-center py-16">
              <div className="relative inline-block mb-6">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-30" />
                <div className="relative p-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-2xl border border-white/10">
                  <Clock className="w-16 h-16 text-white/60" />
                </div>
              </div>
              <p className="text-white/80 text-xl font-semibold mb-2">No approval history found</p>
              <p className="text-white/50 text-sm">Approvals will appear here once you start reviewing certificates</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">
                      Certificate
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">
                      Institution
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {approvals.map((approval) => (
                    <tr key={approval.id} className={`hover:bg-white/5 transition-colors ${approval.reverted ? 'opacity-60' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            approval.action.includes('approve') 
                              ? 'bg-emerald-500/20' 
                              : 'bg-red-500/20'
                          }`}>
                            {getActionIcon(approval.action)}
                          </div>
                          <div>
                            <span className="text-sm text-white font-medium block">
                              {getActionText(approval.action)}
                            </span>
                            {approval.reverted && (
                              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-orange-500/20 border border-orange-400/30 rounded text-xs text-orange-300 font-medium">
                                <RotateCcw className="w-3 h-3" />
                                Reverted
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <ScrollText className="w-4 h-4 text-blue-300 flex-shrink-0" />
                          <div>
                            <div className="text-sm text-white font-semibold">
                              {approval.certificate.title}
                            </div>
                            <div className="text-xs text-white/60 mt-0.5">
                              ID: {approval.certificate.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white/80 font-medium">
                        {approval.certificate.institution}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white/70">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-blue-300" />
                          <span className="font-medium">{formatDate(approval.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {approval.canRevert ? (
                          <button
                            onClick={() => setShowRevertModal(approval.certificateId)}
                            disabled={reverting === approval.certificateId}
                            className="group relative overflow-hidden bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:from-gray-600 disabled:to-gray-600 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all hover:scale-105 disabled:hover:scale-100 shadow-lg shadow-orange-500/25"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Revert</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                          </button>
                        ) : approval.reverted ? (
                          <span className="text-white/40 text-xs italic font-medium">Already reverted</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination - Enhanced */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-8">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-6 py-3 bg-gradient-to-r from-white/10 to-white/5 hover:from-white/15 hover:to-white/10 disabled:from-white/5 disabled:to-white/5 disabled:text-white/30 text-white rounded-xl font-semibold transition-all backdrop-blur-xl border border-white/10 hover:border-white/20 disabled:hover:border-white/10"
            >
              Previous
            </button>
            <div className="px-6 py-3 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 backdrop-blur-xl rounded-xl border border-white/10">
              <span className="text-white font-bold">
                Page {pagination.page} of {pagination.totalPages}
              </span>
            </div>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="px-6 py-3 bg-gradient-to-r from-white/10 to-white/5 hover:from-white/15 hover:to-white/10 disabled:from-white/5 disabled:to-white/5 disabled:text-white/30 text-white rounded-xl font-semibold transition-all backdrop-blur-xl border border-white/10 hover:border-white/20 disabled:hover:border-white/10"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Revert Modal - Enhanced */}
      {showRevertModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-3xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl blur-lg opacity-50" />
                <div className="relative w-12 h-12 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl flex items-center justify-center">
                  <RotateCcw className="w-6 h-6 text-orange-300" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white">Revert Approval</h3>
            </div>
            
            <p className="text-white/80 mb-6 font-medium leading-relaxed">
              Are you sure you want to revert this approval? The certificate will be moved back to pending status.
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-semibold text-white mb-3">
                Reason for reverting:
              </label>
              <textarea
                value={revertReason}
                onChange={(e) => setRevertReason(e.target.value)}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-orange-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/10 font-medium"
                placeholder="Enter reason for reverting this approval..."
                rows={3}
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRevertModal(null);
                  setRevertReason('');
                }}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold transition-all border border-white/10 hover:border-white/20"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevert(showRevertModal)}
                disabled={reverting === showRevertModal}
                className="group relative overflow-hidden px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40"
              >
                {reverting === showRevertModal && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Revert Approval</span>
                {!reverting && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
