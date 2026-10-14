/**
 * Production-ready logger utility
 * Replaces console.log statements with conditional logging
 * Integrates with monitoring services in production
 */

import { reportError } from '@/lib/alerts';

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

interface LogContext {
  [key: string]: unknown;
}

// Guards against recursion: if anything under reportError logs an error again, that inner
// call is logged to the console as usual but not forwarded a second time.
let forwarding = false;

function forwardToAlerts(message: string, error: unknown, context?: LogContext) {
  if (forwarding) return;
  forwarding = true;
  try {
    const ctx = context ?? {};
    reportError(error, {
      logMessage: message,
      route: typeof ctx.route === 'string' ? ctx.route : typeof ctx.path === 'string' ? ctx.path : undefined,
      requestId: typeof ctx.requestId === 'string' ? ctx.requestId : undefined,
      status: typeof ctx.status === 'number' ? ctx.status : undefined,
    });
  } catch {
    // alerting must never affect the caller
  } finally {
    forwarding = false;
  }
}

class Logger {
  /**
   * Debug logs - only in development
   * Use for detailed debugging information
   */
  debug(message: string, context?: LogContext) {
    if (isDev) {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  /**
   * Info logs - development only
   * Use for general information
   */
  log(message: string, context?: LogContext) {
    if (isDev) {
      console.log(`[INFO] ${message}`, context || '');
    }
  }

  /**
   * Warning logs - development only
   * Use for non-critical issues
   */
  warn(message: string, context?: LogContext) {
    if (isDev) {
      console.warn(`[WARN] ${message}`, context || '');
    }
  }

  /**
   * Error logs - ALWAYS logged
   * Also raises a throttled webhook alert when ALERT_WEBHOOK_URL is set (see src/lib/alerts.ts)
   */
  error(message: string, error?: Error | unknown, context?: LogContext) {
    // Always log errors to console
    console.error(`[ERROR] ${message}`, {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
      context,
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
    });

    // Raise a throttled, redacted webhook alert (no-op unless ALERT_WEBHOOK_URL is set)
    forwardToAlerts(message, error, context);

    // Send to monitoring service in production
    if (!isDev && !isTest) {
      this.sendToMonitoring('error', message, error, context);
    }
  }

  /**
   * Success logs - development only
   * Use for successful operations
   */
  success(message: string, context?: LogContext) {
    if (isDev) {
      console.log(`[SUCCESS] ${message}`, context || '');
    }
  }

  /**
   * HTTP request logs - development only
   * Use for API request/response logging
   */
  http(method: string, path: string, statusCode: number, duration: number) {
    if (isDev) {
      const statusIndicator = statusCode < 300 ? 'OK' : statusCode < 400 ? 'REDIRECT' : statusCode < 500 ? 'WARN' : 'ERROR';
      console.log(`[HTTP:${statusIndicator}] ${method} ${path} - ${statusCode} (${duration}ms)`);
    }
  }

  /**
   * Security logs - ALWAYS logged
   * Use for security-related events
   */
  security(message: string, context?: LogContext) {
    console.warn(`[SECURITY] ${message}`, context || '');

    // Always send security events to monitoring
    if (!isTest) {
      this.sendToMonitoring('security', message, null, context);
    }
  }

  /**
   * Performance logs - development only
   * Use for timing and performance measurements
   */
  perf(operation: string, duration: number, context?: LogContext) {
    if (isDev) {
      const perfIndicator = duration < 100 ? 'FAST' : duration < 500 ? 'SLOW' : 'VERY_SLOW';
      console.log(`[PERF:${perfIndicator}] ${operation} - ${duration}ms`, context || '');
    }
  }

  /**
   * Send logs to monitoring service (Sentry, DataDog, etc.)
   * Implement based on your monitoring service
   */
  private sendToMonitoring(
    level: string,
    message: string,
    error?: Error | unknown,
    context?: LogContext
  ) {
    // Optional extra sink (Sentry, DataDog, ...). Webhook alerting for errors is handled by
    // forwardToAlerts above and does not depend on ENABLE_MONITORING.
    // Enable with ENABLE_MONITORING=true environment variable
    // Example Sentry integration:
    // import * as Sentry from '@sentry/nextjs';
    // Sentry.captureException(error || new Error(message), {
    //   level, contexts: { custom: context }
    // });
    if (process.env.ENABLE_MONITORING === 'true') {
      // TODO (Optional): Implement your preferred monitoring service integration
      // Prevents unused parameter warnings while keeping the interface
      void level;
      void message;
      void error;
      void context;
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for creating child loggers
export { Logger };

// Convenience exports
export const log = logger.log.bind(logger);
export const debug = logger.debug.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
export const success = logger.success.bind(logger);

/**
 * Usage Examples:
 * 
 * // Basic logging
 * import { logger } from '@/lib/logger';
 * 
 * logger.log('User logged in', { userId: '123' });
 * logger.error('Failed to save', error, { userId: '123' });
 * logger.perf('Database query', 45);
 * 
 * // Child logger with persistent context
 * const requestLogger = logger.child({ requestId: '123', userId: 'abc' });
 * requestLogger.log('Processing request');
 * requestLogger.error('Request failed', error);
 * 
 * // HTTP logging
 * logger.http('POST', '/api/certificates', 201, 125);
 * 
 * // Security logging
 * logger.security('Failed login attempt', { 
 *   email: user.email, 
 *   ip: request.ip 
 * });
 */
