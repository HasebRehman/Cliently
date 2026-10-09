import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { inviteController } from './invite.controller.js';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { inviteRateLimiter } from '../../middlewares/rateLimiter.js';
import { env } from '../../config/env.js';
import { createInviteSchema, acceptInviteSchema, inviteParamSchema, verifyInviteSchema } from './invite.schema.js';
import { AuthUser } from '../../types/express.js';

const router = Router();

// Middleware to optionally extract user from Bearer token if present (for accept invite)
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as { userId: string; sessionId: string };
      req.user = { userId: decoded.userId, sessionId: decoded.sessionId } as AuthUser;
    } catch {
      // Ignore token verification errors for optional auth
    }
  }
  next();
}

// 1. Get Invite Details (Public)
router.get(
  '/details',
  validateRequest({ query: verifyInviteSchema }),
  inviteController.getInviteDetails
);

// 2. Accept Invite (Public / Optional Auth)
router.post(
  '/accept',
  optionalAuth,
  validateRequest({ body: acceptInviteSchema }),
  inviteController.acceptInvite
);

// 2. Create Invite (OWNER only, requires org context)
router.post(
  '/',
  requireAuth,
  requireOrgContext,
  requireRole('OWNER'),
  inviteRateLimiter,
  validateRequest({ body: createInviteSchema }),
  inviteController.createInvite
);

// 3. List Pending Invites (OWNER only, requires org context)
router.get(
  '/',
  requireAuth,
  requireOrgContext,
  requireRole('OWNER'),
  inviteController.listPendingInvites
);

// 4. Revoke Invite (OWNER only, requires org context)
router.delete(
  '/:inviteId',
  requireAuth,
  requireOrgContext,
  requireRole('OWNER'),
  validateRequest({ params: inviteParamSchema }),
  inviteController.revokeInvite
);

export default router;
