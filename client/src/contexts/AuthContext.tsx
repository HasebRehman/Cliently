import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, OrgMembership, Role } from '../types/auth.js';
import { tokenStore } from '../lib/tokenStore.js';
import { clearQueryCache } from '../lib/queryClient.js';
import { api, setActiveOrganizationId, setOnUnauthorizedCallback, refreshAccessTokenSingleFlight } from '../lib/apiClient.js';

interface AuthContextValue {
  user: User | null;
  organizations: OrgMembership[];
  activeOrgId: string | null;
  activeOrg: OrgMembership | null;
  currentRole: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  switchOrganization: (orgId: string) => void;
  refreshUserData: () => Promise<void>;
  updateUser: (updatedData: Partial<User>) => void;
}

function parseJwtUserId(token: string): string | null {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const decodedJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(decodedJson);
    return payload.userId || null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrgMembership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const activeOrg = organizations.find((org) => org.id === activeOrgId) || null;
  const currentRole = activeOrg ? activeOrg.role : null;
  const isAuthenticated = Boolean(user && tokenStore.hasAccessToken());

  const switchOrganization = useCallback((orgId: string) => {
    // CRITICAL TENANT SECURITY REQUIREMENT: Clear query cache on tenant switch
    clearQueryCache();
    setActiveOrganizationId(orgId);
    setActiveOrgIdState(orgId);
  }, []);

  const updateUser = useCallback((updatedData: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updatedData } : null));
  }, []);

  const handleUnauthenticated = useCallback(() => {
    tokenStore.clear();
    clearQueryCache();
    setActiveOrganizationId(null);
    setUser(null);
    setOrganizations([]);
    setActiveOrgIdState(null);
  }, []);

  const refreshUserData = useCallback(async () => {
    try {
      const meRes = await api.get<{ user: User; organizations: OrgMembership[] }>('/auth/me');
      if (meRes && meRes.user) {
        setUser(meRes.user);
        const orgs = meRes.organizations || [];
        setOrganizations(orgs);
        if (orgs.length > 0) {
          setActiveOrgIdState((prev) => {
            if (prev && orgs.some((o) => o.id === prev)) {
              setActiveOrganizationId(prev);
              return prev;
            }
            const defaultId = orgs[0].id;
            setActiveOrganizationId(defaultId);
            return defaultId;
          });
        }
      }
    } catch {
      // Silently ignore if not authorized
    }
  }, []);

  // Silent session restoration on app load via httpOnly cookie
  useEffect(() => {
    setOnUnauthorizedCallback(handleUnauthenticated);

    let isMounted = true;
    async function restoreSession() {
      try {
        const token = await refreshAccessTokenSingleFlight();
        if (token && isMounted) {
          try {
            // Fetch real user profile and organizations from /auth/me
            const meRes = await api.get<{ user: User; organizations: OrgMembership[] }>('/auth/me');
            if (isMounted && meRes && meRes.user) {
              setUser(meRes.user);
              const orgs = meRes.organizations || [];
              setOrganizations(orgs);
              if (orgs.length > 0) {
                setActiveOrganizationId(orgs[0].id);
                setActiveOrgIdState(orgs[0].id);
              }
            }
          } catch {
            // Fallback to /organizations if /auth/me fails
            const orgs = await api.get<OrgMembership[]>('/organizations');
            if (isMounted) {
              setOrganizations(orgs);
              if (orgs.length > 0) {
                setActiveOrganizationId(orgs[0].id);
                setActiveOrgIdState(orgs[0].id);
              }
              const parsedUserId = parseJwtUserId(token) || 'current-user';
              setUser({
                id: parsedUserId,
                email: '',
                firstName: 'User',
                lastName: '',
                emailVerified: true,
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      } catch {
        if (isMounted) {
          handleUnauthenticated();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [handleUnauthenticated]);

  // Real-time instant logout on session revocation (e.g. client or member deleted by owner)
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const token = tokenStore.getAccessToken();
    if (!token) return;

    const eventSource = new EventSource(`/api/v1/auth/events?token=${encodeURIComponent(token)}`);

    eventSource.addEventListener('session_revoked', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (!user?.id || data.userId === user.id) {
          handleUnauthenticated();
          const reason = encodeURIComponent(data.reason || 'Your account access has been removed by the organization owner.');
          window.location.href = `/login?revoked=true&reason=${reason}`;
        }
      } catch {
        handleUnauthenticated();
        window.location.href = '/login?revoked=true';
      }
    });

    eventSource.onerror = () => {
      // Retried automatically by browser EventSource
    };

    return () => {
      eventSource.close();
    };
  }, [isAuthenticated, user?.id, handleUnauthenticated]);

  const login = async (email: string, password: string) => {
    clearQueryCache();
    const result = await api.post<{
      accessToken: string;
      user: User;
      organizations: OrgMembership[];
    }>('/auth/login', { email, password }, { skipAuth: true, skipOrgHeader: true });

    tokenStore.setAccessToken(result.accessToken);
    setUser(result.user);
    setOrganizations(result.organizations || []);

    if (result.organizations && result.organizations.length > 0) {
      const firstOrgId = result.organizations[0].id;
      setActiveOrganizationId(firstOrgId);
      setActiveOrgIdState(firstOrgId);
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {}, { skipOrgHeader: true });
    } catch {
      // Ignore logout errors
    } finally {
      handleUnauthenticated();
    }
  };

  const logoutAll = async () => {
    try {
      await api.post('/auth/logout-all', {}, { skipOrgHeader: true });
    } catch {
      // Ignore logout-all errors
    } finally {
      handleUnauthenticated();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        activeOrgId,
        activeOrg,
        currentRole,
        isAuthenticated,
        isLoading,
        login,
        logout,
        logoutAll,
        switchOrganization,
        refreshUserData,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
