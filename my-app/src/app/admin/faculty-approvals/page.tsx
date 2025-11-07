"use client";

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { UserCheck, RefreshCw, AlertCircle, Check, X, ArrowLeft, GraduationCap } from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';

interface FacultyApproval {
  user_id: string;
  role: 'faculty' | 'recruiter';
  organization_id: string;
  approval_status: 'pending' | 'approved' | 'denied';
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approval_notes: string | null;
  user_email: string;
  user_name: string;
  organization_name: string;
  company_name?: string | null;
}

export default function AdminFacultyApprovalsPage() {
  const [approvals, setApprovals] = useState<FacultyApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');
  const [filterRole, setFilterRole] = useState<'all' | 'faculty' | 'recruiter'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'deny' | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<FacultyApproval | null>(null);
  const [notes, setNotes] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Check if current user is super admin
  useEffect(() => {
    const checkRole = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.role === 'super_admin') {
          setIsSuperAdmin(true);
        }
      } catch (err) {
        console.error('Failed to check user role:', err);
      }
    };
    checkRole();
  }, []);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/admin/faculty-approvals', window.location.origin);
      if (filterStatus !== 'all') url.searchParams.set('status', filterStatus);
      if (filterRole !== 'all') url.searchParams.set('role', filterRole);

      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load approvals');
      
      const approvalsData = Array.isArray(json.data) ? json.data : [];
      setApprovals(approvalsData as FacultyApproval[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterRole]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const openModal = useCallback((approval: FacultyApproval, action: 'approve' | 'deny') => {
    setSelectedApproval(approval);
    setModalAction(action);
    setNotes('');
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setModalAction(null);
    setSelectedApproval(null);
    setNotes('');
  }, []);

  const handleAction = useCallback(async () => {
    if (!selectedApproval || !modalAction) return;

    setActioning(selectedApproval.user_id);
    setError(null);
    try {
      const res = await fetch('/api/admin/faculty-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedApproval.user_id,
          organization_id: selectedApproval.organization_id,
          approval_status: modalAction === 'approve' ? 'approved' : 'denied',
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to ${modalAction} request`);
      
      // Immediately remove from pending list if viewing pending
      if (filterStatus === 'pending') {
        setApprovals(prev => prev.filter(a => a.user_id !== selectedApproval.user_id));
      }
      
      closeModal();
      await fetchApprovals();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setActioning(null);
    }
  }, [selectedApproval, modalAction, notes, fetchApprovals, filterStatus, closeModal]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30';
      case 'approved': return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
      case 'denied': return 'bg-red-500/20 text-red-300 border-red-400/30';
      default: return 'bg-white/10 text-white/60 border-white/20';
    }
  };

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
            <p className="mt-4 text-white/80 text-lg font-medium">Loading faculty approvals...</p>
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
        
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>
        
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:radial-gradient(white,transparent_85%)] opacity-10"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
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

          <div className="flex items-center gap-3">
            <Link
              href={isSuperAdmin ? "/admin/super" : "/admin/dashboard"}
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
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <div className="relative p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:scale-110 transition-transform duration-300">
                <GraduationCap className="w-10 h-10 text-blue-300 drop-shadow-lg" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
                Role Approvals
              </h1>
              <p className="text-white/80 text-base md:text-lg mt-2 font-medium">
                Review and approve faculty & recruiter signups.
                <span className="text-emerald-300"> Grant access.</span>
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
                  <UserCheck className="w-5 h-5 text-blue-300" />
                </div>
                <h2 className="text-white text-xl md:text-2xl font-bold">Pending Approvals</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'pending' | 'approved' | 'denied' | 'all')}
                  className="px-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all hover:bg-white/10 font-medium backdrop-blur-sm"
                >
                  <option value="pending" className="bg-gray-800">Pending</option>
                  <option value="approved" className="bg-gray-800">Approved</option>
                  <option value="denied" className="bg-gray-800">Denied</option>
                  <option value="all" className="bg-gray-800">All</option>
                </select>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as 'all' | 'faculty' | 'recruiter')}
                  className="px-4 py-2 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all hover:bg-white/10 font-medium backdrop-blur-sm"
                >
                  <option value="all" className="bg-gray-800">All Roles</option>
                  <option value="faculty" className="bg-gray-800">Faculty</option>
                  <option value="recruiter" className="bg-gray-800">Recruiter</option>
                </select>
                <button
                  onClick={fetchApprovals}
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
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Organization</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Submitted</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {approvals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="relative inline-block mb-4">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-30" />
                        <div className="relative p-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-2xl border border-white/10">
                          <GraduationCap className="w-12 h-12 text-white/60" />
                        </div>
                      </div>
                      <p className="text-white/60 text-lg font-medium">No pending approvals found.</p>
                    </td>
                  </tr>
                ) : (
                  approvals.map((approval) => (
                    <tr key={`${approval.user_id}-${approval.organization_id}`} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-white font-semibold">{approval.user_name}</div>
                        <div className="text-white/60 text-sm mt-0.5">{approval.user_email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border ${
                          approval.role === 'faculty' 
                            ? 'bg-blue-500/20 text-blue-300 border-blue-400/30' 
                            : 'bg-purple-500/20 text-purple-300 border-purple-400/30'
                        }`}>
                          <GraduationCap className="w-4 h-4" />
                          {approval.role.charAt(0).toUpperCase() + approval.role.slice(1)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-white/80 font-medium">{approval.organization_name}</div>
                        {approval.role === 'recruiter' && approval.company_name && (
                          <div className="text-emerald-300 text-xs mt-1 font-medium">
                            🏢 {approval.company_name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border ${getStatusColor(approval.approval_status)}`}>
                          {approval.approval_status.charAt(0).toUpperCase() + approval.approval_status.slice(1)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white/70 text-sm font-medium">
                        {new Date(approval.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        {approval.approval_status === 'pending' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openModal(approval, 'approve')}
                              disabled={actioning === approval.user_id}
                              className="group relative overflow-hidden flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-105"
                            >
                              <Check className="w-4 h-4 relative z-10" />
                              <span className="relative z-10">Approve</span>
                              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                            </button>
                            <button
                              onClick={() => openModal(approval, 'deny')}
                              disabled={actioning === approval.user_id}
                              className="group relative overflow-hidden flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105"
                            >
                              <X className="w-4 h-4 relative z-10" />
                              <span className="relative z-10">Deny</span>
                              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                            </button>
                          </div>
                        ) : (
                          <span className="text-white/60 text-sm italic font-medium">
                            {approval.approval_status === 'approved' ? 'Approved' : 'Denied'}
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
      {modalOpen && selectedApproval && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-3xl blur-2xl opacity-30" />
            
            <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
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
                    {modalAction === 'approve' ? 'Approve' : 'Deny'} {selectedApproval.role.charAt(0).toUpperCase() + selectedApproval.role.slice(1)}
                  </h3>
                </div>
              </div>

              <div className="px-6 py-6 space-y-4">
                <p className="text-white/80 text-base leading-relaxed">
                  Are you sure you want to <span className="font-bold bg-gradient-to-r from-blue-300 to-emerald-300 bg-clip-text text-transparent">{modalAction}</span> this {selectedApproval.role} signup?
                </p>
                
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 backdrop-blur-xl">
                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-wider font-bold mb-1.5">User</div>
                    <div className="text-white font-semibold text-base">{selectedApproval.user_name}</div>
                    <div className="text-white/70 text-sm mt-0.5">{selectedApproval.user_email}</div>
                  </div>
                  
                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-wider font-bold mb-1.5">Role</div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border ${
                      selectedApproval.role === 'faculty' 
                        ? 'bg-blue-500/20 text-blue-300 border-blue-400/30' 
                        : 'bg-purple-500/20 text-purple-300 border-purple-400/30'
                    }`}>
                      {selectedApproval.role.charAt(0).toUpperCase() + selectedApproval.role.slice(1)}
                    </div>
                  </div>

                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-wider font-bold mb-1.5">Organization</div>
                    <div className="text-white/80 font-medium">{selectedApproval.organization_name}</div>
                    {selectedApproval.role === 'recruiter' && selectedApproval.company_name && (
                      <div className="mt-1.5 text-emerald-300 text-sm font-medium">
                        Company: {selectedApproval.company_name}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-wider font-bold mb-1.5">Submitted</div>
                    <div className="text-white/80 text-sm font-medium">
                      {new Date(selectedApproval.created_at).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-white/80 text-sm font-bold mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes about this decision..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all font-medium backdrop-blur-sm resize-none"
                    rows={3}
                  />
                </div>

                {modalAction === 'approve' && (
                  <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3.5 backdrop-blur-xl">
                    <p className="text-emerald-300 text-sm font-medium leading-relaxed flex items-start gap-2">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>User will be granted <span className="font-bold">{selectedApproval.role}</span> access immediately.</span>
                    </p>
                  </div>
                )}

                {modalAction === 'deny' && (
                  <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3.5 backdrop-blur-xl">
                    <p className="text-red-300 text-sm font-medium leading-relaxed flex items-start gap-2">
                      <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>This {selectedApproval.role} signup will be denied.</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  onClick={closeModal}
                  disabled={actioning === selectedApproval.user_id}
                  className="group relative overflow-hidden px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg hover:scale-105"
                >
                  <span className="relative z-10">Cancel</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </button>
                <button
                  onClick={handleAction}
                  disabled={actioning === selectedApproval.user_id}
                  className={`group relative overflow-hidden flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:scale-105 ${
                    modalAction === 'approve'
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-emerald-500/25 hover:shadow-emerald-500/40'
                      : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-red-500/25 hover:shadow-red-500/40'
                  }`}
                >
                  {actioning === selectedApproval.user_id ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin relative z-10" />
                      <span className="relative z-10">Processing...</span>
                    </>
                  ) : (
                    <>
                      {modalAction === 'approve' ? (
                        <>
                          <Check className="w-4 h-4 relative z-10" />
                          <span className="relative z-10">Approve</span>
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4 relative z-10" />
                          <span className="relative z-10">Deny</span>
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
