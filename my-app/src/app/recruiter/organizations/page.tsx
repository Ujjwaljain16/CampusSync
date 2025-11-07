'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, Search, MapPin, Users, CheckCircle, Clock, 
  XCircle, Briefcase, GraduationCap, ArrowRight,
  RefreshCw, AlertCircle, Send
} from 'lucide-react';
import Link from 'next/link';

interface Organization {
  id: string;
  name: string;
  slug: string;
  type: 'university' | 'college' | 'institute' | 'enterprise';
  email: string;
  phone: string | null;
  address: unknown;
  branding: unknown;
  logo_url: string | null;
  is_active: boolean;
  is_verified: boolean;
  student_count: number;
  faculty_count: number;
  location: string | null;
  created_at: string;
}

interface AccessRequest {
  organization_id: string;
  status: 'pending' | 'approved' | 'denied';
  requested_at: string;
  approved_at: string | null;
}

export default function RecruiterBrowseOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [accessRequests, setAccessRequests] = useState<Record<string, AccessRequest>>({});
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Fetch organizations and access requests
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all active organizations
      const orgsRes = await fetch('/api/recruiter/organizations');
      const orgsJson = await orgsRes.json();
      if (!orgsRes.ok) throw new Error(orgsJson.error || 'Failed to load organizations');
      setOrganizations(orgsJson.data || []);

      // Fetch my access requests
      const requestsRes = await fetch('/api/recruiter/access-requests');
      const requestsJson = await requestsRes.json();
      console.log('[ORG-PAGE] Access requests response:', requestsJson);
      if (requestsRes.ok) {
        const requestsMap: Record<string, AccessRequest> = {};
        (requestsJson.data || []).forEach((req: AccessRequest) => {
          requestsMap[req.organization_id] = req;
        });
        console.log('[ORG-PAGE] Access requests map:', requestsMap);
        setAccessRequests(requestsMap);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Request access to organization
  const requestAccess = useCallback(async (orgId: string) => {
    setRequesting(orgId);
    try {
      const res = await fetch('/api/recruiter/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: orgId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to request access');
      
      // Update local state
      setAccessRequests(prev => ({
        ...prev,
        [orgId]: {
          organization_id: orgId,
          status: 'pending',
          requested_at: new Date().toISOString(),
          approved_at: null
        }
      }));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to request access');
    } finally {
      setRequesting(null);
    }
  }, []);

  // Filter organizations
  const filteredOrganizations = organizations.filter(org => {
    const matchesSearch = searchQuery === '' || 
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'all' || org.type === filterType;
    
    return matchesSearch && matchesType;
  });

  // Get request status for organization
  const getRequestStatus = (orgId: string) => {
    const request = accessRequests[orgId];
    if (!request) return null;
    return request.status;
  };

  const getStatusBadge = (orgId: string) => {
    const status = getRequestStatus(orgId);
    
    if (status === 'pending') {
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded-xl text-yellow-300">
          <Clock className="w-4 h-4" />
          <span className="font-medium">Pending Approval</span>
        </div>
      );
    } else if (status === 'approved') {
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300">
          <CheckCircle className="w-4 h-4" />
          <span className="font-medium">Access Granted</span>
        </div>
      );
    } else if (status === 'denied') {
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300">
          <XCircle className="w-4 h-4" />
          <span className="font-medium">Request Denied</span>
        </div>
      );
    }
    
    return null;
  };

  const getOrgTypeIcon = (type: string) => {
    switch (type) {
      case 'university':
      case 'college':
      case 'institute':
        return <GraduationCap className="w-5 h-5" />;
      default:
        return <Building2 className="w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-[10%] w-2 h-2 bg-blue-400/40 rounded-full animate-float" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-40 right-[15%] w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-float" style={{ animationDelay: '0.5s', animationDuration: '4s' }} />
        <div className="absolute bottom-32 left-[20%] w-2.5 h-2.5 bg-purple-400/30 rounded-full animate-float" style={{ animationDelay: '1s', animationDuration: '5s' }} />
        
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-br from-blue-500/30 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-br from-emerald-500/30 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/recruiter/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white transition-all duration-300 group"
            >
              <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
              <span className="font-medium">Back to Dashboard</span>
            </Link>

            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white transition-all duration-300"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="font-medium">Refresh</span>
            </button>
          </div>

          <div className="flex items-start gap-4 mb-6">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <div className="relative p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:scale-110 transition-transform duration-300">
                <Building2 className="w-9 h-9 text-blue-300 drop-shadow-lg" />
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient mb-2">
                Browse Organizations
              </h1>
              <p className="text-white/80 text-lg font-medium">
                Request access to universities and companies to connect with talented students
              </p>
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border border-blue-500/20 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Briefcase className="w-6 h-6 text-blue-300" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">How Organization Access Works</h3>
                <ol className="space-y-2 text-white/70 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold">1.</span>
                    <span>Browse and select organizations you want to recruit from</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold">2.</span>
                    <span>Click &quot;Request Access&quot; to submit your request to the organization admin</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold">3.</span>
                    <span>Wait for approval (you&apos;ll be notified via email)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">4.</span>
                    <span>Once approved, access student profiles and verified certifications from that organization</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/50 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search organizations by name or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all"
                >
                  <option value="all">All Types</option>
                  <option value="university">University</option>
                  <option value="college">College</option>
                  <option value="institute">Institute</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
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

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
              <p className="text-white/70 text-lg">Loading organizations...</p>
            </div>
          </div>
        ) : filteredOrganizations.length === 0 ? (
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-12 text-center">
            <Building2 className="w-16 h-16 text-white/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No organizations found</h3>
            <p className="text-white/60">Try adjusting your search or filter criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrganizations.map((org) => {
              const requestStatus = getRequestStatus(org.id);
              const isRequesting = requesting === org.id;
              
              return (
                <div
                  key={org.id}
                  className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 hover:bg-white/15 hover:border-blue-400/30 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/20 group"
                >
                  {/* Organization Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/30 to-emerald-500/30 backdrop-blur-sm border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      {getOrgTypeIcon(org.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white mb-1 truncate">{org.name}</h3>
                      <p className="text-sm text-white/60 capitalize">{org.type}</p>
                      {org.is_verified && (
                        <div className="flex items-center gap-1 mt-1">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-emerald-400 font-medium">Verified</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Organization Details */}
                  {org.email && (
                    <p className="text-white/70 text-sm mb-4 truncate">{org.email}</p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <div className="flex items-center gap-2 text-blue-300 mb-1">
                        <Users className="w-4 h-4" />
                        <span className="text-xs font-medium">Students</span>
                      </div>
                      <p className="text-lg font-bold text-white">{org.student_count || 0}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <div className="flex items-center gap-2 text-emerald-300 mb-1">
                        <GraduationCap className="w-4 h-4" />
                        <span className="text-xs font-medium">Faculty</span>
                      </div>
                      <p className="text-lg font-bold text-white">{org.faculty_count || 0}</p>
                    </div>
                  </div>

                  {org.location && (
                    <div className="flex items-center gap-2 text-white/60 text-sm mb-4">
                      <MapPin className="w-4 h-4" />
                      <span>{org.location}</span>
                    </div>
                  )}

                  {/* Action Button */}
                  <div className="pt-4 border-t border-white/10">
                    {requestStatus === 'approved' ? (
                      <div className="space-y-3">
                        {getStatusBadge(org.id)}
                        <Link
                          href={`/recruiter/dashboard?org=${org.id}`}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/25 hover:scale-105"
                        >
                          <Briefcase className="w-5 h-5" />
                          <span>View Students</span>
                        </Link>
                      </div>
                    ) : requestStatus === 'pending' ? (
                      getStatusBadge(org.id)
                    ) : requestStatus === 'denied' ? (
                      getStatusBadge(org.id)
                    ) : (
                      <button
                        onClick={() => requestAccess(org.id)}
                        disabled={isRequesting}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 hover:scale-105 group"
                      >
                        {isRequesting ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            <span>Requesting...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            <span>Request Access</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}
