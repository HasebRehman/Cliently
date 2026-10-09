import { z } from 'zod';
import { ProjectStatus, ProjectBillingType, MilestoneStatus } from '@prisma/client';

export const projectFileInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().min(1),
  fileType: z.enum(['pdf', 'word']),
  fileSize: z.number().int().nonnegative(),
});

export const milestoneInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Milestone title is required').max(150, 'Title too long').trim(),
  description: z.string().max(2000, 'Description too long').trim().optional().nullable(),
  budget: z.coerce.number().min(0, 'Budget cannot be negative').optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(MilestoneStatus).default(MilestoneStatus.PENDING).optional(),
});

export const createMilestoneSchema = z
  .object({
    title: z.string().min(1, 'Milestone title is required').max(150, 'Title too long').trim(),
    description: z.string().max(2000, 'Description too long').trim().optional().nullable(),
    budget: z.coerce.number().min(0, 'Budget cannot be negative').optional().nullable(),
    deadline: z.coerce.date().optional().nullable(),
    status: z.nativeEnum(MilestoneStatus).default(MilestoneStatus.PENDING).optional(),
  })
  .strict();

export const updateMilestoneSchema = z
  .object({
    title: z.string().min(1, 'Milestone title is required').max(150, 'Title too long').trim().optional(),
    description: z.string().max(2000, 'Description too long').trim().optional().nullable(),
    deadline: z.coerce.date().optional().nullable(),
    status: z.nativeEnum(MilestoneStatus).optional(),
    order: z.coerce.number().int().optional(),
  })
  .strict();

export const milestoneRevisionSchema = z
  .object({
    revisionNotes: z.string().min(1, 'Revision notes/feedback are required').max(2000).trim(),
  })
  .strict();

export const createProjectSchema = z
  .object({
    name: z.string().min(1, 'Project name is required').max(150, 'Project name too long').trim(),
    clientId: z.string().min(1, 'Client is required'),
    description: z.string().max(2000, 'Description too long').trim().optional().nullable(),
    status: z.nativeEnum(ProjectStatus, { required_error: 'Project status is required' }),
    billingType: z.nativeEnum(ProjectBillingType, { required_error: 'Project billing type is required' }),
    budget: z.coerce.number().min(0, 'Budget cannot be negative').optional().nullable(),
    deadline: z.coerce.date({ required_error: 'Target deadline is required', invalid_type_error: 'Target deadline is required' }),
    files: z.array(projectFileInputSchema).max(5, 'Maximum 5 files allowed per project').optional(),
    milestones: z.array(milestoneInputSchema).optional(),
  })
  .strict(); // Rejects unauthorized ownership or tenant injection fields

export const updateProjectSchema = z
  .object({
    status: z.nativeEnum(ProjectStatus).optional(),
    deadline: z.coerce.date().optional().nullable(),
    name: z.string().min(1, 'Project name is required').max(150).trim().optional(),
    description: z.string().max(2000).trim().optional().nullable(),
    milestones: z.array(milestoneInputSchema).optional(),
  })
  .strict();

export const projectQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10), // Strictly capped at 100
  search: z.string().max(100).trim().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  clientId: z.string().optional(),
  sortBy: z.enum(['name', 'status', 'budget', 'deadline', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const projectParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
});

export const projectFileParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  fileId: z.string().min(1, 'File ID is required'),
});

export const milestoneParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  milestoneId: z.string().min(1, 'Milestone ID is required'),
});

export type ProjectFileInput = z.infer<typeof projectFileInputSchema>;
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type MilestoneRevisionInput = z.infer<typeof milestoneRevisionSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectQueryInput = z.infer<typeof projectQuerySchema>;

