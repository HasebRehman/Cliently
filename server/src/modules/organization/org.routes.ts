import { Router } from 'express';
import { organizationController } from './org.controller.js';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { updateOrgSchema } from './org.schema.js';

const router = Router();

// All organization routes require authentication
router.use(requireAuth);

// List all user organizations
router.get('/', organizationController.listUserOrganizations);

// Current organization settings (Requires X-Organization-Id and OWNER or MEMBER role)
router.get(
  '/current',
  requireOrgContext,
  requireRole('OWNER', 'MEMBER'),
  organizationController.getCurrentOrganization
);

// Update organization settings (OWNER only)
router.patch(
  '/current',
  requireOrgContext,
  requireRole('OWNER'),
  validateRequest({ body: updateOrgSchema }),
  organizationController.updateCurrentOrganization
);

export default router;
