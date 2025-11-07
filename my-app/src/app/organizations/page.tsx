/**
 * Organizations Directory Page
 * 
 * Allows recruiters to browse organizations and request access.
 * Features search, filtering, and real-time status tracking.
 * Maintains CampusSync dark glassmorphism theme.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Search, Users, CheckCircle, Clock, XCircle, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  logo?: string;
  is_active: boolean;
  settings?: {
    allowed_email_domains?: string[];
  };
  _count?: {
    students?: number;
    certificates?: number;
  };
}

interface AccessRequest {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'revoked';
  organization_id: string;
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [myRequests, setMyRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch organizations and access requests
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all active organizations
        const orgsRes = await fetch('/api/v2/admin/super/organizations');
        if (!orgsRes.ok) throw new Error('Failed to fetch organizations');
        const orgsData = await orgsRes.json();
        setOrganizations(orgsData.organizations || []);

        // Fetch my access requests
        const requestsRes = await fetch('/api/recruiter/request-access');
        if (requestsRes.ok) {
          const requestsData = await requestsRes.json();
          setMyRequests(requestsData.requests || []);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load organizations');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle access request
  const handleRequestAccess = async (orgId: string, orgName: string) => {
    setSubmitting(orgId);
    setError(null);

    try {
      const res = await fetch('/api/recruiter/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: orgId,
          notes: `I would like to access ${orgName} to find qualified candidates.`
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to request access');
      }

      // Refresh requests
      const requestsRes = await fetch('/api/recruiter/request-access');
      if (requestsRes.ok) {
        const requestsData = await requestsRes.json();
        setMyRequests(requestsData.requests || []);
      }

      // Show success message (could use toast here)
      alert(`Access request sent to ${orgName}!`);
    } catch (err) {
      console.error('Failed to request access:', err);
      setError(err instanceof Error ? err.message : 'Failed to request access');
    } finally {
      setSubmitting(null);
    }
  };

  // Get request status for organization
  const getRequestStatus = (orgId: string): AccessRequest | undefined => {
    return myRequests.find(r => r.organization_id === orgId);
  };

  // Filter organizations
  const filteredOrgs = organizations.filter(org => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      org.name.toLowerCase().includes(query) ||
      org.type?.toLowerCase().includes(query) ||
      org.slug?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-[#0A0F1E] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0">
        {/* Gradient orbs */}
        <div className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-blue-500/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[10%] right-[10%] w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)',
              backgroundSize: '50px 50px'
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="pt-6 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link 
              href="/" 
              className="flex items-center gap-2 text-white/90 hover:text-white transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                CampusSync
              </span>
            </Link>

            <div className="flex items-center gap-4">
              <Link
                href="/waiting"
                className="px-4 py-2 text-white/80 hover:text-white transition-colors text-sm font-medium"
              >
                My Requests
              </Link>
              <Link
                href="/recruiter/dashboard"
                className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm font-medium"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-6 py-12">
          <div className="max-w-7xl mx-auto">
            {/* Title & Description */}
            <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 flex items-center justify-center gap-3">
                <Building2 className="w-10 h-10 text-blue-400" />
                Organizations Directory
              </h1>
              <p className="text-lg text-white/60 max-w-2xl mx-auto">
                Browse organizations and request access to view their students and certificates
              </p>
            </div>

            {/* Search Bar */}
            <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '100ms' }}>
              <div className="max-w-2xl mx-auto relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search organizations by name, type, or location..."
                  className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/60 text-sm transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm text-center max-w-2xl mx-auto">
                {error}
              </div>
            )}

            {/* Loading State */}
            {loading ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center gap-3 text-white/60">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading organizations...</span>
                </div>
              </div>
            ) : (
              <>
                {/* Results Count */}
                <div className="mb-6 text-center">
                  <p className="text-white/60">
                    Showing <span className="font-semibold text-white">{filteredOrgs.length}</span> of <span className="font-semibold text-white">{organizations.length}</span> organizations
                  </p>
                </div>

                {/* Organizations Grid */}
                {filteredOrgs.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '200ms' }}>
                    {filteredOrgs.map((org) => {
                      const request = getRequestStatus(org.id);
                      const isSubmitting = submitting === org.id;

                      return (
                        <div
                          key={org.id}
                          className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-white/20 hover:bg-white/10 transition-all duration-300"
                        >
                          {/* Organization Logo */}
                          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Building2 className="w-8 h-8 text-white" />
                          </div>

                          {/* Organization Info */}
                          <div className="text-center mb-4">
                            <h3 className="text-lg font-semibold text-white mb-2">{org.name}</h3>
                            {org.type && (
                              <span className="inline-block px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-xs font-semibold text-blue-300 mb-2">
                                {org.type}
                              </span>
                            )}
                            {org.description && (
                              <p className="text-sm text-white/60 line-clamp-2">{org.description}</p>
                            )}
                          </div>

                          {/* Stats */}
                          <div className="flex items-center justify-center gap-4 mb-4 text-sm text-white/60">
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>{org._count?.students || 0} students</span>
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="mt-4">
                            {!request ? (
                              <button
                                onClick={() => handleRequestAccess(org.id, org.name)}
                                disabled={isSubmitting}
                                className="w-full py-3 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl font-semibold hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                              >
                                {isSubmitting ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Sending...
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-4 h-4" />
                                    Request Access
                                  </>
                                )}
                              </button>
                            ) : request.status === 'pending' ? (
                              <div className="w-full py-3 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-xl font-semibold flex items-center justify-center gap-2">
                                <Clock className="w-4 h-4" />
                                Pending Review
                              </div>
                            ) : request.status === 'approved' ? (
                              <Link
                                href="/recruiter/dashboard"
                                className="w-full py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl font-semibold hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Access Granted
                              </Link>
                            ) : request.status === 'denied' ? (
                              <button
                                onClick={() => handleRequestAccess(org.id, org.name)}
                                disabled={isSubmitting}
                                className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                              >
                                <XCircle className="w-4 h-4" />
                                Request Again
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <Building2 className="w-16 h-16 mx-auto mb-4 text-white/20" />
                    <p className="text-white/60 mb-2">No organizations found</p>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 text-center text-sm text-white/50">
          <p>
            &copy; {new Date().getFullYear()} CampusSync. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
