/**
 * Error Monitoring and Logging System
 * Tracks errors, performance issues, and user actions
 */

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorLog {
  id: string;
  timestamp: string;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  userId?: string;
  url?: string;
  userAgent?: string;
}

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

class ErrorMonitoring {
  private static instance: ErrorMonitoring;
  private errors: ErrorLog[] = [];
  private maxErrors = 1000; // Keep last 1000 errors in memory
  private isProduction = process.env.NODE_ENV === 'production';

  private constructor() {
    // Initialize error monitoring
    if (typeof window !== 'undefined') {
      this.setupGlobalErrorHandlers();
    }
  }

  static getInstance(): ErrorMonitoring {
    if (!ErrorMonitoring.instance) {
      ErrorMonitoring.instance = new ErrorMonitoring();
    }
    return ErrorMonitoring.instance;
  }

  /**
   * Setup global error handlers for browser
   */
  private setupGlobalErrorHandlers(): void {
    // Catch unhandled errors
    window.addEventListener('error', (event) => {
      this.logError({
        severity: 'high',
        message: event.message,
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        severity: 'high',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        context: {
          promise: event.promise,
        },
      });
    });
  }

  /**
   * Log an error
   */
  logError(params: {
    severity: ErrorSeverity;
    message: string;
    stack?: string;
    context?: Record<string, unknown>;
    userId?: string;
  }): void {
    const errorLog: ErrorLog = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      severity: params.severity,
      message: params.message,
      stack: params.stack,
      context: params.context,
      userId: params.userId,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    // Add to memory store
    this.errors.push(errorLog);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift(); // Remove oldest
    }

    // Console log in development
    if (!this.isProduction) {
      console.error(`[${params.severity.toUpperCase()}]`, params.message, {
        stack: params.stack,
        context: params.context,
      });
    }

    // In production, you could send to external service like Sentry
    if (this.isProduction && params.severity === 'critical') {
      this.sendToExternalService(errorLog);
    }
  }

  /**
   * Log performance metric
   */
  logPerformance(metric: PerformanceMetric): void {
    if (!this.isProduction) {
      console.log(`[PERFORMANCE] ${metric.name}: ${metric.duration.toFixed(2)}ms`, metric.metadata);
    }

    // In production, send to analytics service
    if (this.isProduction) {
      // Send to analytics service like Google Analytics, Mixpanel, etc.
    }
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 50): ErrorLog[] {
    return this.errors.slice(-limit);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): ErrorLog[] {
    return this.errors.filter((err) => err.severity === severity);
  }

  /**
   * Clear all errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Send error to external monitoring service
   */
  private async sendToExternalService(errorLog: ErrorLog): Promise<void> {
    // Placeholder for Sentry, DataDog, or other monitoring service
    // In production, uncomment and configure:
    /*
    await fetch('/api/monitoring/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorLog),
    });
    */
    
    // Prevent unused variable warning in development
    void errorLog;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const errorMonitoring = ErrorMonitoring.getInstance();

/**
 * Performance tracking utility
 */
export class PerformanceTracker {
  private startTime: number;
  private name: string;

  constructor(name: string) {
    this.name = name;
    this.startTime = performance.now();
  }

  /**
   * End tracking and log result
   */
  end(metadata?: Record<string, unknown>): void {
    const duration = performance.now() - this.startTime;
    errorMonitoring.logPerformance({
      name: this.name,
      duration,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }
}

/**
 * Utility functions
 */
export function trackError(error: Error, severity: ErrorSeverity = 'medium', context?: Record<string, unknown>): void {
  errorMonitoring.logError({
    severity,
    message: error.message,
    stack: error.stack,
    context,
  });
}

export function trackPerformance(name: string): PerformanceTracker {
  return new PerformanceTracker(name);
}

/**
 * HOC for error boundary tracking
 */
export function withErrorTracking<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context?: Record<string, unknown>
): T {
  return ((...args: unknown[]) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((error) => {
          trackError(error, 'high', { ...context, args });
          throw error;
        });
      }
      return result;
    } catch (error) {
      if (error instanceof Error) {
        trackError(error, 'high', { ...context, args });
      }
      throw error;
    }
  }) as T;
}
