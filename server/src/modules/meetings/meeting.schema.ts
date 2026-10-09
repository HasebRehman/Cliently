import { z } from 'zod';

export const projectMeetingParamSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
});

export const createInstantMeetingBodySchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(200, 'Title is too long').optional(),
  projectId: z.string().min(1, 'Project ID cannot be empty').optional(),
});

export const meetingQuerySchema = z.object({
  status: z.enum(['all', 'live', 'ended', 'scheduled', 'expired']).optional(),
  projectId: z.string().min(1).optional(),
});


export const scheduleMeetingBodySchema = z.object({
  title: z.string().min(1, 'Meeting title is required').max(200, 'Title is too long'),
  projectId: z.string().min(1, 'Project is required').optional(),
  startTime: z.string().datetime({ message: 'Valid ISO startTime string is required' }),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  attendeeUserIds: z.array(z.string().min(1)).optional(),
  attendeeClientIds: z.array(z.string().min(1)).optional(),
});

export const meetingParamSchema = z.object({
  id: z.string().min(1, 'Meeting ID is required'),
});

export type CreateInstantMeetingBodyInput = z.infer<typeof createInstantMeetingBodySchema>;
export type ScheduleMeetingBodyInput = z.infer<typeof scheduleMeetingBodySchema>;
export type MeetingQueryInput = z.infer<typeof meetingQuerySchema>;


