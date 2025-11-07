'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { trackError } from '@/lib/errorMonitoring';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of crashing the whole app
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to monitoring service
    trackError(error, 'critical', {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });

    this.setState({
      error,
      errorInfo,
    });

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-red-950 to-slate-900 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full">
            <div className="bg-white/5 backdrop-blur-2xl border border-red-500/30 rounded-3xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-br from-red-500/20 to-red-500/10 border-b border-red-500/30 p-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">
                      Oops! Something went wrong
                    </h1>
                    <p className="text-red-300 text-sm mt-1">
                      We encountered an unexpected error
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-8 space-y-6">
                <p className="text-white/70 text-lg">
                  Don&apos;t worry, our team has been notified and is working on fixing this issue.
                  In the meantime, you can try one of the following options:
                </p>

                {/* Error Details (Development Only) */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <p className="text-red-300 font-semibold text-sm mb-2">
                      Error Details (Development Only):
                    </p>
                    <pre className="text-xs text-red-200 overflow-auto max-h-40 whitespace-pre-wrap">
                      {this.state.error.toString()}
                      {this.state.errorInfo?.componentStack && (
                        <>
                          {'\n\nComponent Stack:\n'}
                          {this.state.errorInfo.componentStack}
                        </>
                      )}
                    </pre>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={this.handleReset}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/25"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Try Again
                  </button>

                  <button
                    onClick={this.handleReload}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl border border-white/20 hover:border-white/30 transition-all duration-300"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Reload Page
                  </button>

                  <button
                    onClick={this.handleGoHome}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl border border-white/20 hover:border-white/30 transition-all duration-300"
                  >
                    <Home className="w-5 h-5" />
                    Go Home
                  </button>
                </div>

                {/* Help Text */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <p className="text-blue-200 text-sm">
                    <span className="font-semibold">Need help?</span> If this problem persists, please contact our support team at{' '}
                    <a
                      href="mailto:support@campussync.com"
                      className="underline hover:text-blue-100"
                    >
                      support@campussync.com
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
