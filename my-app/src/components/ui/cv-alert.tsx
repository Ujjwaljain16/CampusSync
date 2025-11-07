/**
 * CampusSync Alert Components
 * Reusable alert components for displaying messages
 */

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export interface CVAlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  icon?: React.ReactNode;
  showIcon?: boolean;
}

const variantStyles = {
  error: 'bg-red-100/90 border-red-300 text-red-700',
  success: 'bg-green-100/90 border-green-300 text-green-700',
  warning: 'bg-yellow-100/90 border-yellow-300 text-yellow-700',
  info: 'bg-blue-100/90 border-blue-300 text-blue-700',
};

const defaultIcons = {
  error: <AlertCircle className="w-5 h-5 text-red-600" />,
  success: <CheckCircle className="w-5 h-5 text-green-600" />,
  warning: <AlertCircle className="w-5 h-5 text-yellow-600" />,
  info: <Info className="w-5 h-5 text-blue-600" />,
};

export const CVAlert = forwardRef<HTMLDivElement, CVAlertProps>(
  (
    {
      className,
      variant = 'info',
      title,
      icon,
      showIcon = true,
      children,
      ...props
    },
    ref
  ) => {
    const alertIcon = icon || (showIcon ? defaultIcons[variant] : null);

    return (
      <div
        ref={ref}
        className={cn(
          'p-4 border rounded-xl',
          variantStyles[variant],
          className
        )}
        role="alert"
        aria-live="polite"
        {...props}
      >
        <div className="flex items-start gap-3">
          {alertIcon && <div className="flex-shrink-0 mt-0.5">{alertIcon}</div>}
          <div className="flex-1">
            {title && (
              <h4 className="font-semibold mb-1">{title}</h4>
            )}
            <div className="text-sm font-medium">{children}</div>
          </div>
        </div>
      </div>
    );
  }
);

CVAlert.displayName = 'CVAlert';
