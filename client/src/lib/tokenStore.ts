/**
 * IN-MEMORY ACCESS TOKEN STORE
 *
 * FRONTEND SECURITY RULE:
 * The JWT access token lives strictly in JavaScript runtime memory (module variable).
 * It is NEVER persisted to localStorage, sessionStorage, IndexedDB, or WebSQL.
 * The refresh token lives in an httpOnly SameSite=Strict cookie managed solely by the browser.
 */

let inMemoryAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

export const tokenStore = {
  getAccessToken(): string | null {
    return inMemoryAccessToken;
  },

  setAccessToken(token: string | null): void {
    inMemoryAccessToken = token;
    tokenListeners.forEach((listener) => {
      try {
        listener(token);
      } catch (err) {
        console.error('Token listener error:', err);
      }
    });
  },

  hasAccessToken(): boolean {
    return inMemoryAccessToken !== null && inMemoryAccessToken.length > 0;
  },

  clear(): void {
    inMemoryAccessToken = null;
    tokenListeners.forEach((listener) => {
      try {
        listener(null);
      } catch (err) {
        console.error('Token listener error:', err);
      }
    });
  },

  subscribe(listener: (token: string | null) => void): () => void {
    tokenListeners.add(listener);
    return () => {
      tokenListeners.delete(listener);
    };
  },
};
