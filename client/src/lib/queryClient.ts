import { QueryClient } from '@tanstack/react-query';

/**
 * Global QueryClient instance.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: (failureCount, error: any) => {
        // Do not retry 401, 403, 404, or 429
        const status = error?.status || error?.response?.status;
        if (status === 401 || status === 403 || status === 404 || status === 429) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * CRITICAL TENANT SECURITY REQUIREMENT:
 * Purges all cached server queries immediately to prevent cross-tenant data leakage
 * during organization switching, logout, or session termination.
 */
export function clearQueryCache(): void {
  queryClient.clear();
}
