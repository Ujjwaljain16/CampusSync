/**
 * Organization Guard Hook
 * 
 * Frontend defense layer for cross-tenant data protection.
 * Validates that all data displayed belongs to the user's organization.
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseClient';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface OrganizationContext {
  userId: string;
  organizationId: string | null;
  role: string;
  isSuperAdmin: boolean;
}

interface UseOrganizationGuardReturn {
  orgContext: OrganizationContext | null;
  loading: boolean;
  error: string | null;
  validateData: <T extends { organization_id?: string }>(data: T[]) => T[];
  refreshContext: () => Promise<void>;
}

/**
 * Hook to provide organization context and data validation.
 * 
 * Usage:
 * ```tsx
 * const { orgContext, loading, validateData } = useOrganizationGuard();
 * 
 * useEffect(() => {
 *   if (!loading && orgContext) {
 *     fetchCertificates().then(data => {
 *       // Always validate data from API
 *       setC ertificates(validateData(data.certificates));
 *     });
 *   }
 * }, [orgContext, loading]);
 * ```
 */
export function useOrganizationGuard(): UseOrganizationGuardReturn {
  const [user, setUser] = useState<User | null>(null);
  const [orgContext, setOrgContext] = useState<OrganizationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch organization context from API
   */
  const fetchOrgContext = useCallback(async () => {
    if (!user) {
      setOrgContext(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/v2/user/organization-context');
      
      if (!res.ok) {
        throw new Error(`Failed to fetch organization context: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      setOrgContext(data);
      
      console.log('[ORG_GUARD] Context loaded:', {
        organizationId: data.organizationId,
        role: data.role,
        isSuperAdmin: data.isSuperAdmin
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[ORG_GUARD] Error fetching context:', errorMessage);
      setError(errorMessage);
      setOrgContext(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Get current user from Supabase
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    
    supabase.auth.getUser().then(({ data: { user: authUser } }: { data: { user: User | null } }) => {
      setUser(authUser);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Fetch context on mount and when user changes
   */
  useEffect(() => {
    fetchOrgContext();
  }, [fetchOrgContext]);

  /**
   * Validate data against organization context.
   * 
   * This is a CRITICAL security layer that prevents cross-tenant data leakage
   * even if API/RLS policies fail.
   * 
   * @param data - Array of data items to validate
   * @returns Filtered array containing only items from user's organization
   */
  const validateData = <T extends { organization_id?: string }>(data: T[]): T[] => {
    if (!orgContext || !data) {
      console.warn('[ORG_GUARD] Cannot validate data: missing context or data');
      return [];
    }
    
    // Super admins see all data
    if (orgContext.isSuperAdmin) {
      console.log('[ORG_GUARD] Super admin - no filtering applied');
      return data;
    }

    // Filter out any data not matching user's organization
    const filtered = data.filter(item => 
      item.organization_id === orgContext.organizationId
    );

    // Log security warning if data was filtered
    if (filtered.length !== data.length) {
      const removedCount = data.length - filtered.length;
      
      console.warn(
        `[ORG_GUARD] [WARNING] SECURITY: Frontend filtering prevented cross-tenant data leakage!`,
        `\n  - User Org: ${orgContext.organizationId}`,
        `\n  - Total items received: ${data.length}`,
        `\n  - Items after filtering: ${filtered.length}`,
        `\n  - Items removed: ${removedCount}`
      );

      // Alert security team in production
      if (process.env.NODE_ENV === 'production') {
        fetch('/api/v2/security/alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'frontend_data_filtering',
            severity: 'high',
            user_id: orgContext.userId,
            organization_id: orgContext.organizationId,
            received_count: data.length,
            filtered_count: filtered.length,
            removed_count: removedCount,
            timestamp: new Date().toISOString(),
            user_agent: navigator.userAgent
          })
        }).catch(err => {
          console.error('[ORG_GUARD] Failed to send security alert:', err);
        });
      }
    }

    return filtered;
  };

  return {
    orgContext,
    loading,
    error,
    validateData,
    refreshContext: fetchOrgContext
  };
}

/**
 * Higher-order component to protect routes with organization guard.
 * 
 * Usage:
 * ```tsx
 * export default withOrganizationGuard(CertificateList);
 * ```
 */
export function withOrganizationGuard<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return function ProtectedComponent(props: P) {
    const { orgContext, loading, error } = useOrganizationGuard();

    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-white/60">Loading organization context...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md">
            <h2 className="text-red-400 text-lg font-semibold mb-2">
              Organization Context Error
            </h2>
            <p className="text-red-200/80 text-sm mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-100 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    if (!orgContext) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 max-w-md">
            <h2 className="text-yellow-400 text-lg font-semibold mb-2">
              No Organization Context
            </h2>
            <p className="text-yellow-200/80 text-sm">
              Unable to determine your organization context. Please contact support.
            </p>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
