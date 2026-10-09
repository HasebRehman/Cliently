import { Role } from '@prisma/client';

export interface AuthUser {
  userId: string;
  sessionId: string;
}

export interface TenantContext {
  userId: string;
  organizationId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      ctx?: TenantContext;
    }
  }
}
