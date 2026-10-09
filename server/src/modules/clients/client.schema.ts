import { z } from 'zod';
import { ClientStatus } from '@prisma/client';

export const createClientSchema = z
  .object({
    name: z.string().min(1, 'Client name is required').max(150, 'Name too long').trim(),
    email: z.string().trim().toLowerCase().pipe(z.string().email('Invalid email format')),
    company: z.string().max(150, 'Company name too long').trim().optional().nullable(),
    address: z.string().max(300, 'Address too long').trim().optional().nullable(),
    phone: z.string().max(50, 'Phone too long').trim().optional().nullable(),
    notes: z.string().max(2000, 'Notes too long').trim().optional().nullable(),
  })
  .strict(); // Rejects unauthorized/unknown fields like organizationId, userId, etc.

export const updateClientSchema = z
  .object({
    name: z.string().min(1, 'Client name is required').max(150, 'Name too long').trim().optional(),
    email: z.string().trim().toLowerCase().pipe(z.string().email('Invalid email format')).optional(),
    company: z.string().max(150, 'Company name too long').trim().optional().nullable(),
    address: z.string().max(300, 'Address too long').trim().optional().nullable(),
    phone: z.string().max(50, 'Phone too long').trim().optional().nullable(),
    notes: z.string().max(2000, 'Notes too long').trim().optional().nullable(),
    status: z.nativeEnum(ClientStatus).optional(),
  })
  .strict();

export const clientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10), // Limit strictly capped at 100
  search: z.string().max(100).trim().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  sortBy: z.enum(['name', 'email', 'company', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const clientParamSchema = z.object({
  id: z.string().min(1, 'Client ID is required'),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientQueryInput = z.infer<typeof clientQuerySchema>;
