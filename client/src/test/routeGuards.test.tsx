import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/layout/ProtectedRoute.js';
import { RoleGuard } from '../components/layout/RoleGuard.js';
import * as AuthContextModule from '../contexts/AuthContext.js';
import { Role } from '../types/auth.js';

describe('Route Guards and Role-Based Access Control', () => {
  const mockAuthContext = (overrides = {}) => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      organizations: [],
      activeOrgId: null,
      activeOrg: null,
      currentRole: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      logoutAll: vi.fn(),
      switchOrganization: vi.fn(),
      refreshUserData: vi.fn(),
      updateUser: vi.fn(),
      ...overrides,
    });
  };

  it('redirects unauthenticated users to /login with encoded redirect query parameter', () => {
    mockAuthContext({ isAuthenticated: false, isLoading: false });

    render(
      <MemoryRouter initialEntries={['/invoices']}>
        <Routes>
          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <div>Secret Invoices Page</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page Target</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Secret Invoices Page')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page Target')).toBeInTheDocument();
  });

  it('allows authenticated users to access protected routes', () => {
    mockAuthContext({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u1', firstName: 'John', email: 'john@example.com' },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected Dashboard Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Dashboard Content')).toBeInTheDocument();
  });

  it('prevents CLIENT role from opening management sections and shows Access Restricted banner', () => {
    mockAuthContext({
      isAuthenticated: true,
      isLoading: false,
      currentRole: 'CLIENT' as Role,
    });

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <RoleGuard allowedRoles={['OWNER']}>
                <div>Admin Settings Area</div>
              </RoleGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Settings Area')).not.toBeInTheDocument();
    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
  });

  it('allows OWNER role to access owner-only management sections', () => {
    mockAuthContext({
      isAuthenticated: true,
      isLoading: false,
      currentRole: 'OWNER' as Role,
    });

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <RoleGuard allowedRoles={['OWNER']}>
                <div>Admin Settings Area</div>
              </RoleGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Settings Area')).toBeInTheDocument();
  });
});
