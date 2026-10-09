import { z } from 'zod';
import { Role } from '@prisma/client';

export const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(Role, {
    errorMap: () => ({ message: 'Invalid role. Must be OWNER, MEMBER, or CLIENT.' }),
  }),
});

export const memberParamSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
});

export const updateMemberDetailsSchema = z.object({
  phone: z.string().max(50, 'Phone too long').trim().nullable().optional().or(z.literal('')),
  projectId: z.string().uuid().nullable().optional().or(z.literal('')),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateMemberDetailsInput = z.infer<typeof updateMemberDetailsSchema>;
