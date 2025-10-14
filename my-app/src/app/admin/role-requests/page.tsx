"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Users, UserCheck, UserX, RefreshCw, AlertCircle, Check, X, ArrowLeft, UserPlus, Crown } from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';

interface RoleRequest {
  id: string;
  user_id: string;
  requested_role: 'recruiter' | 'faculty' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  metadata: any;
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
  const router = useRouter();

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
      setRequests(json.data as RoleRequest[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
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
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved': return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200';
      case 'faculty': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'recruiter': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-2xl backdrop-blur-sm border border-white/10">
                <Shield className="w-8 h-8 text-orange-300" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-orange-200 to-red-200 bg-clip-text text-transparent">
                  Role Requests
                </h1>
                <p className="text-white/70 text-lg">Manage pending access requests</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </button>
              <LogoutButton variant="danger" />
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
          <div className="px-8 py-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-xl font-bold">Pending Requests</h2>
              <div className="flex gap-3">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                >
                  <option value="all" className="bg-gray-800">All Statuses</option>
                  <option value="pending" className="bg-gray-800">Pending</option>
                  <option value="approved" className="bg-gray-800">Approved</option>
                  <option value="rejected" className="bg-gray-800">Rejected</option>
                </select>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as any)}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                >
                  <option value="all" className="bg-gray-800">All Roles</option>
                  <option value="recruiter" className="bg-gray-800">Recruiter</option>
                  <option value="faculty" className="bg-gray-800">Faculty</option>
                  <option value="admin" className="bg-gray-800">Admin</option>
                </select>
                <button
                  onClick={fetchRequests}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/10 text-white/80">
                  <th className="p-4">Requester</th>
                  <th className="p-4">Requested Role</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Submitted On</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-white/60">No role requests found.</td>
                  </tr>
                ) : (
                  requests.map((request) => (
                    <tr key={request.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-4">
                        <div className="text-white font-medium">{request.requester_name}</div>
                        <div className="text-white/60 text-sm">{request.requester_email}</div>
                      </td>
                      <td className="p-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${getRoleColor(request.requested_role)}`}>
                          {getRoleIcon(request.requested_role)}
                          {request.requested_role.charAt(0).toUpperCase() + request.requested_role.slice(1)}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(request.status)}`}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </div>
                      </td>
                      <td className="p-4 text-white/60 text-sm">
                        {new Date(request.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        {request.status === 'pending' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openModal(request, 'approve')}
                              disabled={actioning === request.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Check className="w-4 h-4" />
                              Approve
                            </button>
                            <button
                              onClick={() => openModal(request, 'deny')}
                              disabled={actioning === request.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <X className="w-4 h-4" />
                              Deny
                            </button>
                          </div>
                        ) : (
                          <span className="text-white/60 text-sm italic">
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

      {/* Confirmation Modal */}
      {modalOpen && selectedRequest && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/20 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className={`px-6 py-4 ${modalAction === 'approve' ? 'bg-green-600/20 border-b border-green-500/30' : 'bg-red-600/20 border-b border-red-500/30'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${modalAction === 'approve' ? 'bg-green-600' : 'bg-red-600'}`}>
                  {modalAction === 'approve' ? (
                    <Check className="w-5 h-5 text-white" />
                  ) : (
                    <X className="w-5 h-5 text-white" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-white">
                  {modalAction === 'approve' ? 'Approve' : 'Deny'} Role Request
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-6 space-y-4">
              <p className="text-white/80 text-base">
                Are you sure you want to <span className="font-semibold">{modalAction}</span> this role request?
              </p>
              
              {/* User Info Card */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div>
                  <div className="text-white/60 text-xs uppercase tracking-wider mb-1">Requester</div>
                  <div className="text-white font-semibold">{selectedRequest.requester_name}</div>
                  <div className="text-white/70 text-sm">{selectedRequest.requester_email}</div>
                </div>
                
                <div>
                  <div className="text-white/60 text-xs uppercase tracking-wider mb-1">Requested Role</div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border ${getRoleColor(selectedRequest.requested_role)}`}>
                    {getRoleIcon(selectedRequest.requested_role)}
                    {selectedRequest.requested_role.charAt(0).toUpperCase() + selectedRequest.requested_role.slice(1)}
                  </div>
                </div>

                <div>
                  <div className="text-white/60 text-xs uppercase tracking-wider mb-1">Submitted</div>
                  <div className="text-white/80 text-sm">
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
                <div className="bg-green-600/10 border border-green-500/20 rounded-lg p-3">
                  <p className="text-green-300 text-sm">
                    ✓ User will be granted <span className="font-semibold">{selectedRequest.requested_role}</span> access immediately.
                  </p>
                </div>
              )}

              {modalAction === 'deny' && (
                <div className="bg-red-600/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-red-300 text-sm">
                    ✗ This request will be rejected. The user will remain with their current access level.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={actioning === selectedRequest.id}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={actioning === selectedRequest.id}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  modalAction === 'approve'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {actioning === selectedRequest.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {modalAction === 'approve' ? (
                      <>
                        <Check className="w-4 h-4" />
                        Approve Request
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4" />
                        Deny Request
                      </>
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


