"use client";

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Users, UserCheck, RefreshCw, AlertCircle, Check, X, ArrowLeft, UserPlus, Crown, ClipboardList } from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';

interface RoleRequest {
  id: string;
  user_id: string;
  requested_role: 'recruiter' | 'faculty' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  metadata: Record<string, unknown>;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  requester_name: string;
  requester_email: string;
}

export default function AdminRoleRequestsPage() {
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [filterRole, setFilterRole] = useState<'all' | 'recruiter' | 'faculty' | 'admin'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'deny' | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<RoleRequest | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/admin/role-requests', window.location.origin);
      if (filterStatus !== 'all') url.searchParams.set('status', filterStatus);
      if (filterRole !== 'all') url.searchParams.set('requested_role', filterRole);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load role requests');
      
      // Ensure we always set an array, even if the API returns unexpected data
      const requestsData = Array.isArray(json.data) ? json.data : [];
      setRequests(requestsData as RoleRequest[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
      setRequests([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterRole]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const openModal = useCallback((request: RoleRequest, action: 'approve' | 'deny') => {
    setSelectedRequest(request);
    setModalAction(action);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setModalAction(null);
    setSelectedRequest(null);
  }, []);

  const handleAction = useCallback(async () => {
    if (!selectedRequest || !modalAction) return;

    setActioning(selectedRequest.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/role-requests/${selectedRequest.id}/${modalAction}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to ${modalAction} request`);
      
      // Immediately remove the request from the UI if we're viewing pending requests
      if (filterStatus === 'pending') {
        setRequests(prev => prev.filter(req => req.id !== selectedRequest.id));
      }
      
      // Close modal and refresh
      closeModal();
      await fetchRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setActioning(null);
    }
  }, [selectedRequest, modalAction, fetchRequests, filterStatus, closeModal]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30';
      case 'approved': return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
      case 'rejected': return 'bg-red-500/20 text-red-300 border-red-400/30';
      default: return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-500/20 text-red-300 border-red-400/30';
      case 'faculty': return 'bg-blue-500/20 text-blue-300 border-blue-400/30';
      case 'recruiter': return 'bg-purple-500/20 text-purple-300 border-purple-400/30';
      default: return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-4 h-4" />;
      case 'faculty': return <UserCheck className="w-4 h-4" />;
      case 'recruiter': return <UserPlus className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
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
            <p className="mt-4 text-white/80 text-lg font-medium">Loading role requests...</p>
          </div>
        </div>
      </div>
    );
  }

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
              href="/admin/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white transition-all duration-300 group backdrop-blur-sm"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="font-medium">Dashboard</span>
            </Link>
            <LogoutButton variant="danger" />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <div className="relative p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:scale-110 transition-transform duration-300">
                <ClipboardList className="w-10 h-10 text-blue-300 drop-shadow-lg" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
                Role Requests
              </h1>
              <p className="text-white/80 text-base md:text-lg mt-2 font-medium">
                Manage pending access requests.
                <span className="text-emerald-300"> Review and approve.</span>
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-5 rounded-2xl border bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-300" />
              </div>
              <p className="text-red-300 font-semibold">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
          <div className="px-6 md:px-8 py-6 border-b border-white/10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-blue-300" />
                </div>
                <h2 className="text-white text-xl md:text-2xl font-bold">Pending Requests</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'pending' | 'approved' | 'rejected' | 'all')}
                  className="px-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all hover:bg-white/10 font-medium backdrop-blur-sm"
                >
                  <option value="all" className="bg-gray-800">All Statuses</option>
                  <option value="pending" className="bg-gray-800">Pending</option>
                  <option value="approved" className="bg-gray-800">Approved</option>
                  <option value="rejected" className="bg-gray-800">Rejected</option>
                </select>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as 'all' | 'recruiter' | 'faculty' | 'admin')}
                  className="px-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all hover:bg-white/10 font-medium backdrop-blur-sm"
                >
                  <option value="all" className="bg-gray-800">All Roles</option>
                  <option value="recruiter" className="bg-gray-800">Recruiter</option>
                  <option value="faculty" className="bg-gray-800">Faculty</option>
                  <option value="admin" className="bg-gray-800">Admin</option>
                </select>
                <button
                  onClick={fetchRequests}
                  disabled={loading}
                  className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl transition-all disabled:opacity-50 font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Requester</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Requested Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Submitted On</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <div className="relative inline-block mb-4">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-30" />
                        <div className="relative p-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-2xl border border-white/10">
                          <ClipboardList className="w-12 h-12 text-white/60" />
                        </div>
                      </div>
                      <p className="text-white/60 text-lg font-medium">No role requests found.</p>
                    </td>
                  </tr>
                ) : (
                  requests.map((request) => (
                    <tr key={request.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-white font-semibold">{request.requester_name}</div>
                        <div className="text-white/60 text-sm mt-0.5">{request.requester_email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border ${getRoleColor(request.requested_role)}`}>
                          {getRoleIcon(request.requested_role)}
                          {request.requested_role.charAt(0).toUpperCase() + request.requested_role.slice(1)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border ${getStatusColor(request.status)}`}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white/70 text-sm font-medium">
                        {new Date(request.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        {request.status === 'pending' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openModal(request, 'approve')}
                              disabled={actioning === request.id}
                              className="group relative overflow-hidden flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-105"
                            >
                              <Check className="w-4 h-4 relative z-10" />
                              <span className="relative z-10">Approve</span>
                              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                            </button>
                            <button
                              onClick={() => openModal(request, 'deny')}
                              disabled={actioning === request.id}
                              className="group relative overflow-hidden flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105"
                            >
                              <X className="w-4 h-4 relative z-10" />
                              <span className="relative z-10">Deny</span>
                              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                            </button>
                          </div>
                        ) : (
                          <span className="text-white/60 text-sm italic font-medium">
                            {request.status === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Enhanced Confirmation Modal */}
      {modalOpen && selectedRequest && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="relative w-full max-w-md">
            {/* Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-3xl blur-2xl opacity-30" />
            
            {/* Modal Content */}
            <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl blur-lg opacity-40" />
                    <div className={`relative p-2.5 rounded-xl ${modalAction === 'approve' ? 'bg-gradient-to-r from-emerald-600 to-green-600' : 'bg-gradient-to-r from-red-600 to-red-700'}`}>
                      {modalAction === 'approve' ? (
                        <Check className="w-5 h-5 text-white" />
                      ) : (
                        <X className="w-5 h-5 text-white" />
                      )}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {modalAction === 'approve' ? 'Approve' : 'Deny'} Role Request
                  </h3>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-6 space-y-4">
                <p className="text-white/80 text-base leading-relaxed">
                  Are you sure you want to <span className="font-bold bg-gradient-to-r from-blue-300 to-emerald-300 bg-clip-text text-transparent">{modalAction}</span> this role request?
                </p>
                
                {/* User Info Card */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 backdrop-blur-xl">
                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-wider font-bold mb-1.5">Requester</div>
                    <div className="text-white font-semibold text-base">{selectedRequest.requester_name}</div>
                    <div className="text-white/70 text-sm mt-0.5">{selectedRequest.requester_email}</div>
                  </div>
                  
                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-wider font-bold mb-1.5">Requested Role</div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border ${getRoleColor(selectedRequest.requested_role)}`}>
                      {getRoleIcon(selectedRequest.requested_role)}
                      {selectedRequest.requested_role.charAt(0).toUpperCase() + selectedRequest.requested_role.slice(1)}
                    </div>
                  </div>

                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-wider font-bold mb-1.5">Submitted</div>
                    <div className="text-white/80 text-sm font-medium">
                      {new Date(selectedRequest.created_at).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>

                {modalAction === 'approve' && (
                  <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3.5 backdrop-blur-xl">
                    <p className="text-emerald-300 text-sm font-medium leading-relaxed flex items-start gap-2">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>User will be granted <span className="font-bold">{selectedRequest.requested_role}</span> access immediately.</span>
                    </p>
                  </div>
                )}

                {modalAction === 'deny' && (
                  <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3.5 backdrop-blur-xl">
                    <p className="text-red-300 text-sm font-medium leading-relaxed flex items-start gap-2">
                      <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>This request will be rejected. The user will remain with their current access level.</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  onClick={closeModal}
                  disabled={actioning === selectedRequest.id}
                  className="group relative overflow-hidden px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg hover:scale-105"
                >
                  <span className="relative z-10">Cancel</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </button>
                <button
                  onClick={handleAction}
                  disabled={actioning === selectedRequest.id}
                  className={`group relative overflow-hidden flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:scale-105 ${
                    modalAction === 'approve'
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-emerald-500/25 hover:shadow-emerald-500/40'
                      : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-red-500/25 hover:shadow-red-500/40'
                  }`}
                >
                  {actioning === selectedRequest.id ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin relative z-10" />
                      <span className="relative z-10">Processing...</span>
                    </>
                  ) : (
                    <>
                      {modalAction === 'approve' ? (
                        <>
                          <Check className="w-4 h-4 relative z-10" />
                          <span className="relative z-10">Approve Request</span>
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4 relative z-10" />
                          <span className="relative z-10">Deny Request</span>
                        </>
                      )}
                    </>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


