/**
 * Waiting/Pending Approval Page
 * 
 * Shown to recruiters awaiting admin approval for organization access.
 * Features Supabase Realtime for instant status updates (no polling!).
 * Maintains CampusSync dark glassmorphism theme.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle, XCircle, RefreshCw, Sparkles, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface AccessRequest {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'revoked';
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  requested_at: string;
  reviewed_at?: string;
  notes?: string;
}

export default function WaitingPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch access requests
  const fetchRequests = React.useCallback(async () => {
    try {
      const res = await fetch('/api/recruiter/request-access');
      if (!res.ok) {
        throw new Error('Failed to fetch requests');
      }
      const data = await res.json();
      setRequests(data.requests || []);

      // Check if any requests are approved - auto redirect
      const hasApproved = data.requests?.some((r: AccessRequest) => r.status === 'approved');
      if (hasApproved) {
        setTimeout(() => {
          router.push('/recruiter/dashboard');
        }, 2000);
      }
    } catch (err) {
      logger.error('Failed to fetch requests', err);
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  // Get current user ID for realtime filtering
  useEffect(() => {
    const getUserId = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUserId();
  }, []);

  // Initial fetch + Supabase Realtime subscription
  useEffect(() => {
    fetchRequests();

    if (!userId) return;

    logger.debug('Setting up Supabase Realtime for user', { userId });

    // Create Supabase client
    const supabase = createClient();
    
    // Subscribe to recruiter_org_access table changes
    const channel: RealtimeChannel = supabase
      .channel('recruiter-access-requests')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'recruiter_org_access',
          filter: `recruiter_user_id=eq.${userId}` // Only my requests
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          logger.debug('Realtime update received', { payload });
          
          // Auto-refresh data on any change
          fetchRequests();
        }
      )
      .subscribe((status: string) => {
        logger.debug('Realtime subscription status', { status });
        
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeConnected(false);
        }
      });

    // Cleanup on unmount
    return () => {
      logger.debug('Cleaning up Supabase Realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [userId, fetchRequests]);

  // Manual refresh handler
  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  // Calculate status counts
  const statusCounts = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    denied: requests.filter(r => r.status === 'denied').length
  };

  // Get status icon and color
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          icon: <Clock className="w-5 h-5" />,
          color: 'text-yellow-300',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30'
        };
      case 'approved':
        return {
          icon: <CheckCircle className="w-5 h-5" />,
          color: 'text-emerald-300',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/30'
        };
      case 'denied':
        return {
          icon: <XCircle className="w-5 h-5" />,
          color: 'text-red-300',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30'
        };
      default:
        return {
          icon: <Clock className="w-5 h-5" />,
          color: 'text-white/60',
          bgColor: 'bg-white/5',
          borderColor: 'border-white/10'
        };
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0">
        {/* Gradient orbs */}
        <div className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-yellow-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] right-[10%] w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        
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
              {/* Realtime Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium transition-all ${
                realtimeConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
              }`}>
                {realtimeConnected ? (
                  <>
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Live Updates</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 animate-pulse" />
                    <span>Connecting...</span>
                  </>
                )}
              </div>

              <Link
                href="/organizations"
                className="px-4 py-2 text-white/80 hover:text-white transition-colors text-sm font-medium"
              >
                Organizations
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
          <div className="max-w-5xl mx-auto">
            {/* Title */}
            <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 flex items-center justify-center gap-3">
                <Clock className="w-10 h-10 text-yellow-400" />
                Awaiting Approval
              </h1>
              <p className="text-lg text-white/60 max-w-2xl mx-auto">
                Your access requests are being reviewed. Updates appear instantly via Supabase Realtime!
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm text-center">
                {error}
              </div>
            )}

            {/* Manual Refresh Button */}
            <div className="flex items-center justify-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '100ms' }}>
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="px-6 py-3 bg-white/5 border border-white/20 text-white rounded-xl hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Manual Refresh'}
              </button>
            </div>

            {/* Loading State */}
            {loading ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center gap-3 text-white/60">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading your requests...</span>
                </div>
              </div>
            ) : (
              <>
                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '200ms' }}>
                  {/* Pending */}
                  <div className="bg-yellow-500/10 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-6 hover:border-yellow-500/50 transition-all">
                    <div className="flex items-center gap-3 mb-2">
                      <Clock className="w-6 h-6 text-yellow-300" />
                      <h3 className="text-lg font-semibold text-yellow-300">Pending</h3>
                    </div>
                    <p className="text-3xl font-bold text-white">{statusCounts.pending}</p>
                    <p className="text-sm text-white/60 mt-1">Under review</p>
                  </div>

                  {/* Approved */}
                  <div className="bg-emerald-500/10 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-6 hover:border-emerald-500/50 transition-all">
                    <div className="flex items-center gap-3 mb-2">
                      <CheckCircle className="w-6 h-6 text-emerald-300" />
                      <h3 className="text-lg font-semibold text-emerald-300">Approved</h3>
                    </div>
                    <p className="text-3xl font-bold text-white">{statusCounts.approved}</p>
                    <p className="text-sm text-white/60 mt-1">Access granted</p>
                  </div>

                  {/* Denied */}
                  <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/30 rounded-2xl p-6 hover:border-red-500/50 transition-all">
                    <div className="flex items-center gap-3 mb-2">
                      <XCircle className="w-6 h-6 text-red-300" />
                      <h3 className="text-lg font-semibold text-red-300">Denied</h3>
                    </div>
                    <p className="text-3xl font-bold text-white">{statusCounts.denied}</p>
                    <p className="text-sm text-white/60 mt-1">Not approved</p>
                  </div>
                </div>

                {/* Requests List */}
                {requests.length > 0 ? (
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '300ms' }}>
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <span>Your Requests</span>
                      <span className="px-2 py-1 bg-white/10 rounded-lg text-sm">{requests.length}</span>
                    </h2>

                    <div className="space-y-4">
                      {requests.map((request) => {
                        const statusDisplay = getStatusDisplay(request.status);
                        return (
                          <div
                            key={request.id}
                            className={`p-4 ${statusDisplay.bgColor} border ${statusDisplay.borderColor} rounded-xl transition-all hover:scale-[1.02]`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`${statusDisplay.color}`}>
                                  {statusDisplay.icon}
                                </div>
                                <div>
                                  <h3 className="font-semibold text-white">{request.organization.name}</h3>
                                  <p className="text-sm text-white/60">
                                    Requested {new Date(request.requested_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>

                              <div className={`px-4 py-2 rounded-lg font-semibold text-sm uppercase ${statusDisplay.bgColor} ${statusDisplay.borderColor} border ${statusDisplay.color}`}>
                                {request.status}
                              </div>
                            </div>

                            {request.notes && (
                              <p className="mt-3 text-sm text-white/60 italic border-t border-white/10 pt-3">
                                {request.notes}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '300ms' }}>
                    <Clock className="w-16 h-16 mx-auto mb-4 text-white/20" />
                    <p className="text-white/60 mb-4">No access requests yet</p>
                    <Link
                      href="/organizations"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl font-semibold hover:scale-105 transition-all"
                    >
                      Browse Organizations
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 text-center text-sm text-white/50">
          <p>&copy; {new Date().getFullYear()} CampusSync. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
