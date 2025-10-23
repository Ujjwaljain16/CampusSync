/**
 * CredentiVault Button Components
 * Reusable button components using the cv-* design system
 */

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CVButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const CVButton = forwardRef<HTMLButtonElement, CVButtonProps>(
  (
    {
      className,
      variant = 'primary',
      loading = false,
      disabled,
      children,
      icon,
      iconPosition = 'right',
      ...props
    },
    ref
  ) => {
    const buttonClasses = cn(
      'cv-btn',
      {
        'cv-btn-primary': variant === 'primary',
        'cv-btn-secondary': variant === 'secondary',
        'cv-btn-ghost': variant === 'ghost',
        'opacity-60 cursor-not-allowed': disabled || loading,
      },
      className
    );

    const renderContent = () => {
      if (loading) {
        return (
          <>
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {children}
          </>
        );
      }

      if (icon) {
        return iconPosition === 'left' ? (
          <>
            {icon}
            {children}
          </>
        ) : (
          <>
            {children}
            {icon}
          </>
        );
      }

      return children;
    };

    return (
      <button
        ref={ref}
        className={buttonClasses}
        disabled={disabled || loading}
        {...props}
      >
        {renderContent()}
      </button>
    );
  }
);

CVButton.displayName = 'CVButton';
