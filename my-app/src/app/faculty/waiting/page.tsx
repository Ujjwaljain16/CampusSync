/**
 * Faculty Waiting/Pending Approval Page
 * 
 * Shown to faculty members awaiting admin approval for organization access.
 * Features Supabase Realtime for instant status updates (no polling!).
 * Maintains CampusSync dark glassmorphism theme.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle, XCircle, RefreshCw, Wifi, WifiOff, GraduationCap, Building2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface FacultyApprovalRequest {
  organization_id: string;
  organization_name: string;
  approval_status: 'pending' | 'approved' | 'denied';
  requested_at: string;
  approved_at?: string;
  approved_by?: string;
  approval_notes?: string;
}

export default function FacultyWaitingPage() {
  const router = useRouter();
  const [request, setRequest] = useState<FacultyApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch approval status
  const fetchApprovalStatus = React.useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      // Fetch user's role and approval status
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select(`
          organization_id,
          role,
          approval_status,
          created_at,
          approved_at,
          approved_by,
          approval_notes
        `)
        .eq('user_id', user.id)
        .eq('role', 'faculty')
        .single();

      if (roleError) {
        console.error('Role fetch error:', roleError);
        throw new Error('Failed to fetch approval status: ' + roleError.message);
      }

      if (!roleData) {
        throw new Error('No faculty role found');
      }

      // Type guard for roleData
      interface RoleData {
        organization_id: string;
        role: string;
        approval_status: 'pending' | 'approved' | 'denied';
        created_at: string;
        approved_at?: string;
        approved_by?: string;
        approval_notes?: string;
      }
      
      const typedRoleData = roleData as RoleData;

      // Fetch organization name separately
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', typedRoleData.organization_id)
        .single();

      const organizationName = (orgData as unknown as { name?: string })?.name || 'Your Organization';

      // If approved, redirect to faculty dashboard
      if (typedRoleData.approval_status === 'approved') {
        setTimeout(() => {
          router.push('/faculty/dashboard');
        }, 2000);
      }

      setRequest({
        organization_id: typedRoleData.organization_id,
        organization_name: organizationName,
        approval_status: typedRoleData.approval_status,
        requested_at: typedRoleData.created_at,
        approved_at: typedRoleData.approved_at,
        approved_by: typedRoleData.approved_by,
        approval_notes: typedRoleData.approval_notes
      });
    } catch (err) {
      console.error('Failed to fetch approval status:', err);
      setError(err instanceof Error ? err.message : 'Failed to load approval status');
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
    fetchApprovalStatus();

    if (!userId) return;

    console.log('[INFO] Setting up Supabase Realtime for faculty user:', userId);

    // Create Supabase client
    const supabase = createClient();
    
    // Subscribe to user_roles table changes
    const channel: RealtimeChannel = supabase
      .channel('faculty-approval-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Only listen for updates
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${userId}` // Only my role
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[SUCCESS] Realtime approval status update received:', payload);
          
          // Auto-refresh data on any change
          fetchApprovalStatus();
        }
      )
      .subscribe((status: string) => {
        console.log('Realtime status:', status);
        
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeConnected(false);
        }
      });

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up Supabase Realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [userId, fetchApprovalStatus]);

  // Manual refresh handler
  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchApprovalStatus();
  };

  // Get status display
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          icon: <Clock className="w-8 h-8" />,
          color: 'text-yellow-300',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
          title: 'Awaiting Approval',
          description: 'Your faculty access request is being reviewed by an administrator'
        };
      case 'approved':
        return {
          icon: <CheckCircle className="w-8 h-8" />,
          color: 'text-emerald-300',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/30',
          title: 'Approved!',
          description: 'Your faculty access has been approved. Redirecting to dashboard...'
        };
      case 'denied':
        return {
          icon: <XCircle className="w-8 h-8" />,
          color: 'text-red-300',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          title: 'Request Denied',
          description: 'Your faculty access request was not approved'
        };
      default:
        return {
          icon: <Clock className="w-8 h-8" />,
          color: 'text-white/60',
          bgColor: 'bg-white/5',
          borderColor: 'border-white/10',
          title: 'Unknown Status',
          description: 'Unable to determine approval status'
        };
    }
  };

  const statusDisplay = request ? getStatusDisplay(request.approval_status) : null;

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
              className="flex items-center gap-3 group"
            >
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

              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-6 py-12 flex items-center justify-center">
          <div className="max-w-2xl w-full">
            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm text-center">
                {error}
              </div>
            )}

            {/* Loading State */}
            {loading ? (
              <div className="text-center py-20">
                <div className="inline-flex items-center gap-3 text-white/60">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading approval status...</span>
                </div>
              </div>
            ) : request && statusDisplay ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Status Card */}
                <div className={`${statusDisplay.bgColor} backdrop-blur-xl border ${statusDisplay.borderColor} rounded-3xl p-8 text-center`}>
                  <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${statusDisplay.bgColor} border ${statusDisplay.borderColor} mb-6 ${statusDisplay.color}`}>
                    {statusDisplay.icon}
                  </div>
                  
                  <h1 className={`text-3xl font-bold mb-3 ${statusDisplay.color}`}>
                    {statusDisplay.title}
                  </h1>
                  
                  <p className="text-lg text-white/70 mb-8">
                    {statusDisplay.description}
                  </p>

                  {/* Organization Info */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                    <div className="flex items-center gap-4 justify-center">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-white/60">Organization</p>
                        <h3 className="text-lg font-semibold text-white">{request.organization_name}</h3>
                      </div>
                    </div>
                  </div>

                  {/* Request Info */}
                  <div className="flex items-center justify-center gap-8 text-sm text-white/60">
                    <div>
                      <p className="mb-1">Role</p>
                      <div className="flex items-center gap-2 text-white font-medium">
                        <GraduationCap className="w-4 h-4" />
                        Faculty
                      </div>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div>
                      <p className="mb-1">Requested</p>
                      <p className="text-white font-medium">
                        {new Date(request.requested_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Approval Notes */}
                  {request.approval_notes && (
                    <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-xl text-left">
                      <p className="text-xs text-white/60 uppercase font-semibold mb-2">Admin Note</p>
                      <p className="text-white/80 italic">{request.approval_notes}</p>
                    </div>
                  )}

                  {/* Action Button */}
                  {request.approval_status === 'pending' && (
                    <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-sm text-blue-300">
                        <strong>Tip:</strong> This page updates automatically via Realtime. 
                        You&apos;ll be redirected immediately once approved!
                      </p>
                    </div>
                  )}

                  {request.approval_status === 'denied' && (
                    <div className="mt-8">
                      <p className="text-sm text-white/60 mb-4">
                        If you believe this is an error, please contact your organization administrator.
                      </p>
                      <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl font-semibold hover:scale-105 transition-all"
                      >
                        Return to Home
                      </Link>
                    </div>
                  )}
                </div>

                {/* Help Section */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">Need Help?</h3>
                  <p className="text-sm text-white/60">
                    Contact your organization administrator if you have questions about your approval status.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                <p className="text-white/60">No approval request found</p>
              </div>
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
