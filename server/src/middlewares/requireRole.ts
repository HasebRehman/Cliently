import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AppError } from './errorHandler.js';

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.ctx) {
      throw new AppError('Tenant context is required before checking role permissions.', 500, 'CONTEXT_MISSING');
    }

    if (!allowedRoles || allowedRoles.length === 0) {
      // Default deny if no roles are configured
      throw new AppError('Permission configuration error: Access denied by default.', 403, 'ACCESS_DENIED');
    }

    if (!allowedRoles.includes(req.ctx.role)) {
      throw new AppError(
        `Insufficient permissions. Required one of [${allowedRoles.join(', ')}], but your role is ${req.ctx.role}.`,
        403,
        'FORBIDDEN_ROLE'
      );
    }

    next();
  };
}
