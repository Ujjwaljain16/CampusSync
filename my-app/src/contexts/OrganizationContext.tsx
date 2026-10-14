'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Organization, OrganizationContext as OrganizationContextType } from '@/types';
import { onAuthEvent } from '@/lib/authEvents';

/**
 * Organizations of the signed-in user.
 *
 * The session lives in HttpOnly cookies, so there is no browser auth client and no auth-state listener:
 * everything comes from the server's API routes, which read the cookies. The list is reloaded
 *  - on mount,
 *  - when the window regains focus (at most once per FOCUS_REFRESH_MS),
 *  - after a login / logout event (see src/lib/authEvents.ts, also delivered from other tabs).
 */

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const FOCUS_REFRESH_MS = 30_000;
const SELECTION_KEYS = ['currentOrganizationId', 'selectedOrganizationId'];

async function getJson<T>(url: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return { status: res.status, body: null };
  try {
    return { status: res.status, body: (await res.json()) as T };
  } catch {
    return { status: res.status, body: null };
  }
}

function readStoredOrgId(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem('currentOrganizationId') : null;
  } catch {
    return null;
  }
}

function clearStoredSelection() {
  try {
    SELECTION_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable
  }
}

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Id of the user whose organizations are currently loaded (a different user must not inherit the selection)
  const loadedUserIdRef = useRef<string | null>(null);
  const lastLoadAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  const clearState = useCallback(() => {
    loadedUserIdRef.current = null;
    setCurrentOrganization(null);
    setOrganizations([]);
  }, []);

  // Fetch the user's organizations from the API
  const fetchOrganizations = useCallback(async () => {
    if (inFlightRef.current) {
      pendingRef.current = true; // run once more when the current load ends
      return;
    }
    inFlightRef.current = true;
    try {
      const me = await getJson<{ user_id?: string; role?: string | null }>('/api/auth/me');
      lastLoadAtRef.current = Date.now();

      if (me.status === 401) {
        // Signed out (or the session expired)
        clearState();
        clearStoredSelection();
        return;
      }
      if (!me.body?.user_id) {
        throw new Error('Could not load the current user');
      }

      const userId = me.body.user_id;
      const sameUser = loadedUserIdRef.current === userId;

      let list: Organization[] = [];
      if (me.body.role === 'super_admin') {
        // Super admins can see every active organization
        const res = await getJson<{ data?: Organization[] }>('/api/v2/admin/super/organizations');
        if (!res.body) throw new Error('Could not load organizations');
        const rows = res.body.data ?? [];
        list = rows.filter((o) => o.is_active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      } else {
        const res = await getJson<{ data?: { organizations?: Organization[] } }>('/api/organizations');
        if (!res.body) throw new Error('Could not load organizations');
        list = res.body.data?.organizations ?? [];
      }

      loadedUserIdRef.current = userId;
      setOrganizations(list);
      setCurrentOrganization((prev) => {
        // keep the current selection across silent refreshes of the same user
        const kept = sameUser && prev ? list.find((o) => o.id === prev.id) : undefined;
        if (kept) return kept;
        const storedId = readStoredOrgId();
        return (storedId ? list.find((o) => o.id === storedId) : undefined) ?? list[0] ?? null;
      });
    } catch (error) {
      // keep whatever was loaded before; a later focus / login event retries
      console.error('Error fetching organizations:', error);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
      if (pendingRef.current) {
        pendingRef.current = false;
        void fetchOrganizations();
      }
    }
  }, [clearState]);

  // Switch organization
  const switchOrganization = useCallback(async (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrganization(org);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('currentOrganizationId', orgId);
        } catch {
          // storage unavailable
        }
      }

      // Trigger a page reload to update organization context throughout the app
      // In a production app, you might want to use a more sophisticated approach
      // like updating all queries with the new organization context
      window.location.reload();
    }
  }, [organizations]);

  // Refresh current organization data
  const refreshOrganization = useCallback(async () => {
    if (!currentOrganization) return;

    try {
      const res = await getJson<{ data?: { organization?: Partial<Organization> } }>(
        `/api/organizations/${encodeURIComponent(currentOrganization.id)}`
      );
      const fresh = res.body?.data?.organization;
      if (!fresh) throw new Error('Could not refresh organization');

      const orgData = { ...currentOrganization, ...fresh } as Organization;
      setCurrentOrganization(orgData);

      // Update in organizations array
      setOrganizations(orgs =>
        orgs.map(o => o.id === orgData.id ? orgData : o)
      );
    } catch (error) {
      console.error('Error refreshing organization:', error);
    }
  }, [currentOrganization]);

  // Initialize on mount
  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // Re-check when the user comes back to the tab (a login/logout may have happened elsewhere)
  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastLoadAtRef.current < FOCUS_REFRESH_MS) return;
      void fetchOrganizations();
    };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [fetchOrganizations]);

  // Login / logout announced by this tab or another one
  useEffect(() => {
    return onAuthEvent((kind) => {
      if (kind === 'logout') {
        clearState();
        clearStoredSelection();
      } else {
        void fetchOrganizations();
      }
    });
  }, [fetchOrganizations, clearState]);

  const value: OrganizationContextType = {
    currentOrganization,
    organizations,
    switchOrganization,
    refreshOrganization,
    isLoading,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
