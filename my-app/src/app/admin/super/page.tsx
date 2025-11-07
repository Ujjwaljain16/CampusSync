'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Building2, Users, FileCheck, Activity, Plus, RefreshCw, 
  AlertCircle, Crown, Search, BarChart3, Shield,
  Eye, Settings, CheckCircle, XCircle, TrendingUp, Briefcase, ArrowRight
} from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';

interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  email: string;
  phone?: string;
  website?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  user_count?: number;
  student_count?: number;
  faculty_count?: number;
  certificate_count?: number;
}

interface PlatformStats {
  total_organizations: number;
  total_users: number;
  total_certificates: number;
  active_verifications: number;
  total_students: number;
  total_faculty: number;
}

export default function SuperAdminDashboard() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [pendingRecruitersCount, setPendingRecruitersCount] = useState<number>(0);

  // Deterministic particles to avoid hydration errors
  const particles = useMemo(() => [
    { top: '10%', left: '5%', duration: '4s', delay: '0s' },
    { top: '20%', right: '10%', duration: '5s', delay: '0.5s' },
    { top: '60%', left: '15%', duration: '3.5s', delay: '1s' },
    { bottom: '15%', right: '20%', duration: '4.5s', delay: '0.3s' },
    { bottom: '30%', left: '25%', duration: '5s', delay: '0.7s' },
  ], []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load organizations
      const orgsRes = await fetch('/api/v2/admin/super/organizations');
      const orgsJson = await orgsRes.json();
      if (!orgsRes.ok) throw new Error(orgsJson.error || 'Failed to load organizations');
      setOrganizations(orgsJson.data || []);

      // Load platform stats
      const statsRes = await fetch('/api/v2/admin/super/stats');
      const statsJson = await statsRes.json();
      if (statsRes.ok) {
        setStats(statsJson.data);
      }

      // Load pending recruiters count
      const recruitersRes = await fetch('/api/admin/faculty-approvals?status=pending&role=recruiter');
      const recruitersJson = await recruitersRes.json();
      if (recruitersRes.ok) {
        setPendingRecruitersCount(recruitersJson.data?.length || 0);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const filteredOrganizations = useMemo(() => {
    let filtered = organizations;
    
    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(org => 
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(org => org.type === filterType);
    }
    
    return filtered;
  }, [organizations, searchQuery, filterType]);

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
            <p className="mt-4 text-white/80 text-lg font-medium">Loading super admin dashboard...</p>
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
                Platform Administration
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
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                <div className="relative p-4 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-sm rounded-2xl border border-white/10">
                  <Crown className="w-10 h-10 text-yellow-300 drop-shadow-lg" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent animate-gradient">
                  Super Admin
                </h1>
                <p className="text-white/80 text-base md:text-lg mt-1 font-medium">
                  Platform Administration Dashboard
                  <span className="text-yellow-300"> • Full Control</span>
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/super/analytics"
                className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
              >
                <BarChart3 className="w-5 h-5" />
                <span>Platform Analytics</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              </Link>
              
              <Link
                href="/admin/super/organizations/new"
                className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/25"
              >
                <Plus className="w-5 h-5" />
                <span>Create Organization</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              </Link>
            </div>
          </div>
        </div>

        {/* Platform Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Organizations"
              value={stats.total_organizations}
              icon={<Building2 className="w-8 h-8" />}
              gradient="from-blue-500/20 to-cyan-500/20"
              iconColor="text-blue-300"
              trend="+3 this month"
            />
            <StatCard
              title="Total Users"
              value={stats.total_users}
              icon={<Users className="w-8 h-8" />}
              gradient="from-emerald-500/20 to-green-500/20"
              iconColor="text-emerald-300"
              trend="+12 today"
            />
            <StatCard
              title="Certificates"
              value={stats.total_certificates}
              icon={<FileCheck className="w-8 h-8" />}
              gradient="from-purple-500/20 to-pink-500/20"
              iconColor="text-purple-300"
              trend="+45 this week"
            />
            <StatCard
              title="Active Verifications"
              value={stats.active_verifications}
              icon={<Activity className="w-8 h-8" />}
              gradient="from-orange-500/20 to-red-500/20"
              iconColor="text-orange-300"
              trend="Real-time"
            />
          </div>
        )}

        {/* Pending Recruiter Approvals */}
        {pendingRecruitersCount > 0 && (
          <Link
            href="/admin/faculty-approvals?role=recruiter"
            className="block mb-8 group"
          >
            <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 backdrop-blur-2xl border border-yellow-500/30 rounded-3xl shadow-2xl p-6 hover:shadow-yellow-500/20 transition-all duration-300 hover:scale-[1.02]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Briefcase className="w-8 h-8 text-yellow-300" />
                  </div>
                  <div>
                    <h3 className="text-white text-xl font-bold mb-1">Pending Recruiter Approvals</h3>
                    <p className="text-gray-400 text-sm">
                      {pendingRecruitersCount} {pendingRecruitersCount === 1 ? 'recruiter' : 'recruiters'} waiting for platform access
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-4xl font-bold text-yellow-300 mb-1">{pendingRecruitersCount}</div>
                    <div className="text-xs text-yellow-400/70 uppercase tracking-wider">Action Required</div>
                  </div>
                  <ArrowRight className="w-6 h-6 text-yellow-300 group-hover:translate-x-2 transition-transform duration-300" />
                </div>
              </div>
            </div>
          </Link>
        )}

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

        {/* Organizations List */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
          <div className="px-6 md:px-8 py-6 border-b border-white/10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-300" />
                </div>
                <h2 className="text-white text-2xl font-bold">Organizations</h2>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search organizations..."
                    className="w-full sm:w-64 pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  />
                </div>
                
                {/* Filter */}
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                >
                  <option value="all" className="bg-gray-800">All Types</option>
                  <option value="institute" className="bg-gray-800">Institute</option>
                  <option value="university" className="bg-gray-800">University</option>
                  <option value="company" className="bg-gray-800">Company</option>
                  <option value="enterprise" className="bg-gray-800">Enterprise</option>
                </select>
                
                <button
                  onClick={loadDashboard}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold transition-all disabled:opacity-50 border border-white/10 hover:border-white/20 backdrop-blur-xl"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Organization</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Users</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Certificates</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/80 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrganizations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Building2 className="w-12 h-12 text-white/20" />
                        <p className="text-white/60 text-lg">No organizations found</p>
                        <Link
                          href="/admin/super/organizations/new"
                          className="mt-2 inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/25"
                        >
                          <Plus className="w-5 h-5" />
                          <span>Create First Organization</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredOrganizations.map((org) => (
                    <tr key={org.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-blue-300" />
                          </div>
                          <div>
                            <div className="text-white font-semibold">{org.name}</div>
                            <div className="text-white/60 text-sm">{org.slug}</div>
                            <div className="text-white/40 text-xs mt-0.5">{org.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-white/10 text-white/80 backdrop-blur-sm">
                          {org.type}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-white font-semibold">{org.user_count || 0}</div>
                        <div className="text-white/60 text-xs">
                          {org.student_count || 0} students • {org.faculty_count || 0} faculty
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-white font-semibold">{org.certificate_count || 0}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          {org.is_active ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle className="w-3 h-3" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                              <XCircle className="w-3 h-3" />
                              Inactive
                            </span>
                          )}
                          {org.is_verified && (
                            <Shield className="w-4 h-4 text-blue-300" aria-label="Verified" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-white/70 text-sm font-medium">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/super/organizations/${org.id}`}
                            className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg transition-all border border-blue-500/30"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            href={`/admin/super/organizations/${org.id}/admins`}
                            className="p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-lg transition-all border border-emerald-500/30"
                            title="Manage Admins"
                          >
                            <Users className="w-4 h-4" />
                          </Link>
                          <Link
                            href={`/admin/super/organizations/${org.id}/settings`}
                            className="p-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg transition-all border border-purple-500/30"
                            title="Settings"
                          >
                            <Settings className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
  trend 
}: { 
  title: string; 
  value: number; 
  icon: React.ReactNode; 
  gradient: string; 
  iconColor: string; 
  trend?: string;
}) {
  return (
    <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 hover:scale-105 transition-transform duration-300 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 bg-gradient-to-br ${gradient} rounded-xl`}>
          <div className={iconColor}>{icon}</div>
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-xs text-emerald-300 font-semibold">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-white/70 text-sm font-medium mb-1">{title}</p>
        <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
