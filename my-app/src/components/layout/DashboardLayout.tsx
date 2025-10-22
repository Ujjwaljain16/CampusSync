import React from 'react';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
}

export function DashboardLayout({ children, sidebar, header, className }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {header && (
        <div className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
          {header}
        </div>
      )}
      
      <div className="flex">
        {sidebar && (
          <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r border-white/10 bg-white/5 backdrop-blur-sm">
            {sidebar}
          </aside>
        )}
        
        <main className={cn("flex-1 px-4 py-8 sm:px-6 lg:px-8", className)}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
