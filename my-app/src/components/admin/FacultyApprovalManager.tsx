/**
 * Faculty Approval Management Component
 * 
 * Admin interface to view and approve/deny pending faculty requests
 * Features Supabase Realtime for instant updates
 */

'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, UserCheck, AlertCircle, Wifi, WifiOff, Mail, GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface PendingFacultyRequest {
  user_id: string;
  organization_id: string;
  role: string;
  approval_status: string;
  created_at: string;
  profiles: {
    email: string;
    full_name: string;
    university?: string;
    major?: string;
  };
  organizations: {
    name: string;
    slug: string;
  };
}

export default function FacultyApprovalManager() {
  const [requests, setRequests] = useState<PendingFacultyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch pending faculty requests
  const fetchRequests = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/faculty-approvals');
      if (!res.ok) {
        throw new Error('Failed to fetch faculty requests');
      }
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  // Setup Realtime subscription
  useEffect(() => {
    fetchRequests();

    console.log('[INFO] Setting up Supabase Realtime for faculty approvals');

    const supabase = createClient();
    
    // Subscribe to user_roles table changes for faculty approvals
    const channel: RealtimeChannel = supabase
      .channel('faculty-approvals-admin')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE
          schema: 'public',
          table: 'user_roles',
          filter: `role=eq.faculty` // Only faculty roles
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[SUCCESS] Realtime faculty approval update:', payload);
          
          // Refresh the list
          fetchRequests();
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

    return () => {
      console.log('Cleaning up Supabase Realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [fetchRequests]);

  // Handle approval/denial
  const handleDecision = async (userId: string, status: 'approved' | 'denied', notes?: string) => {
    setProcessing(userId);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/admin/faculty-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          status,
          notes
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to process request');
      }

      setSuccessMessage(`Faculty request ${status} successfully!`);
      
      // Remove from list
      setRequests(prev => prev.filter(r => r.user_id !== userId));

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to process request:', err);
      setError(err instanceof Error ? err.message : 'Failed to process request');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Faculty Approvals</h2>
            <p className="text-white/60 text-sm">Review and approve pending faculty requests</p>
          </div>
        </div>

        {/* Realtime Status */}
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
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm animate-in slide-in-from-top-2 fade-in">
          [Success] {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm animate-in slide-in-from-top-2 fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          <div className="inline-flex items-center gap-3 text-white/60">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading pending requests...</span>
          </div>
        </div>
      ) : requests.length === 0 ? (
        // Empty State
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">All Caught Up!</h3>
          <p className="text-white/60">No pending faculty approvals at the moment</p>
        </div>
      ) : (
        // Requests List
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Pending Requests</h3>
              <span className="px-3 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm font-medium text-yellow-300">
                {requests.length} {requests.length === 1 ? 'Request' : 'Requests'}
              </span>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {requests.map((request) => (
              <div
                key={request.user_id}
                className="p-6 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-6">
                  {/* Faculty Info */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-semibold">
                        {request.profiles.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-white">
                          {request.profiles.full_name}
                        </h4>
                        <div className="flex items-center gap-2 text-sm text-white/60">
                          <Mail className="w-3.5 h-3.5" />
                          {request.profiles.email}
                        </div>
                      </div>
                    </div>

                    {/* Additional Info */}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {request.profiles.university && (
                        <div className="flex items-center gap-2 text-white/60">
                          <GraduationCap className="w-4 h-4" />
                          {request.profiles.university}
                        </div>
                      )}
                      {request.profiles.major && (
                        <div className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white/60">
                          {request.profiles.major}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-white/60">
                        <Clock className="w-4 h-4" />
                        Requested {new Date(request.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Organization */}
                    <div className="text-sm text-white/60">
                      Organization: <span className="text-white font-medium">{request.organizations.name}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleDecision(request.user_id, 'approved')}
                      disabled={processing === request.user_id}
                      className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl hover:bg-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleDecision(request.user_id, 'denied', 'Request denied by administrator')}
                      disabled={processing === request.user_id}
                      className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                    >
                      <XCircle className="w-4 h-4" />
                      Deny
                    </button>
                  </div>
                </div>

                {/* Processing Indicator */}
                {processing === request.user_id && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-blue-300">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
