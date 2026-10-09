import { tokenStore } from './tokenStore.js';
import { clearQueryCache } from './queryClient.js';
import { ApiResponse } from '../types/auth.js';

let activeOrganizationId: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

// Single-flight refresh token mutex / promise
let refreshPromise: Promise<string | null> | null = null;

const RAW_API_URL = ((import.meta as any).env?.VITE_API_URL as string) || '';

export function resolveApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  let base = RAW_API_URL ? RAW_API_URL.trim().replace(/\/+$/, '') : '';
  if (!base && typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    base = 'https://cliently-backend.onrender.com/api/v1';
  }

  if (base) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    if (base.endsWith('/api/v1') && cleanEndpoint.startsWith('/api/v1')) {
      return `${base.replace(/\/api\/v1$/, '')}${cleanEndpoint}`;
    }
    if (!base.endsWith('/api/v1') && !cleanEndpoint.startsWith('/api')) {
      return `${base}/api/v1${cleanEndpoint}`;
    }
    return `${base}${cleanEndpoint}`;
  }

  return endpoint.startsWith('/api') ? endpoint : `/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

export function setActiveOrganizationId(orgId: string | null): void {
  activeOrganizationId = orgId;
}

export function getActiveOrganizationId(): string | null {
  return activeOrganizationId;
}

export function setOnUnauthorizedCallback(cb: () => void): void {
  onUnauthorizedCallback = cb;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly response?: {
    status: number;
    data: ApiResponse;
  };

  constructor(message: string, status = 500, code = 'UNKNOWN_ERROR', details?: unknown, rawResponse?: ApiResponse) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    if (rawResponse) {
      this.response = { status, data: rawResponse };
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Performs a single-flight silent session refresh using the httpOnly cookie.
 * Multiple concurrent 401 failures share the exact same refresh request promise.
 */
export async function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(resolveApiUrl('/auth/refresh'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // SameSite=Strict httpOnly cookie
      });

      if (!response.ok) {
        throw new Error('Refresh token invalid or expired');
      }

      const body: ApiResponse<{ accessToken: string }> = await response.json();
      if (!body.success || !body.data?.accessToken) {
        throw new Error('Malformed refresh response');
      }

      const newToken = body.data.accessToken;
      tokenStore.setAccessToken(newToken);
      return newToken;
    } catch (error) {
      tokenStore.clear();
      clearQueryCache();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipOrgHeader?: boolean;
}

/**
 * Robust, authenticated API Client fetch wrapper.
 */
export async function apiRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = resolveApiUrl(endpoint);

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (isFormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }

  const currentToken = tokenStore.getAccessToken();
  if (!options.skipAuth && currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  if (!options.skipOrgHeader && activeOrganizationId) {
    headers['X-Organization-Id'] = activeOrganizationId;
  }

  const fetchConfig: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  let response = await fetch(url, fetchConfig);

  // Handle 401 with single-flight automatic token refresh & retry
  if (response.status === 401 && !options.skipAuth && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
    const newToken = await refreshAccessTokenSingleFlight();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, {
        ...fetchConfig,
        headers,
      });
    } else {
      throw new ApiError('Session expired. Please log in again.', 401, 'UNAUTHORIZED');
    }
  }

  // Parse JSON response
  let jsonResponse: ApiResponse<T>;
  try {
    jsonResponse = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new ApiError(`Server returned HTTP ${response.status}`, response.status, 'HTTP_ERROR');
    }
    return {} as T;
  }

  if (!response.ok || !jsonResponse.success) {
    const errorObj = jsonResponse.error;
    const message = errorObj?.message || jsonResponse.message || `Request failed with status ${response.status}`;
    const code = errorObj?.code || `HTTP_${response.status}`;
    throw new ApiError(message, response.status, code, errorObj?.details, jsonResponse);
  }

  if ((jsonResponse as any).pagination !== undefined) {
    return {
      data: jsonResponse.data,
      pagination: (jsonResponse as any).pagination,
    } as T;
  }

  return (jsonResponse.data !== undefined ? jsonResponse.data : jsonResponse) as T;
}

/**
 * Downloads a binary file (e.g. invoice PDF) securely via authenticated fetch.
 * Converts to blob, triggers download, and immediately revokes the object URL.
 */
export async function downloadAuthenticatedFile(endpoint: string, filename: string): Promise<void> {
  const url = resolveApiUrl(endpoint);

  const headers: Record<string, string> = {};
  const currentToken = tokenStore.getAccessToken();
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }
  if (activeOrganizationId) {
    headers['X-Organization-Id'] = activeOrganizationId;
  }

  let response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    const newToken = await refreshAccessTokenSingleFlight();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
      });
    } else {
      throw new ApiError('Session expired. Please log in to download this document.', 401, 'UNAUTHORIZED');
    }
  }

  if (!response.ok) {
    let errMsg = `Failed to download file (HTTP ${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) errMsg = errJson.error.message;
    } catch {}
    throw new ApiError(errMsg, response.status, 'DOWNLOAD_FAILED');
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup: remove anchor and revoke object URL
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(objectUrl);
}

export const api = {
  get: <T = any>(url: string, options?: RequestOptions) =>
    apiRequest<T>(url, { ...options, method: 'GET' }),

  post: <T = any>(url: string, body?: any, options?: RequestOptions) => {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    return apiRequest<T>(url, {
      ...options,
      method: 'POST',
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    });
  },

  patch: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    apiRequest<T>(url, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),

  delete: <T = any>(url: string, options?: RequestOptions) =>
    apiRequest<T>(url, { ...options, method: 'DELETE' }),

  downloadPdf: downloadAuthenticatedFile,
};
