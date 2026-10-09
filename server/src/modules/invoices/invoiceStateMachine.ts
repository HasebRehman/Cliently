import { InvoiceStatus } from '@prisma/client';
import { AppError } from '../../middlewares/errorHandler.js';

export const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  [InvoiceStatus.DRAFT]: [InvoiceStatus.SENT],
  [InvoiceStatus.SENT]: [InvoiceStatus.VIEWED, InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
  [InvoiceStatus.VIEWED]: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
  [InvoiceStatus.OVERDUE]: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED],
  [InvoiceStatus.PAID]: [], // Terminal: immutable
  [InvoiceStatus.CANCELLED]: [], // Terminal: immutable
};

/**
 * Validates whether a status transition from currentStatus to targetStatus is permitted.
 */
export function assertValidTransition(currentStatus: InvoiceStatus, targetStatus: InvoiceStatus): void {
  if (currentStatus === targetStatus) {
    return;
  }

  if (currentStatus === InvoiceStatus.PAID) {
    throw new AppError('Paid invoices are final and cannot be modified or transitioned.', 400, 'PAID_INVOICE_IMMUTABLE');
  }

  if (currentStatus === InvoiceStatus.CANCELLED) {
    throw new AppError('Cancelled invoices are final and cannot be reopened.', 400, 'CANCELLED_INVOICE_IMMUTABLE');
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw new AppError(
      `Invalid invoice status transition from ${currentStatus} to ${targetStatus}.`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }
}
