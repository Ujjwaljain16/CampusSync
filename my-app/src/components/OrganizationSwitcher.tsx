/**
 * Organization Switcher Component
 * 
 * Allows recruiters and admins to switch between multiple organizations they have access to.
 * Automatically includes selected organization in all API requests via X-Organization-ID header.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Building2, ChevronDown, CheckCircle } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { setSelectedOrganizationId, getSelectedOrganizationId } from '@/lib/apiClient';

export default function OrganizationSwitcher() {
  const { currentOrganization, organizations, switchOrganization, isLoading } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);

  // Sync localStorage with context on mount
  useEffect(() => {
    if (currentOrganization && !isLoading) {
      const storedOrgId = getSelectedOrganizationId();
      
      // If no org is stored, or stored org doesn't match current, update localStorage
      if (!storedOrgId || storedOrgId !== currentOrganization.id) {
        setSelectedOrganizationId(currentOrganization.id);
      }
    }
  }, [currentOrganization, isLoading]);

  // Don't show if user only has access to 1 organization
  if (organizations.length <= 1) {
    return null;
  }

  const handleSwitch = async (orgId: string) => {
    if (orgId === currentOrganization?.id) {
      setIsOpen(false);
      return;
    }

    try {
      // Update localStorage first
      setSelectedOrganizationId(orgId);
      
      // Switch organization (will trigger page reload)
      await switchOrganization(orgId);
      
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch organization:', error);
      
      // Revert localStorage on error
      if (currentOrganization) {
        setSelectedOrganizationId(currentOrganization.id);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="relative">
        <div className="flex items-center gap-3 px-4 py-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl animate-pulse">
          <Building2 className="w-5 h-5 text-white/40" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-white/10 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Selected Organization Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 hover:border-white/20 rounded-xl transition-all duration-200 min-w-[240px] group"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 bg-blue-500/20 rounded-lg group-hover:bg-blue-500/30 transition-colors">
            <Building2 className="w-5 h-5 text-blue-300" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-xs text-white/50 font-medium uppercase tracking-wider">
              Organization
            </p>
            <p className="text-sm font-semibold text-white truncate">
              {currentOrganization?.name || 'Select Organization'}
            </p>
          </div>
        </div>
        <ChevronDown 
          className={`w-4 h-4 text-white/70 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-2">
              <p className="px-3 py-2 text-xs font-semibold text-white/50 uppercase tracking-wider">
                Switch Organization
              </p>
              
              {organizations.map((org) => {
                const isSelected = org.id === currentOrganization?.id;
                
                return (
                  <button
                    key={org.id}
                    onClick={() => handleSwitch(org.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-300 cursor-default'
                        : 'hover:bg-white/5 text-white/90 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Building2 className={`w-4 h-4 flex-shrink-0 ${
                        isSelected ? 'text-blue-400' : 'text-white/50'
                      }`} />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium truncate">
                          {org.name}
                        </p>
                        {org.type && (
                          <p className="text-xs text-white/40 capitalize">
                            {org.type}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {isSelected && (
                      <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
