import { Router } from 'express';
import { memberController } from './member.controller.js';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { updateMemberRoleSchema, updateMemberDetailsSchema, memberParamSchema } from './member.schema.js';

const router = Router();

// All member routes require auth + org context
router.use(requireAuth, requireOrgContext);

// List members of active organization (OWNER and MEMBER only, CLIENT restricted)
router.get('/', requireRole('OWNER', 'MEMBER'), memberController.listMembers);

// Update member details (phone, projectId) (OWNER only)
router.patch(
  '/:memberId',
  requireRole('OWNER'),
  validateRequest({ params: memberParamSchema, body: updateMemberDetailsSchema }),
  memberController.updateMember
);

// Update member role (OWNER only)
router.patch(
  '/:memberId/role',
  requireRole('OWNER'),
  validateRequest({ params: memberParamSchema, body: updateMemberRoleSchema }),
  memberController.updateMemberRole
);

// Remove member (OWNER only)
router.delete(
  '/:memberId',
  requireRole('OWNER'),
  validateRequest({ params: memberParamSchema }),
  memberController.removeMember
);

export default router;
