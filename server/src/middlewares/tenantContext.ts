import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';
import { TenantContext } from '../types/express.js';

export async function requireOrgContext(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required prior to organization context resolution.', 401, 'UNAUTHORIZED');
    }

    const organizationId =
      (req.headers['x-organization-id'] as string) ||
      (req.params.organizationId as string) ||
      (req.query.organizationId as string);

    if (!organizationId || organizationId.trim() === '') {
      throw new AppError('X-Organization-Id header is required for tenant-scoped operations.', 400, 'ORGANIZATION_ID_REQUIRED');
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.userId,
          organizationId: organizationId.trim(),
        },
      },
      select: {
        role: true,
        organizationId: true,
        userId: true,
      },
    });

    if (!membership) {
      throw new AppError('Access denied. You are not a member of this organization.', 403, 'FORBIDDEN_TENANT_ACCESS');
    }

    // Attach verified context
    req.ctx = {
      userId: req.user.userId,
      organizationId: membership.organizationId,
      role: membership.role,
    } as TenantContext;

    next();
  } catch (error) {
    next(error);
  }
}
