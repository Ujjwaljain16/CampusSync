'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Shield, Users, UserCheck, UserX, RefreshCw, AlertCircle, UserPlus, Mail, BarChart3, Crown, Lock, LayoutDashboard } from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';

interface UserWithRole {
  user_id: string;
  role: string;
  is_super_admin?: boolean;
  created_at: string;
  updated_at: string;
  assigned_by: string | null;
  auth_users: {
    email: string;
    created_at: string;
    full_name?: string | null;
  } | null;
}

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('student');
  const [inviting, setInviting] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/roles');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load users');
      setUsers(json.data as UserWithRole[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    (async () => {
      try {
        const res = await fetch('/api/admin/role-requests/count');
        const json = await res.json();
        if (res.ok) setPendingCount(json.pending || 0);
      } catch {}
    })();
  }, [fetchUsers]);

  const updateUserRole = useCallback(async (userId: string, newRole: string, currentRole: string) => {
    // Show confirmation dialog with warnings
    const warnings = getRoleChangeWarnings(currentRole, newRole);
    const confirmMessage = `Are you sure you want to change this user's role from ${currentRole} to ${newRole}?\n\n${warnings}`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    // For admin demotions, require a detailed reason
    let reason = `Role changed from ${currentRole} to ${newRole} by admin`;
    if (currentRole === 'admin' && newRole !== 'admin') {
      const detailedReason = window.prompt(
        `Admin demotion requires a detailed reason (minimum 10 characters):\n\n` +
        `Why are you demoting this admin from ${currentRole} to ${newRole}?`
      );
      
      if (!detailedReason || detailedReason.length < 10) {
        setError('Admin demotion requires a detailed reason (minimum 10 characters)');
        return;
      }
      reason = detailedReason;
    }

    setActioning(userId);
    setError(null);
    try {
      const res = await fetch('/api/admin/roles/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: userId, 
          new_role: newRole,
          reason: reason
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update role');
      await fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setActioning(null);
    }
  }, [fetchUsers]);

  const getRoleChangeWarnings = (fromRole: string, toRole: string, isSuperAdmin: boolean = false): string => {
    const warnings = [];
    
    if (isSuperAdmin && toRole !== 'admin') {
      warnings.push('⚠ CRITICAL: This is the SUPER ADMIN (original/founder)');
      warnings.push('✕ SUPER ADMIN CANNOT BE DEMOTED');
      warnings.push('⚙ This admin serves as the system recovery mechanism');
      return warnings.join('\n');
    }
    
    if (fromRole === 'admin' && toRole !== 'admin') {
      warnings.push('⚠ CRITICAL: This will remove admin privileges');
      warnings.push('⚠ You will be required to provide a detailed reason');
      warnings.push('⚠ This action will be logged and audited');
    }
    
    if (fromRole === 'recruiter' && toRole === 'student') {
      warnings.push('⚠ This user will lose access to student search and verification features');
    }
    
    if (fromRole === 'faculty' && toRole === 'student') {
      warnings.push('⚠ This user will lose certificate approval capabilities');
    }
    
    if (toRole === 'admin') {
      warnings.push('⚠ This user will gain full system access');
    }
    
    if (warnings.length === 0) {
      warnings.push('✓ This is a standard role change');
    }
    
    return warnings.join('\n');
  };

  const removeUserRole = useCallback(async (userId: string) => {
    setActioning(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/roles?user_id=${userId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to remove role');
      await fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setActioning(null);
    }
  }, [fetchUsers]);

  const sendInvitation = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    
    setInviting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send invitation');
      
      setShowInviteForm(false);
      setInviteEmail('');
      setInviteRole('student');
      await fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, fetchUsers]);

  const getRoleColor = (role: string, isSuperAdmin: boolean = false) => {
    if (isSuperAdmin) {
      return 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-300 border-yellow-500/30';
    }
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200';
      case 'faculty': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'student': return 'bg-green-100 text-green-800 border-green-200';
      case 'recruiter': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleIcon = (role: string, isSuperAdmin: boolean = false) => {
    if (isSuperAdmin) {
      return <Crown className="w-4 h-4" />;
    }
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'faculty': return <UserCheck className="w-4 h-4" />;
      case 'student': return <Users className="w-4 h-4" />;
      case 'recruiter': return <UserPlus className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getRoleDisplayName = (role: string, isSuperAdmin: boolean = false) => {
    if (isSuperAdmin) {
      return 'Super Admin';
    }
    return role.charAt(0).toUpperCase() + role.slice(1);
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
            <p className="mt-4 text-white/80 text-lg font-medium">Loading admin dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Animated Background - matching other pages */}
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

          {/* Logout Button */}
          <LogoutButton variant="danger" />
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                <div className="relative p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10">
                  <LayoutDashboard className="w-10 h-10 text-blue-300 drop-shadow-lg" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
                  Admin Dashboard
                </h1>
                <p className="text-white/80 text-base md:text-lg mt-1 font-medium">
                  Manage user roles and system analytics.
                  <span className="text-emerald-300"> Full control.</span>
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/analytics"
                className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
              >
                <BarChart3 className="w-5 h-5" />
                <span>View Analytics</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              </Link>
              
              <Link
                href="/admin/role-requests"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-white/10 to-white/5 hover:from-white/15 hover:to-white/10 text-white rounded-xl font-semibold transition-all backdrop-blur-xl border border-white/10 hover:border-white/20 relative"
              >
                <span>Pending Requests</span>
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center text-xs bg-red-600 text-white rounded-full px-2 py-0.5 font-bold animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </Link>
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-300" />
                </div>
                <h2 className="text-white text-2xl font-bold">User Management</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowInviteForm(!showInviteForm)}
                  className="group relative overflow-hidden flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/25"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Invite User</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </button>
                <button
                  onClick={fetchUsers}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold transition-all disabled:opacity-50 border border-white/10 hover:border-white/20 backdrop-blur-xl"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>

          {/* Invite User Form - Enhanced */}
          {showInviteForm && (
            <div className="px-6 md:px-8 py-6 border-b border-white/10 bg-gradient-to-br from-white/5 to-white/5 backdrop-blur-xl">
              <h3 className="text-white text-lg font-bold mb-5 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-300" />
                Invite New User
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  >
                    <option value="student" className="bg-gray-800">Student</option>
                    <option value="faculty" className="bg-gray-800">Faculty</option>
                    <option value="admin" className="bg-gray-800">Admin</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={sendInvitation}
                    disabled={!inviteEmail.trim() || inviting}
                    className="group relative overflow-hidden w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
                  >
                    {inviting ? 'Sending...' : 'Send Invitation'}
                    {!inviting && (
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Current Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Actions</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                          <Users className="w-5 h-5 text-blue-300" />
                        </div>
                        <div>
                          <div className="text-white font-semibold">
                            {user.auth_users?.full_name || user.auth_users?.email?.split('@')[0] || 'Unknown User'}
                          </div>
                          <div className="text-white/60 text-sm">
                            {user.auth_users?.email || 'No email'}
                          </div>
                          {user.auth_users?.created_at && (
                            <div className="text-white/40 text-xs mt-0.5">
                              Joined: {new Date(user.auth_users.created_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border backdrop-blur-sm ${getRoleColor(user.role, user.is_super_admin)}`}>
                          {getRoleIcon(user.role, user.is_super_admin)}
                          {getRoleDisplayName(user.role, user.is_super_admin)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-2">
                        {user.role !== 'admin' && (
                          <button
                            onClick={() => updateUserRole(user.user_id, 'admin', user.role)}
                            disabled={actioning === user.user_id}
                            className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/25 hover:scale-105 disabled:hover:scale-100"
                          >
                            Make Admin
                          </button>
                        )}
                        {user.role !== 'faculty' && !user.is_super_admin && (
                          <button
                            onClick={() => updateUserRole(user.user_id, 'faculty', user.role)}
                            disabled={actioning === user.user_id}
                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 hover:scale-105 disabled:hover:scale-100"
                          >
                            Make Faculty
                          </button>
                        )}
                        {user.role !== 'recruiter' && !user.is_super_admin && (
                          <button
                            onClick={() => updateUserRole(user.user_id, 'recruiter', user.role)}
                            disabled={actioning === user.user_id}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/25 hover:scale-105 disabled:hover:scale-100"
                          >
                            Make Recruiter
                          </button>
                        )}
                        {user.role !== 'student' && !user.is_super_admin && (
                          <button
                            onClick={() => updateUserRole(user.user_id, 'student', user.role)}
                            disabled={actioning === user.user_id}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25 hover:scale-105 disabled:hover:scale-100"
                          >
                            Make Student
                          </button>
                        )}
                        {user.is_super_admin && (
                          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30 text-yellow-300 rounded-xl text-sm font-semibold opacity-75 cursor-not-allowed backdrop-blur-sm">
                            <Lock className="w-4 h-4" />
                            Protected
                          </div>
                        )}
                        {user.role !== 'student' && !user.is_super_admin && (
                          <button
                            onClick={() => removeUserRole(user.user_id)}
                            disabled={actioning === user.user_id}
                            className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 disabled:hover:scale-100"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-white/70 text-sm font-medium">
                      {new Date(user.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
