import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  gradient?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
  gradient = true,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon && (
            <div className="flex-shrink-0 p-3 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 rounded-2xl backdrop-blur-sm border border-white/10">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1
              className={cn(
                "text-3xl md:text-4xl font-bold",
                gradient
                  ? "bg-gradient-to-r from-white via-blue-200 to-emerald-200 bg-clip-text text-transparent"
                  : "text-white"
              )}
            >
              {title}
            </h1>
            {description && (
              <p className="text-white/70 text-base md:text-lg mt-1">{description}</p>
            )}
          </div>
        </div>
        
        {actions && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
      
      {children && (
        <div className="mt-6">
          {children}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
