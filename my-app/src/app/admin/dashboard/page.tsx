'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Shield, Users, UserCheck, UserX, RefreshCw, AlertCircle, UserPlus, Mail, BarChart3 } from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';

interface UserWithRole {
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
  assigned_by: string | null;
  auth_users: {
    email: string;
    created_at: string;
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

  const updateUserRole = useCallback(async (userId: string, newRole: string) => {
    setActioning(userId);
    setError(null);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role: newRole }),
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200';
      case 'faculty': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'student': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'faculty': return <UserCheck className="w-4 h-4" />;
      case 'student': return <Users className="w-4 h-4" />;
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
              <div className="p-3 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-2xl backdrop-blur-sm border border-white/10">
                <Shield className="w-8 h-8 text-red-300" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-red-200 to-orange-200 bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
                <p className="text-white/70 text-lg">Manage user roles and system analytics</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <a
                href="/admin/analytics"
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                <BarChart3 className="w-5 h-5" />
                View Analytics
              </a>
              <a
                href="/admin/role-requests"
                className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 relative"
              >
                Pending Requests
                {pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center text-xs bg-red-600 text-white rounded-full px-2 py-0.5">
                    {pendingCount}
                  </span>
                )}
              </a>
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
              <h2 className="text-white text-xl font-bold">User Management</h2>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowInviteForm(!showInviteForm)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite User
                </button>
                <button
                  onClick={fetchUsers}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Invite User Form */}
          {showInviteForm && (
            <div className="px-8 py-6 border-b border-white/10 bg-white/5">
              <h3 className="text-white text-lg font-semibold mb-4">Invite New User</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
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
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {inviting ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/10 text-white/80">
                  <th className="p-4">User</th>
                  <th className="p-4">Current Role</th>
                  <th className="p-4">Actions</th>
                  <th className="p-4">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="p-4">
                      <div>
                        <div className="text-white font-medium">
                          {user.auth_users?.email || `User ${user.user_id.slice(0, 8)}`}
                        </div>
                        <div className="text-white/60 text-sm">
                          ID: {user.user_id.slice(0, 8)}...
                        </div>
                        {user.auth_users?.email && (
                          <div className="text-white/40 text-xs mt-1">
                            Joined: {new Date(user.auth_users.created_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${getRoleColor(user.role)}`}>
                        {getRoleIcon(user.role)}
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {user.role !== 'admin' && (
                          <button
                            onClick={() => updateUserRole(user.user_id, 'admin')}
                            disabled={actioning === user.user_id}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                          >
                            Make Admin
                          </button>
                        )}
                        {user.role !== 'faculty' && (
                          <button
                            onClick={() => updateUserRole(user.user_id, 'faculty')}
                            disabled={actioning === user.user_id}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                          >
                            Make Faculty
                          </button>
                        )}
                        {user.role !== 'student' && (
                          <button
                            onClick={() => updateUserRole(user.user_id, 'student')}
                            disabled={actioning === user.user_id}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                          >
                            Make Student
                          </button>
                        )}
                        {user.role !== 'student' && (
                          <button
                            onClick={() => removeUserRole(user.user_id)}
                            disabled={actioning === user.user_id}
                            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-white/60 text-sm">
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
