import { z } from 'zod';

export const taskStatusEnum = z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'REVIEW', 'DONE']);
export const taskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const createTaskSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  title: z.string().min(1, 'Task title is required').max(200, 'Title must not exceed 200 characters'),
  description: z.string().max(2000, 'Description must not exceed 2000 characters').optional().nullable(),
  status: taskStatusEnum.default('TODO'),
  priority: taskPriorityEnum.default('MEDIUM'),
  dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
  estimatedHours: z.number().min(0).max(1000).optional().nullable(),
  assigneeId: z.string().uuid('Invalid assignee user ID').optional().nullable(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
  estimatedHours: z.number().min(0).max(1000).optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  order: z.number().int().optional(),
});

export const taskQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assigneeId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('50'),
});

export const taskParamSchema = z.object({
  id: z.string().uuid('Invalid task ID'),
});

export const generateAiTasksSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  fileIds: z.array(z.string().uuid()).optional(),
  customInstructions: z.string().max(1000).optional(),
});

export const singleAiTaskItemSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional().nullable(),
  priority: taskPriorityEnum.default('MEDIUM'),
  dueDate: z.string().optional().nullable(),
  estimatedHours: z.number().min(0).optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
});

export const approveAiTasksSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  tasks: z.array(singleAiTaskItemSchema).min(1, 'At least one task must be approved'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
export type GenerateAiTasksInput = z.infer<typeof generateAiTasksSchema>;
export type ApproveAiTasksInput = z.infer<typeof approveAiTasksSchema>;
export type SingleAiTaskItem = z.infer<typeof singleAiTaskItemSchema>;
