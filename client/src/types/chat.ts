export type ChatRoomType = 'DIRECT' | 'GROUP';

export interface ChatParticipant {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

import { MeetingSummary } from './meeting.js';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  type?: 'text' | 'meeting' | 'system';
  meetingId?: string | null;
  meeting?: MeetingSummary | null;
  content: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  createdAt: string;
  isSender?: boolean;
  isRead?: boolean;
  isDeleted?: boolean;
  readBy?: string[];
}

export interface ChatRoom {
  id: string;
  type: ChatRoomType;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  otherUserId?: string;
  otherUserEmail?: string;
  createdById?: string;
  participantsCount: number;
  participants: ChatParticipant[];
  unreadCount?: number;
  lastMessage?: {
    id: string;
    content: string | null;
    attachmentName?: string | null;
    attachmentType?: string | null;
    senderId: string;
    senderName: string;
    createdAt: string;
    isReadByAll?: boolean;
    isDeleted?: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface EligibleUser {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: 'OWNER' | 'MEMBER' | 'CLIENT';
}

export interface TypingUser {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
}
