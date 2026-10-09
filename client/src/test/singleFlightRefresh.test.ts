import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiRequest } from '../lib/apiClient.js';
import { tokenStore } from '../lib/tokenStore.js';

describe('Single-Flight Refresh Token Interceptor', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenStore.setAccessToken('expired-access-token');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    tokenStore.clear();
  });

  it('coalesces multiple parallel 401 responses into exactly ONE /auth/refresh call', async () => {
    let refreshCallCount = 0;
    let resourceCallCount = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      // Refresh Endpoint
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        // Small delay to simulate network latency and ensure concurrency
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new Response(
          JSON.stringify({
            success: true,
            data: { accessToken: 'refreshed-token-xyz' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Protected Resource Endpoint
      if (url.includes('/clients')) {
        resourceCallCount++;
        const authHeader = (init?.headers as Record<string, string>)?.[
          'Authorization'
        ];

        // Return 401 on initial expired token, 200 once refreshed token is attached
        if (authHeader === 'Bearer expired-access-token') {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Token expired' },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: '1', name: 'Client A' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    // Fire 3 parallel requests with the expired token
    const [res1, res2, res3] = await Promise.all([
      apiRequest('/clients'),
      apiRequest('/clients'),
      apiRequest('/clients'),
    ]);

    // Verify exactly ONE single refresh call was made
    expect(refreshCallCount).toBe(1);

    // Verify that all 3 parallel requests resolved successfully with data
    expect(res1).toEqual([{ id: '1', name: 'Client A' }]);
    expect(res2).toEqual([{ id: '1', name: 'Client A' }]);
    expect(res3).toEqual([{ id: '1', name: 'Client A' }]);

    // Verify that new token is stored in memory
    expect(tokenStore.getAccessToken()).toBe('refreshed-token-xyz');
  });
});
