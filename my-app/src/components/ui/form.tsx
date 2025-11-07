/**
 * CampusSync Form Components
 * Reusable form components using the cv-* design system
 */

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Form Field Wrapper
export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('space-y-3', className)} {...props}>
        {children}
      </div>
    );
  }
);
FormField.displayName = 'FormField';

// Form Label
export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const FormLabel = forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ className, children, required, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn('cv-form-label', className)}
        {...props}
      >
        {children}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
    );
  }
);
FormLabel.displayName = 'FormLabel';

// Input Wrapper (for inputs with icons)
export interface InputWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const InputWrapper = forwardRef<HTMLDivElement, InputWrapperProps>(
  ({ className, icon, children, ...props }, ref) => {
    // Clone the icon element and add w-5 h-5 classes to ensure proper sizing
    const iconElement = icon && React.isValidElement(icon)
      ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
          className: cn((icon as React.ReactElement<{ className?: string }>).props?.className, 'w-5 h-5')
        })
      : icon;

    return (
      <div ref={ref} className={cn('cv-input-wrapper', className)} {...props}>
        {iconElement && <div className="cv-input-icon">{iconElement}</div>}
        {children}
      </div>
    );
  }
);
InputWrapper.displayName = 'InputWrapper';

// Form Input
export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: React.ReactNode;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ className, error, icon, type = 'text', ...props }, ref) => {
    const inputClasses = cn(
      'cv-form-input cv-input-focus-ring',
      error && 'border-red-300 focus:border-red-500',
      className,
      icon && '!pl-14' // Use !pl-14 (56px) with !important to ensure it's applied
    );

    if (icon) {
      return (
        <InputWrapper icon={icon}>
          <input
            ref={ref}
            type={type}
            className={inputClasses}
            {...props}
          />
        </InputWrapper>
      );
    }

    return (
      <input
        ref={ref}
        type={type}
        className={inputClasses}
        {...props}
      />
    );
  }
);
FormInput.displayName = 'FormInput';

// Form Error Message
export interface FormErrorProps extends React.HTMLAttributes<HTMLParagraphElement> {
  icon?: React.ReactNode;
}

export const FormError = forwardRef<HTMLParagraphElement, FormErrorProps>(
  ({ className, children, icon, ...props }, ref) => {
    if (!children) return null;

    return (
      <p
        ref={ref}
        className={cn('text-red-300 text-sm mt-1 flex items-center gap-1', className)}
        role="alert"
        {...props}
      >
        {icon}
        {children}
      </p>
    );
  }
);
FormError.displayName = 'FormError';

// Form Helper Text
export type FormHelperProps = React.HTMLAttributes<HTMLParagraphElement>;

export const FormHelper = forwardRef<HTMLParagraphElement, FormHelperProps>(
  ({ className, children, ...props }, ref) => {
    if (!children) return null;

    return (
      <p
        ref={ref}
        className={cn('text-xs text-white/60 mt-1', className)}
        {...props}
      >
        {children}
      </p>
    );
  }
);
FormHelper.displayName = 'FormHelper';
