import { z } from 'zod';
import { InvoiceStatus } from '@prisma/client';

export const invoiceItemSchema = z
  .object({
    description: z.string().min(1, 'Item description is required').max(255, 'Description too long').trim(),
    qty: z.coerce.number().positive('Quantity must be greater than 0').max(1000000, 'Quantity too large'),
    rate: z.coerce.number().min(0, 'Rate cannot be negative').max(1000000000, 'Rate too large'),
  })
  .strict();

export const createInvoiceSchema = z
  .object({
    clientId: z.string().min(1, 'Client ID is required'),
    projectId: z.string().min(1).optional().nullable(),
    issueDate: z.coerce.date().default(() => new Date()),
    dueDate: z.coerce.date({ required_error: 'Due date is required' }),
    items: z.array(invoiceItemSchema).min(1, 'At least one line item is required').max(100, 'Maximum 100 line items allowed'),
    discount: z.coerce.number().min(0, 'Discount cannot be negative').default(0).optional().nullable(),
    notes: z.string().max(2000, 'Notes too long').trim().optional().nullable(),
    terms: z.string().max(2000, 'Terms too long').trim().optional().nullable(),
  })
  .strict()
  .refine((data) => new Date(data.dueDate) >= new Date(data.issueDate), {
    message: 'Due date must be on or after the issue date',
    path: ['dueDate'],
  });

export const updateInvoiceSchema = z
  .object({
    clientId: z.string().min(1, 'Client ID cannot be empty').optional(),
    projectId: z.string().min(1).optional().nullable(),
    issueDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    items: z.array(invoiceItemSchema).min(1, 'At least one line item is required').max(100, 'Maximum 100 line items allowed').optional(),
    discount: z.coerce.number().min(0, 'Discount cannot be negative').optional().nullable(),
    notes: z.string().max(2000, 'Notes too long').trim().optional().nullable(),
    terms: z.string().max(2000, 'Terms too long').trim().optional().nullable(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.issueDate && data.dueDate) {
        return new Date(data.dueDate) >= new Date(data.issueDate);
      }
      return true;
    },
    {
      message: 'Due date must be on or after the issue date',
      path: ['dueDate'],
    }
  );

export const cancelInvoiceSchema = z
  .object({
    reason: z.string().min(1, 'Cancellation reason is required').max(500, 'Reason too long').trim(),
  })
  .strict();

export const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10), // Capped at 100
  status: z.nativeEnum(InvoiceStatus).optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().max(100).trim().optional(),
  sortBy: z.enum(['number', 'issueDate', 'dueDate', 'total', 'status', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const invoiceParamSchema = z.object({
  id: z.string().min(1, 'Invoice ID is required'),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;
export type InvoiceQueryInput = z.infer<typeof invoiceQuerySchema>;
