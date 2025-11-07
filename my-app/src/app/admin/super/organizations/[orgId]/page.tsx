'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Building2, Users, FileCheck, ArrowLeft, Edit, Shield, 
  Mail, Phone, Globe, Calendar, Activity, CheckCircle, 
  XCircle, Crown, AlertCircle, RefreshCw, BarChart3,
  UserPlus
} from 'lucide-react';
import LogoutButton from '@/components/LogoutButton';

interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  email: string;
  phone?: string;
  website?: string;
  address?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface OrganizationStats {
  total_users: number;
  total_students: number;
  total_faculty: number;
  total_recruiters: number;
  total_certificates: number;
  active_verifications: number;
  pending_approvals: number;
}

export default function OrganizationDetailPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [stats, setStats] = useState<OrganizationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizationDetails = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load organization details
      const orgRes = await fetch(`/api/v2/admin/super/organizations/${orgId}`);
      const orgJson = await orgRes.json();
      if (!orgRes.ok) throw new Error(orgJson.error || 'Failed to load organization');
      setOrganization(orgJson.data);

      // Load organization stats
      const statsRes = await fetch(`/api/v2/admin/super/organizations/${orgId}/stats`);
      const statsJson = await statsRes.json();
      if (statsRes.ok) {
        setStats(statsJson.data);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadOrganizationDetails();
  }, [loadOrganizationDetails]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-blue-300 mx-auto" />
          <p className="mt-4 text-white/80">Loading organization details...</p>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 backdrop-blur-xl border border-red-500/30 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-300" />
              </div>
              <h2 className="text-xl font-bold text-red-300">Error Loading Organization</h2>
            </div>
            <p className="text-red-300/80 mb-6">{error || 'Organization not found'}</p>
            <Link
              href="/admin/super"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
          </div>
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
        {/* Breadcrumb & Back Button */}
        <div className="mb-6">
          <Link
            href="/admin/super"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-medium">Back to Super Admin Dashboard</span>
          </Link>
        </div>

        {/* Organization Header */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 mb-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-2xl flex items-center justify-center">
                <Building2 className="w-8 h-8 text-blue-300" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-white">{organization.name}</h1>
                  {organization.is_verified && (
                    <div className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-500/20 border border-blue-500/30">
                      <Shield className="w-4 h-4 text-blue-300" />
                      <span className="text-xs font-bold text-blue-300">VERIFIED</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-white/60">
                  <span className="text-sm font-medium">@{organization.slug}</span>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold ${
                    organization.is_active 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}>
                    {organization.is_active ? (
                      <><CheckCircle className="w-3 h-3" /> Active</>
                    ) : (
                      <><XCircle className="w-3 h-3" /> Inactive</>
                    )}
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-white/10 text-white/80">
                    {organization.type}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/admin/super/organizations/${orgId}/admins`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all shadow-lg"
              >
                <Users className="w-5 h-5" />
                Manage Admins
              </Link>
              <Link
                href={`/admin/super/organizations/${orgId}/settings`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold transition-all border border-white/10"
              >
                <Edit className="w-5 h-5" />
                Settings
              </Link>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <p className="text-white/60 text-xs">Email</p>
                  <p className="text-white font-medium">{organization.email}</p>
                </div>
              </div>
              {organization.phone && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <Phone className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-white/60 text-xs">Phone</p>
                    <p className="text-white font-medium">{organization.phone}</p>
                  </div>
                </div>
              )}
              {organization.website && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <Globe className="w-5 h-5 text-purple-300" />
                  </div>
                  <div>
                    <p className="text-white/60 text-xs">Website</p>
                    <a href={organization.website} target="_blank" rel="noopener noreferrer" className="text-white font-medium hover:text-blue-300 transition-colors">
                      {organization.website}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Statistics Grid */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <StatCard
              title="Total Users"
              value={stats.total_users}
              icon={<Users className="w-8 h-8" />}
              gradient="from-blue-500/20 to-cyan-500/20"
              iconColor="text-blue-300"
              details={`${stats.total_students} students, ${stats.total_faculty} faculty`}
            />
            <StatCard
              title="Certificates"
              value={stats.total_certificates}
              icon={<FileCheck className="w-8 h-8" />}
              gradient="from-emerald-500/20 to-green-500/20"
              iconColor="text-emerald-300"
              details={`${stats.active_verifications} active verifications`}
            />
            <StatCard
              title="Pending Approvals"
              value={stats.pending_approvals}
              icon={<Activity className="w-8 h-8" />}
              gradient="from-orange-500/20 to-red-500/20"
              iconColor="text-orange-300"
              details="Requires attention"
            />
            <StatCard
              title="Recruiters"
              value={stats.total_recruiters}
              icon={<UserPlus className="w-8 h-8" />}
              gradient="from-purple-500/20 to-pink-500/20"
              iconColor="text-purple-300"
              details="Active recruiters"
            />
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ActionCard
            title="Organization Analytics"
            description="View detailed analytics and insights for this organization"
            icon={<BarChart3 className="w-6 h-6" />}
            href={`/admin/super/organizations/${orgId}/analytics`}
            gradient="from-blue-500/20 to-cyan-500/20"
            iconColor="text-blue-300"
          />
          <ActionCard
            title="Admin Management"
            description="Manage organization admins and their permissions"
            icon={<Crown className="w-6 h-6" />}
            href={`/admin/super/organizations/${orgId}/admins`}
            gradient="from-emerald-500/20 to-green-500/20"
            iconColor="text-emerald-300"
          />
        </div>

        {/* Metadata */}
        <div className="mt-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-300" />
            Organization Metadata
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-white/60">Created At</p>
              <p className="text-white font-medium">{new Date(organization.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-white/60">Last Updated</p>
              <p className="text-white font-medium">{new Date(organization.updated_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-white/60">Organization ID</p>
              <p className="text-white font-mono text-xs">{organization.id}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon, 
  gradient, 
  iconColor,
  details 
}: { 
  title: string; 
  value: number; 
  icon: React.ReactNode; 
  gradient: string; 
  iconColor: string;
  details?: string;
}) {
  return (
    <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-transform duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 bg-gradient-to-br ${gradient} rounded-xl`}>
          <div className={iconColor}>{icon}</div>
        </div>
      </div>
      <div>
        <p className="text-white/70 text-sm font-medium mb-1">{title}</p>
        <p className="text-3xl font-bold text-white mb-1">{value.toLocaleString()}</p>
        {details && <p className="text-white/60 text-xs">{details}</p>}
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  icon,
  href,
  gradient,
  iconColor
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  gradient: string;
  iconColor: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 hover:border-white/20"
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 bg-gradient-to-br ${gradient} rounded-xl group-hover:scale-110 transition-transform duration-300`}>
          <div className={iconColor}>{icon}</div>
        </div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg mb-2 group-hover:text-blue-300 transition-colors">{title}</h3>
          <p className="text-white/60 text-sm">{description}</p>
        </div>
      </div>
    </Link>
  );
}
