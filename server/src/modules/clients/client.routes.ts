import { Router } from 'express';
import { clientController } from './client.controller.js';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createClientSchema,
  updateClientSchema,
  clientQuerySchema,
  clientParamSchema,
} from './client.schema.js';

const router = Router();

// All client endpoints require authentication and tenant context
router.use(requireAuth, requireOrgContext);

// 1. List clients (OWNER, MEMBER)
router.get(
  '/',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ query: clientQuerySchema }),
  clientController.listClients
);

// 2. Create client (OWNER only)
router.post(
  '/',
  requireRole('OWNER'),
  validateRequest({ body: createClientSchema }),
  clientController.createClient
);

// 3. Get single client details (OWNER, MEMBER)
router.get(
  '/:id',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ params: clientParamSchema }),
  clientController.getClientById
);

// 4. Update client (OWNER only)
router.patch(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: clientParamSchema, body: updateClientSchema }),
  clientController.updateClient
);

// 5. Delete or soft-archive client (OWNER only)
router.delete(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: clientParamSchema }),
  clientController.deleteClient
);

// 6. Send client portal invite (OWNER only)
router.post(
  '/:id/portal-invite',
  requireRole('OWNER'),
  validateRequest({ params: clientParamSchema }),
  clientController.sendPortalInvite
);

export default router;
