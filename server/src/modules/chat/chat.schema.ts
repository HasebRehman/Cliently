import { z } from 'zod';

export const createDirectChatSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
});

export const createGroupChatSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100, 'Group name too long').trim(),
  description: z.string().max(500, 'Description too long').trim().optional().or(z.literal('')),
  memberIds: z.array(z.string().min(1)).min(1, 'At least one member must be selected'),
});

export const addParticipantsSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1, 'At least one member must be selected'),
});

export const sendMessageSchema = z.object({
  content: z.string().max(5000, 'Message too long').trim().optional().or(z.literal('')),
  attachmentUrl: z.string().url().optional().or(z.literal('')),
  attachmentName: z.string().max(255).optional().or(z.literal('')),
  attachmentType: z.string().max(50).optional().or(z.literal('')),
  attachmentSize: z.number().int().min(0).max(15 * 1024 * 1024, 'File exceeds 15MB limit').optional(),
}).refine((data) => Boolean(data.content || data.attachmentUrl), {
  message: 'Message must contain either text content or an attachment.',
});

export const chatRoomParamSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
});

export const chatMessageParamSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  messageId: z.string().min(1, 'Message ID is required'),
});

export const chatParticipantParamSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  userId: z.string().min(1, 'User ID is required'),
});

export const chatMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateDirectChatInput = z.infer<typeof createDirectChatSchema>;
export type CreateGroupChatInput = z.infer<typeof createGroupChatSchema>;
export type AddParticipantsInput = z.infer<typeof addParticipantsSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ChatMessagesQueryInput = z.infer<typeof chatMessagesQuerySchema>;
export type ChatMessageParamInput = z.infer<typeof chatMessageParamSchema>;
export type ChatParticipantParamInput = z.infer<typeof chatParticipantParamSchema>;
