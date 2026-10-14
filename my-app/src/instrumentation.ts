/**
 * Next.js instrumentation hook. `onRequestError` runs for every unhandled error in a route
 * handler, server component, server action or middleware, and raises a throttled, redacted
 * webhook alert (see src/lib/alerts.ts). Errors that a route catches itself and turns into a
 * response never reach this hook; they alert only if they go through logger.error.
 *
 * Only the route PATTERN (e.g. "/api/certificates/[id]"), the router kind and the route type
 * are reported. The request path with its query string, headers and body are never read.
 */
import { reportError } from '@/lib/alerts';

interface RequestErrorRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface RequestErrorContext {
  routerKind: 'Pages Router' | 'App Router';
  routePath: string;
  routeType: 'render' | 'route' | 'action' | 'middleware';
}

/** redirect() / notFound() / unauthorized() surface as errors with these digests; they are not failures. */
function isControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/.test(digest);
}

export async function onRequestError(
  err: unknown,
  _request: RequestErrorRequest,
  context: RequestErrorContext
): Promise<void> {
  try {
    if (isControlFlowError(err)) return;
    const digest = (err as { digest?: unknown } | null)?.digest;
    reportError(err, {
      route: context?.routePath,
      routerKind: context?.routerKind,
      routeType: context?.routeType,
      requestId: typeof digest === 'string' ? digest : undefined,
    });
  } catch {
    // reporting must never break request handling
  }
}
