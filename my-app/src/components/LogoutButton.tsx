'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface LogoutButtonProps {
  className?: string;
  variant?: 'default' | 'minimal' | 'danger';
}

export default function LogoutButton({ className = '', variant = 'default' }: LogoutButtonProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    
    setLoggingOut(true);
    try {
      // Clear client session first to avoid refresh token errors
      try { await supabase.auth.signOut(); } catch { /* ignore error */ }

      // Call the logout API to clear server cookies/session
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      // Force a full page reload to clear all client-side state
      window.location.href = '/login';
    } catch {
      // Even if the API call fails, redirect to login
      window.location.href = '/login';
    } finally {
      setLoggingOut(false);
    }
  };

  const baseClasses = "flex items-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variantClasses = {
    default: "px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium",
    minimal: "px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm",
    danger: "px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg font-medium"
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loggingOut}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      title="Sign out of your account"
    >
      <LogOut className={`w-4 h-4 ${loggingOut ? 'animate-pulse' : ''}`} />
      {loggingOut ? 'Signing out...' : 'Sign Out'}
    </button>
  );
}

