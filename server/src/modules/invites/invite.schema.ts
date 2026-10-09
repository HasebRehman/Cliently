import { z } from 'zod';
import { Role } from '@prisma/client';
import { validatePasswordStrength } from '../../utils/passwordPolicy.js';

export const createInviteSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  name: z.string().max(150).optional().or(z.literal('')).nullable(),
  phone: z.string().max(50).optional().or(z.literal('')).nullable(),
  role: z.enum([Role.MEMBER, Role.CLIENT], {
    errorMap: () => ({ message: 'Invite role must be MEMBER or CLIENT.' }),
  }),
  projectId: z.string().uuid().optional().or(z.literal('')).nullable(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invite token is required').trim(),
  // If the user doesn't have an existing account, they can provide registration credentials
  password: z
    .string()
    .superRefine((val, ctx) => {
      const check = validatePasswordStrength(val);
      if (!check.isValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: check.message || 'Invalid password',
        });
      }
    })
    .optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
});

export const inviteParamSchema = z.object({
  inviteId: z.string().min(1, 'Invite ID is required'),
});

export const verifyInviteSchema = z.object({
  token: z.string().min(1, 'Invite token is required').trim(),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
