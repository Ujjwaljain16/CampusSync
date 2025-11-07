'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Organization, OrganizationContext as OrganizationContextType } from '@/types';
import { supabase } from '@/lib/supabase/client';

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user's organizations
  const fetchOrganizations = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCurrentOrganization(null);
        setOrganizations([]);
        return;
      }

      // Get user's role and organizations through user_roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('organization_id, role')
        .eq('user_id', user.id);

      if (rolesError) throw rolesError;

      if (!userRoles || userRoles.length === 0) {
        setCurrentOrganization(null);
        setOrganizations([]);
        return;
      }

      // Check if user is super_admin (organization_id will be null)
      const isSuperAdmin = userRoles.some((r: { role: string; organization_id: string | null }) => 
        r.role === 'super_admin'
      );

      // Super admins can see all organizations
      if (isSuperAdmin) {
        const { data: allOrgs, error: allOrgsError } = await supabase
          .from('organizations')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (allOrgsError) throw allOrgsError;

        const organizationsData = (allOrgs || []) as Organization[];
        setOrganizations(organizationsData);

        // Set current organization from localStorage or first organization
        const storedOrgId = typeof window !== 'undefined' 
          ? localStorage.getItem('currentOrganizationId')
          : null;
        
        if (storedOrgId && organizationsData?.find((o: Organization) => o.id === storedOrgId)) {
          setCurrentOrganization(organizationsData.find((o: Organization) => o.id === storedOrgId) || null);
        } else if (organizationsData && organizationsData.length > 0) {
          setCurrentOrganization(organizationsData[0]);
        }
        return;
      }

      // For non-super admins, get their specific organizations
      const orgIds = [...new Set(
        userRoles
          .map((r: { organization_id: string | null }) => r.organization_id)
          .filter((id): id is string => id !== null)
      )];

      if (orgIds.length === 0) {
        setCurrentOrganization(null);
        setOrganizations([]);
        return;
      }

      // Fetch organization details
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds)
        .eq('is_active', true);

      if (orgsError) throw orgsError;

      const organizationsData = (orgs || []) as Organization[];
      setOrganizations(organizationsData);

      // Set current organization from localStorage or first organization
      const storedOrgId = typeof window !== 'undefined' 
        ? localStorage.getItem('currentOrganizationId')
        : null;
      
      if (storedOrgId && organizationsData?.find((o: Organization) => o.id === storedOrgId)) {
        setCurrentOrganization(organizationsData.find((o: Organization) => o.id === storedOrgId) || organizationsData[0]);
      } else if (organizationsData && organizationsData.length > 0) {
        setCurrentOrganization(organizationsData[0]);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
      setCurrentOrganization(null);
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Switch organization
  const switchOrganization = useCallback(async (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrganization(org);
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentOrganizationId', orgId);
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
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', currentOrganization.id)
        .single();

      if (error) throw error;

      if (data) {
        const orgData = data as Organization;
        setCurrentOrganization(orgData);
        
        // Update in organizations array
        setOrganizations(orgs => 
          orgs.map(o => o.id === orgData.id ? orgData : o)
        );
      }
    } catch (error) {
      console.error('Error refreshing organization:', error);
    }
  }, [currentOrganization]);

  // Initialize on mount
  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        fetchOrganizations();
      } else if (event === 'SIGNED_OUT') {
        setCurrentOrganization(null);
        setOrganizations([]);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('currentOrganizationId');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchOrganizations]);

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

// Helper hook to check if user is org admin
export function useIsOrgAdmin() {
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { currentOrganization } = useOrganization();

  useEffect(() => {
    async function checkOrgAdmin() {
      if (!currentOrganization) {
        setIsOrgAdmin(false);
        setIsLoading(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsOrgAdmin(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('organization_id', currentOrganization.id)
          .single();

        if (error) throw error;

        const roleData = data as { role: string } | null;
        setIsOrgAdmin(
          roleData?.role === 'admin' || 
          roleData?.role === 'org_admin' || 
          roleData?.role === 'super_admin'
        );
      } catch (error) {
        console.error('Error checking org admin status:', error);
        setIsOrgAdmin(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkOrgAdmin();
  }, [currentOrganization]);

  return { isOrgAdmin, isLoading };
}

// Helper hook to check if user is super admin
export function useIsSuperAdmin() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkSuperAdmin() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsSuperAdmin(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super_admin')
          .maybeSingle();

        if (error) throw error;

        setIsSuperAdmin(!!data);
      } catch (error) {
        console.error('Error checking super admin status:', error);
        setIsSuperAdmin(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkSuperAdmin();
  }, []);

  return { isSuperAdmin, isLoading };
}
