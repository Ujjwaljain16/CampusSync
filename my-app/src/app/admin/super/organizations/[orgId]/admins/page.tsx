'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Users, ArrowLeft, Crown, Shield, Mail, 
  AlertCircle, RefreshCw, UserPlus, Trash2,
  Calendar
} from 'lucide-react';
import LogoutButton from '@/components/LogoutButton';

interface Admin {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  is_primary_admin: boolean;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function OrganizationAdminsPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load organization
      const orgRes = await fetch(`/api/v2/admin/super/organizations/${orgId}`);
      const orgJson = await orgRes.json();
      if (!orgRes.ok) throw new Error(orgJson.error || 'Failed to load organization');
      setOrganization(orgJson.data);

      // Load admins
      const adminsRes = await fetch(`/api/v2/admin/super/organizations/${orgId}/admins`);
      const adminsJson = await adminsRes.json();
      if (!adminsRes.ok) throw new Error(adminsJson.error || 'Failed to load admins');
      setAdmins(adminsJson.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRemoveAdmin = async (adminId: string) => {
    if (!confirm('Are you sure you want to remove this admin?')) return;

    setActionLoading(adminId);
    try {
      const res = await fetch(`/api/v2/admin/super/organizations/${orgId}/admins/${adminId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to remove admin');
      
      alert('Admin removed successfully');
      loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to remove admin');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTransferPrimaryAdmin = async (newPrimaryAdminId: string) => {
    if (!confirm('Are you sure you want to transfer primary admin status? This cannot be undone easily.')) return;

    setActionLoading(newPrimaryAdminId);
    try {
      const res = await fetch(`/api/v2/admin/super/organizations/${orgId}/primary-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_primary_admin_id: newPrimaryAdminId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to transfer primary admin');
      
      alert('Primary admin transferred successfully');
      loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to transfer primary admin');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-blue-300 mx-auto" />
          <p className="mt-4 text-white/80">Loading admins...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-clean.svg"
              alt="CampusSync"
              width={40}
              height={40}
              className="w-10 h-10"
              priority
            />
            <span className="text-lg font-bold text-white">CampusSync</span>
          </Link>
          <LogoutButton variant="danger" />
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-3 text-sm">
          <Link href="/admin/super" className="text-white/80 hover:text-white transition-colors">
            Super Admin
          </Link>
          <span className="text-white/40">/</span>
          <Link href={`/admin/super/organizations/${orgId}`} className="text-white/80 hover:text-white transition-colors">
            {organization?.name}
          </Link>
          <span className="text-white/40">/</span>
          <span className="text-white">Admins</span>
        </div>

        {/* Header */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 mb-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-2xl flex items-center justify-center">
                <Users className="w-8 h-8 text-emerald-300" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Admin Management</h1>
                <p className="text-white/60">
                  Manage administrators for <span className="text-white font-semibold">{organization?.name}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href={`/admin/super/organizations/${orgId}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold transition-all border border-white/10"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </Link>
              <Link
                href={`/admin/super/organizations/${orgId}/admins/new`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all shadow-lg"
              >
                <UserPlus className="w-5 h-5" />
                Add Admin
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-5 rounded-2xl border bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-300" />
              <p className="text-red-300 font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* Admins List */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
          <div className="px-8 py-6 border-b border-white/10">
            <h2 className="text-white text-xl font-bold flex items-center gap-3">
              <Crown className="w-5 h-5 text-yellow-300" />
              Organization Administrators ({admins.length})
            </h2>
          </div>

          {admins.length === 0 ? (
            <div className="px-8 py-12 text-center">
              <Users className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/60 text-lg">No administrators found</p>
              <Link
                href={`/admin/super/organizations/${orgId}/admins/new`}
                className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all shadow-lg"
              >
                <UserPlus className="w-5 h-5" />
                Add First Admin
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {admins.map((admin) => (
                <div key={admin.id} className="px-8 py-6 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-300" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-white font-semibold text-lg">
                            {admin.full_name || admin.email}
                          </h3>
                          {admin.is_primary_admin && (
                            <div className="flex items-center gap-1 px-3 py-1 rounded-lg bg-yellow-500/20 border border-yellow-500/30">
                              <Crown className="w-3 h-3 text-yellow-300" />
                              <span className="text-xs font-bold text-yellow-300">PRIMARY ADMIN</span>
                            </div>
                          )}
                          <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold ${
                            admin.role === 'org_admin' 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {admin.role}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-white/60">
                          <span className="flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            {admin.email}
                          </span>
                          <span className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Added {new Date(admin.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {!admin.is_primary_admin && (
                        <>
                          <button
                            onClick={() => handleTransferPrimaryAdmin(admin.id)}
                            disabled={actionLoading === admin.id}
                            className="px-4 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-300 rounded-lg transition-all border border-yellow-500/30 font-medium disabled:opacity-50 text-sm"
                          >
                            {actionLoading === admin.id ? 'Processing...' : 'Make Primary'}
                          </button>
                          <button
                            onClick={() => handleRemoveAdmin(admin.id)}
                            disabled={actionLoading === admin.id}
                            className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded-lg transition-all border border-red-500/30 font-medium disabled:opacity-50 text-sm flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </button>
                        </>
                      )}
                      {admin.is_primary_admin && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 text-yellow-300 rounded-lg border border-yellow-500/20 text-sm font-medium">
                          <Shield className="w-4 h-4" />
                          Protected
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-300 mt-0.5" />
            <div>
              <h3 className="text-white font-semibold mb-2">About Primary Admins</h3>
              <p className="text-blue-200/80 text-sm leading-relaxed">
                Every organization must have exactly one primary admin. The primary admin has full control 
                over the organization and cannot be removed or demoted by other admins. Only super admins 
                can transfer primary admin status to another admin.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
