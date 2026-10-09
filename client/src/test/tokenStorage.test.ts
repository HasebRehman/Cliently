import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tokenStore } from '../lib/tokenStore.js';

describe('Frontend Token In-Memory Storage Security', () => {
  beforeEach(() => {
    tokenStore.clear();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores access token in memory without writing to localStorage or sessionStorage', () => {
    const spyLocalSet = vi.spyOn(Storage.prototype, 'setItem');
    const dummyJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummyPayload.signature';

    tokenStore.setAccessToken(dummyJwt);

    // Verify token is available in memory
    expect(tokenStore.getAccessToken()).toBe(dummyJwt);
    expect(tokenStore.hasAccessToken()).toBe(true);

    // Verify localStorage was never accessed or written to
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.length).toBe(0);

    // Verify sessionStorage was never accessed or written to
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.length).toBe(0);

    // Ensure setItem was never called
    expect(spyLocalSet).not.toHaveBeenCalled();

    spyLocalSet.mockRestore();
  });

  it('clears token in memory on clear() without leaving residual web storage', () => {
    tokenStore.setAccessToken('sample.token.value');
    expect(tokenStore.hasAccessToken()).toBe(true);

    tokenStore.clear();

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.hasAccessToken()).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
