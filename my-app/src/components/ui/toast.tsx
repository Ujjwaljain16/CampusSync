'use client';

import * as React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toast Notification System
 * Provides user feedback for actions and errors
 */

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  onClose?: () => void;
}

interface ToastContextValue {
  toasts: ToastProps[];
  showToast: (toast: Omit<ToastProps, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastProps[]>([]);

  const showToast = React.useCallback((toast: Omit<ToastProps, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    
    setToasts((prev) => [...prev, newToast]);

    // Auto dismiss after duration (default 5 seconds)
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Initialize the global toast callback
  React.useEffect(() => {
    setToastCallback(showToast);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastProps[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-0 right-0 z-[9999] flex flex-col gap-2 p-4 pointer-events-none max-w-md w-full">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={() => toast.id && onDismiss(toast.id)} />
      ))}
    </div>
  );
}

const variantStyles: Record<ToastVariant, string> = {
  default: 'bg-gray-800 border-gray-700 text-white',
  success: 'bg-green-500/10 border-green-500/30 text-green-300',
  error: 'bg-red-500/10 border-red-500/30 text-red-300',
  warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
};

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  default: null,
  success: <CheckCircle className="w-5 h-5 text-green-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
  info: <Info className="w-5 h-5 text-blue-400" />,
};

function Toast({ title, description, variant = 'default', onClose }: ToastProps) {
  return (
    <div
      className={cn(
        'pointer-events-auto w-full rounded-xl border p-4 shadow-lg backdrop-blur-xl animate-in slide-in-from-top-2 fade-in duration-300',
        variantStyles[variant]
      )}
    >
      <div className="flex items-start gap-3">
        {variantIcons[variant] && (
          <div className="flex-shrink-0 mt-0.5">{variantIcons[variant]}</div>
        )}
        <div className="flex-1 space-y-1">
          {title && (
            <p className="font-semibold text-sm leading-none">{title}</p>
          )}
          {description && (
            <p className="text-sm opacity-90">{description}</p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-lg p-1 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Helper function to show toast notifications
 * Can be used without the hook in non-component contexts
 */
let toastCallback: ((toast: Omit<ToastProps, 'id'>) => void) | null = null;

export function setToastCallback(callback: (toast: Omit<ToastProps, 'id'>) => void) {
  toastCallback = callback;
}

export function toast(options: Omit<ToastProps, 'id'>) {
  if (toastCallback) {
    toastCallback(options);
  } else {
    console.warn('Toast system not initialized. Wrap your app with ToastProvider.');
    console.log('[Toast]', options.title, options.description);
  }
}

// Convenience methods
toast.success = (title: string, description?: string) => {
  toast({ title, description, variant: 'success' });
};

toast.error = (title: string, description?: string) => {
  toast({ title, description, variant: 'error' });
};

toast.warning = (title: string, description?: string) => {
  toast({ title, description, variant: 'warning' });
};

toast.info = (title: string, description?: string) => {
  toast({ title, description, variant: 'info' });
};
