import { Router } from 'express';
import { invoiceController } from './invoice.controller.js';
import { requireAuth } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/tenantContext.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  cancelInvoiceSchema,
  invoiceQuerySchema,
  invoiceParamSchema,
} from './invoice.schema.js';

const router = Router();

// All invoice endpoints require authentication and tenant context
router.use(requireAuth, requireOrgContext);

// 1. List invoices (OWNER, MEMBER, CLIENT)
router.get(
  '/',
  requireRole('OWNER', 'MEMBER', 'CLIENT'),
  validateRequest({ query: invoiceQuerySchema }),
  invoiceController.listInvoices
);

// 2. Create invoice (OWNER, MEMBER)
router.post(
  '/',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ body: createInvoiceSchema }),
  invoiceController.createInvoice
);

// 3. Get invoice PDF (OWNER, MEMBER, CLIENT) - Place before /:id parameter matching if needed or use specific route
router.get(
  '/:id/pdf',
  requireRole('OWNER', 'MEMBER', 'CLIENT'),
  validateRequest({ params: invoiceParamSchema }),
  invoiceController.getInvoicePdf
);

// 4. Send invoice (OWNER, MEMBER)
router.post(
  '/:id/send',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ params: invoiceParamSchema }),
  invoiceController.sendInvoice
);

// 4b. Resend invoice email (OWNER, MEMBER)
router.post(
  '/:id/resend',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ params: invoiceParamSchema }),
  invoiceController.resendInvoice
);

// 5. Cancel invoice (OWNER only)
router.post(
  '/:id/cancel',
  requireRole('OWNER'),
  validateRequest({ params: invoiceParamSchema, body: cancelInvoiceSchema }),
  invoiceController.cancelInvoice
);

// 6. Duplicate invoice (OWNER, MEMBER)
router.post(
  '/:id/duplicate',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ params: invoiceParamSchema }),
  invoiceController.duplicateInvoice
);

// 7. Get single invoice details (OWNER, MEMBER, CLIENT)
router.get(
  '/:id',
  requireRole('OWNER', 'MEMBER', 'CLIENT'),
  validateRequest({ params: invoiceParamSchema }),
  invoiceController.getInvoiceById
);

// 8. Update invoice (OWNER, MEMBER) - DRAFT only
router.patch(
  '/:id',
  requireRole('OWNER', 'MEMBER'),
  validateRequest({ params: invoiceParamSchema, body: updateInvoiceSchema }),
  invoiceController.updateInvoice
);

// 9. Delete invoice (OWNER only) - DRAFT only
router.delete(
  '/:id',
  requireRole('OWNER'),
  validateRequest({ params: invoiceParamSchema }),
  invoiceController.deleteInvoice
);

export default router;
