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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

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
