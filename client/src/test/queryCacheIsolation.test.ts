import { describe, it, expect, beforeEach } from 'vitest';
import { queryClient, clearQueryCache } from '../lib/queryClient.js';
import { getActiveOrganizationId, setActiveOrganizationId } from '../lib/apiClient.js';

describe('Query Cache Tenant Isolation and Purging', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('purges all cached queries and data on clearQueryCache()', () => {
    // Populate cache with tenant data
    queryClient.setQueryData(['clients', { orgId: 'org-1' }], [{ id: 'c1', name: 'Tenant 1 Client' }]);
    queryClient.setQueryData(['invoices', { orgId: 'org-1' }], [{ id: 'inv-1', total: 100 }]);

    expect(queryClient.getQueryData(['clients', { orgId: 'org-1' }])).toBeDefined();
    expect(queryClient.getQueryData(['invoices', { orgId: 'org-1' }])).toBeDefined();
    expect(queryClient.getQueryCache().getAll().length).toBe(2);

    // Trigger tenant cache clear
    clearQueryCache();

    // Cache must now be completely empty
    expect(queryClient.getQueryData(['clients', { orgId: 'org-1' }])).toBeUndefined();
    expect(queryClient.getQueryData(['invoices', { orgId: 'org-1' }])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll().length).toBe(0);
  });

  it('clears cache and changes active org on organization switch', () => {
    setActiveOrganizationId('org-alpha');
    expect(getActiveOrganizationId()).toBe('org-alpha');

    queryClient.setQueryData(['clients'], [{ id: 'c-alpha', name: 'Alpha Corp' }]);
    expect(queryClient.getQueryCache().getAll().length).toBe(1);

    // Simulate tenant switch
    clearQueryCache();
    setActiveOrganizationId('org-beta');

    expect(getActiveOrganizationId()).toBe('org-beta');
    expect(queryClient.getQueryCache().getAll().length).toBe(0);
  });
});
