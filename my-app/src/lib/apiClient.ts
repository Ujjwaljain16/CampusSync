/**
 * Centralized API Client
 * 
 * Provides a fetch wrapper that automatically includes:
 * - X-Organization-ID header for multi-tenant requests
 * - Proper error handling
 * - Type-safe request/response handling
 */

/**
 * Get the currently selected organization ID from localStorage
 */
export function getSelectedOrganizationId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('selectedOrganizationId');
}

/**
 * Set the currently selected organization ID in localStorage
 */
export function setSelectedOrganizationId(orgId: string | null): void {
  if (typeof window === 'undefined') return;
  
  if (orgId) {
    localStorage.setItem('selectedOrganizationId', orgId);
  } else {
    localStorage.removeItem('selectedOrganizationId');
  }
}

/**
 * Enhanced fetch wrapper with automatic X-Organization-ID header injection
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  
  // Automatically add X-Organization-ID header if available
  const selectedOrgId = getSelectedOrganizationId();
  if (selectedOrgId && !headers.has('X-Organization-ID')) {
    headers.set('X-Organization-ID', selectedOrgId);
  }

  // Merge headers back into options
  const enhancedOptions: RequestInit = {
    ...options,
    headers,
  };

  return fetch(url, enhancedOptions);
}

/**
 * Error thrown by `apiFetchJson` / `apiClient` for non-OK responses.
 * `message` is the server's `error` string when present, otherwise a stable
 * generic message, so it is safe to show to users.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Unwrap the `{ data: T }` envelope returned by `success()` on the server.
 * Tolerates raw (un-enveloped) payloads: returns `json.data ?? json`.
 */
export function unwrapData<T>(json: unknown): T {
  if (json && typeof json === 'object' && !Array.isArray(json) && 'data' in json) {
    const data = (json as { data?: unknown }).data;
    if (data !== undefined && data !== null) return data as T;
  }
  return json as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message =
    typeof record.error === 'string' && record.error
      ? record.error
      : typeof record.message === 'string' && record.message
        ? record.message
        : `Request failed (${response.status})`;
  return new ApiError(message, response.status, record.details);
}

/**
 * Typed fetch wrapper: attaches X-Organization-ID like `apiFetch`, throws
 * `ApiError` (status + message) on non-OK, and returns the unwrapped payload
 * for both enveloped (`{ data }`) and raw JSON responses.
 */
export async function apiFetchJson<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await apiFetch(url, options);
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('Invalid response from server', response.status);
  }
  return unwrapData<T>(json);
}

/**
 * Type-safe API client with JSON parsing
 */
export const apiClient = {
  /**
   * GET request
   */
  async get<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await apiFetch(url, {
      ...options,
      method: 'GET',
    });

    if (!response.ok) throw await toApiError(response);

    return response.json();
  },

  /**
   * POST request
   */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(options.headers);
    
    if (body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await apiFetch(url, {
      ...options,
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) throw await toApiError(response);

    return response.json();
  },

  /**
   * PATCH request
   */
  async patch<T = unknown>(
    url: string,
    body?: unknown,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(options.headers);
    
    if (body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await apiFetch(url, {
      ...options,
      method: 'PATCH',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) throw await toApiError(response);

    return response.json();
  },

  /**
   * PUT request
   */
  async put<T = unknown>(
    url: string,
    body?: unknown,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(options.headers);
    
    if (body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await apiFetch(url, {
      ...options,
      method: 'PUT',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) throw await toApiError(response);

    return response.json();
  },

  /**
   * DELETE request
   */
  async delete<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await apiFetch(url, {
      ...options,
      method: 'DELETE',
    });

    if (!response.ok) throw await toApiError(response);

    return response.json();
  },
};

/**
 * Hook for accessing API client in React components
 * 
 * Usage:
 * ```tsx
 * const api = useApiClient();
 * const data = await api.get('/api/students');
 * ```
 */
export function useApiClient() {
  return apiClient;
}
