/**
 * CampusSync Badge Components
 * Reusable badge components using the cv-* design system
 */

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CVBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'verified' | 'pending' | 'rejected' | 'default';
  icon?: React.ReactNode;
}

export const CVBadge = forwardRef<HTMLSpanElement, CVBadgeProps>(
  ({ className, variant = 'default', icon, children, ...props }, ref) => {
    const badgeClasses = cn(
      'cv-badge',
      {
        'cv-badge-verified': variant === 'verified',
        'cv-badge-pending': variant === 'pending',
        'cv-badge-rejected': variant === 'rejected',
      },
      className
    );

    return (
      <span ref={ref} className={badgeClasses} {...props}>
        {icon}
        {children}
      </span>
    );
  }
);

CVBadge.displayName = 'CVBadge';
