export type Role = 'OWNER' | 'MEMBER' | 'CLIENT';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface OrgMembership {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  currency: string;
  role: Role;
  plan: string;
  joinedAt: string;
}

export interface AuthSession {
  accessToken: string;
  user: User;
  organizations: OrgMembership[];
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | unknown;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
