import { ChatRoomType, Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { TenantContext } from '../../types/express.js';
import { realtimeChat } from '../../lib/ws.js';
import {
  CreateDirectChatInput,
  CreateGroupChatInput,
  SendMessageInput,
  ChatMessagesQueryInput,
} from './chat.schema.js';

export class ChatService {
  /**
   * 1. Get eligible users current user can chat with based on strict role matrix
   */
  async getEligibleUsers(ctx: TenantContext) {
    const memberships = await prisma.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: { not: ctx.userId },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
            clients: {
              where: { organizationId: ctx.organizationId },
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Role filtering:
    // OWNER -> can chat with OWNER, MEMBER, and CLIENT
    // MEMBER -> can chat with OWNER and MEMBER (CANNOT chat with CLIENT)
    // CLIENT -> can chat with OWNER only (CANNOT chat with MEMBER)
    const filtered = memberships.filter((m) => {
      if (ctx.role === 'OWNER') return true;
      if (ctx.role === 'MEMBER') return m.role === 'OWNER' || m.role === 'MEMBER';
      if (ctx.role === 'CLIENT') return m.role === 'OWNER';
      return false;
    });

    return filtered.map((m) => {
      let displayName = `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim();
      
      // If client record exists with specific clean business name, prefer that
      if (m.role === 'CLIENT' && m.user.clients && m.user.clients.length > 0 && m.user.clients[0].name) {
        displayName = m.user.clients[0].name.trim();
      }

      // If displayName accidentally contains user's email, strip it
      if (displayName && m.user.email && displayName.includes(m.user.email)) {
        displayName = displayName.replace(m.user.email, '').trim();
      }

      // Fallback if empty
      if (!displayName) {
        displayName = m.user.firstName?.trim() || m.user.email.split('@')[0];
      }

      return {
        userId: m.user.id,
        name: displayName,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
      };
    });
  }

  /**
   * 2. Start or retrieve existing direct (1-on-1) chat room
   */
  async getOrCreateDirectChat(ctx: TenantContext, input: CreateDirectChatInput) {
    const { targetUserId } = input;

    if (targetUserId === ctx.userId) {
      throw new AppError('Cannot start a direct chat with yourself.', 400, 'SELF_CHAT_NOT_ALLOWED');
    }

    // Verify target membership in same tenant
    const targetMembership = await prisma.membership.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId: targetUserId,
      },
    });

    if (!targetMembership) {
      throw new AppError('Target user not found in this organization.', 404, 'USER_NOT_FOUND');
    }

    // Strict 1-on-1 Permission Checks:
    if (ctx.role === 'MEMBER' && targetMembership.role === Role.CLIENT) {
      throw new AppError(
        'Team members cannot direct message clients. Please use a group created by the owner.',
        403,
        'MEMBER_CANNOT_CHAT_WITH_CLIENT'
      );
    }

    if (ctx.role === 'CLIENT' && targetMembership.role === Role.MEMBER) {
      throw new AppError(
        'Clients can only direct message the organization owner.',
        403,
        'CLIENT_CANNOT_CHAT_WITH_MEMBER'
      );
    }

    // Check if direct room already exists between these 2 users in this tenant
    const existingRoom = await prisma.chatRoom.findFirst({
      where: {
        organizationId: ctx.organizationId,
        type: ChatRoomType.DIRECT,
        AND: [
          { participants: { some: { userId: ctx.userId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existingRoom) {
      return this.formatRoom(existingRoom, ctx.userId);
    }

    // Create new Direct Chat Room
    const createdRoom = await prisma.chatRoom.create({
      data: {
        organizationId: ctx.organizationId,
        type: ChatRoomType.DIRECT,
        createdById: ctx.userId,
        participants: {
          create: [
            { userId: ctx.userId },
            { userId: targetUserId },
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Notify target user via WebSocket
    realtimeChat.broadcastToUser(targetUserId, {
      type: 'ROOM_CREATED',
      room: this.formatRoom(createdRoom, targetUserId),
    });

    return this.formatRoom(createdRoom, ctx.userId);
  }

  /**
   * 3. Create Group Chat (OWNER ONLY)
   */
  async createGroupChat(ctx: TenantContext, input: CreateGroupChatInput) {
    if (ctx.role !== 'OWNER') {
      throw new AppError(
        'Only organization owners have permission to create group chats.',
        403,
        'OWNER_ONLY_GROUP_CREATION'
      );
    }

    const { name, description, memberIds } = input;

    // Ensure creator is in participant list
    const uniqueUserIds = Array.from(new Set([ctx.userId, ...memberIds]));

    // Validate all members belong to this organization
    const validMemberships = await prisma.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: { in: uniqueUserIds },
      },
    });

    if (validMemberships.length !== uniqueUserIds.length) {
      throw new AppError('One or more selected members are invalid.', 400, 'INVALID_GROUP_MEMBERS');
    }

    const groupRoom = await prisma.chatRoom.create({
      data: {
        organizationId: ctx.organizationId,
        type: ChatRoomType.GROUP,
        name: name.trim(),
        description: description?.trim() || null,
        createdById: ctx.userId,
        participants: {
          create: uniqueUserIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Notify all participants
    uniqueUserIds.forEach((uid) => {
      realtimeChat.broadcastToUser(uid, {
        type: 'ROOM_CREATED',
        room: this.formatRoom(groupRoom, uid),
      });
    });

    return this.formatRoom(groupRoom, ctx.userId);
  }

  /**
   * 4. List all chat conversations for current user
   */
  async listRooms(ctx: TenantContext) {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        organizationId: ctx.organizationId,
        participants: {
          some: { userId: ctx.userId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: { id: true, firstName: true, lastName: true },
            },
            receipts: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const formattedRooms = await Promise.all(
      rooms.map(async (room) => {
        const participantInfo = room.participants.find((p) => p.userId === ctx.userId);
        const lastReadAt = participantInfo?.lastReadAt;

        // Calculate unread count
        const unreadCount = await prisma.chatMessage.count({
          where: {
            roomId: room.id,
            senderId: { not: ctx.userId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
            receipts: { none: { userId: ctx.userId } },
          },
        });

        const formatted = this.formatRoom(room, ctx.userId);
        const lastMsg = room.messages[0];

        return {
          ...formatted,
          unreadCount,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                content: lastMsg.isDeleted ? 'This message was deleted' : lastMsg.content,
                attachmentName: lastMsg.isDeleted ? null : lastMsg.attachmentName,
                attachmentType: lastMsg.isDeleted ? null : lastMsg.attachmentType,
                senderId: lastMsg.senderId,
                senderName: `${lastMsg.sender.firstName} ${lastMsg.sender.lastName}`.trim(),
                createdAt: lastMsg.createdAt,
                isDeleted: lastMsg.isDeleted,
                // Check if all other participants read this message for double blue tick on preview
                isReadByAll: lastMsg.senderId === ctx.userId && room.participants.length > 1
                  ? lastMsg.receipts.length >= room.participants.length - 1
                  : false,
              }
            : null,
        };
      })
    );

    // Deduplicate any direct rooms by otherUserId to guarantee 1 direct chat per user
    const seenDirectUserIds = new Set<string>();
    return formattedRooms.filter((r) => {
      if (r.type === ChatRoomType.DIRECT) {
        if (r.otherUserId && seenDirectUserIds.has(r.otherUserId)) {
          return false;
        }
        if (r.otherUserId) seenDirectUserIds.add(r.otherUserId);
      }
      return true;
    });
  }

  /**
   * 5. Get Room details and verify membership
   */
  async getRoomById(ctx: TenantContext, roomId: string) {
    const room = await prisma.chatRoom.findFirst({
      where: {
        id: roomId,
        organizationId: ctx.organizationId,
        participants: { some: { userId: ctx.userId } },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new AppError('Chat room not found or access denied.', 404, 'ROOM_NOT_FOUND');
    }

    return this.formatRoom(room, ctx.userId);
  }

  /**
   * 6. Get Paginated Messages in a Room with Read Status / WhatsApp-style Ticks
   */
  async getMessages(ctx: TenantContext, roomId: string, query: ChatMessagesQueryInput) {
    const { limit, cursor } = query;

    // Verify room access
    const isParticipant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: ctx.userId } },
    });

    if (!isParticipant) {
      throw new AppError('You do not have access to this conversation.', 403, 'ROOM_ACCESS_DENIED');
    }

    const room = await prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { participants: true },
    });

    const otherParticipantCount = Math.max(room.participants.length - 1, 1);

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        meeting: {
          select: {
            id: true,
            title: true,
            status: true,
            provider: true,
            startTime: true,
            endTime: true,
            createdById: true,
            createdBy: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        receipts: {
          select: {
            userId: true,
            readAt: true,
          },
        },
      },
    });

    // Auto mark room as read for the requesting user
    const now = new Date();
    await prisma.chatParticipant.updateMany({
      where: { roomId, userId: ctx.userId },
      data: { lastReadAt: now },
    });

    const unreadMessages = messages.filter(
      (m) => m.senderId !== ctx.userId && !m.receipts.some((r) => r.userId === ctx.userId)
    );

    if (unreadMessages.length > 0) {
      await prisma.chatMessageReceipt.createMany({
        data: unreadMessages.map((m) => ({
          messageId: m.id,
          userId: ctx.userId,
          readAt: now,
        })),
        skipDuplicates: true,
      });

      // Broadcast to room so sender immediately sees double blue ticks
      realtimeChat.broadcastToRoom(roomId, {
        type: 'MESSAGES_READ',
        roomId,
        userId: ctx.userId,
        messageIds: unreadMessages.map((m) => m.id),
        readAt: now.toISOString(),
      });

      // Calculate and broadcast updated total unread count to this user
      const unreadData = await this.getTotalUnreadCount(ctx);
      realtimeChat.broadcastToUser(ctx.userId, {
        type: 'UNREAD_COUNT_CHANGED',
        totalUnread: unreadData.totalUnread,
        roomId,
      });
    }

    // Format messages (chronological order for client)
    const formatted = messages.reverse().map((msg) => {
      const isSender = msg.senderId === ctx.userId;
      // WhatsApp tick logic:
      // - If not sender: ticks don't apply to received messages
      // - If sender:
      //   - 'SENT' / 'DELIVERED': double grey tick (default when stored)
      //   - 'READ': double blue tick (when all other room participants have read receipts)
      const readCount = msg.receipts.length;
      const isReadByAll = isSender && readCount >= otherParticipantCount;

      let meetingInfo = undefined;
      if (msg.meeting) {
        const isLive = msg.meeting.status === 'live';
        const isExpired = isLive && (Date.now() - new Date(msg.meeting.startTime).getTime() > 4 * 60 * 60 * 1000);
        meetingInfo = {
          id: msg.meeting.id,
          title: msg.meeting.title,
          status: isExpired ? 'ended' : msg.meeting.status,
          provider: msg.meeting.provider,
          startTime: msg.meeting.startTime,
          endTime: msg.meeting.endTime,
          createdById: msg.meeting.createdById,
          hostName: `${msg.meeting.createdBy.firstName} ${msg.meeting.createdBy.lastName}`.trim(),
        };
      }

      return {
        id: msg.id,
        roomId: msg.roomId,
        senderId: msg.senderId,
        senderName: `${msg.sender.firstName} ${msg.sender.lastName}`.trim(),
        senderAvatar: msg.sender.avatarUrl,
        type: msg.type || 'text',
        meetingId: msg.meetingId,
        meeting: meetingInfo,
        content: msg.isDeleted ? null : msg.content,
        attachmentUrl: msg.isDeleted ? null : msg.attachmentUrl,
        attachmentName: msg.isDeleted ? null : msg.attachmentName,
        attachmentType: msg.isDeleted ? null : msg.attachmentType,
        attachmentSize: msg.isDeleted ? null : msg.attachmentSize,
        isDeleted: msg.isDeleted,
        createdAt: msg.createdAt,
        isSender,
        isRead: isReadByAll, // True = Double Blue Tick, False = Double Grey Tick
        readBy: msg.receipts.map((r) => r.userId),
      };
    });

    return {
      messages: formatted,
      nextCursor: messages.length === limit ? messages[0].createdAt : null,
    };
  }

  /**
   * 7. Send Message & Broadcast over WebSocket
   */
  async sendMessage(ctx: TenantContext, roomId: string, input: SendMessageInput) {
    const isParticipant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: ctx.userId } },
    });

    if (!isParticipant) {
      throw new AppError('You do not have access to this conversation.', 403, 'ROOM_ACCESS_DENIED');
    }

    const room = await prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    const now = new Date();

    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          roomId,
          senderId: ctx.userId,
          content: input.content?.trim() || null,
          attachmentUrl: input.attachmentUrl || null,
          attachmentName: input.attachmentName || null,
          attachmentType: input.attachmentType || null,
          attachmentSize: input.attachmentSize || null,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          receipts: true,
        },
      }),
      prisma.chatRoom.update({
        where: { id: roomId },
        data: { updatedAt: now },
      }),
      prisma.chatParticipant.update({
        where: { roomId_userId: { roomId, userId: ctx.userId } },
        data: { lastReadAt: now },
      }),
    ]);

    const formattedMessage = {
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      senderName: `${message.sender.firstName} ${message.sender.lastName}`.trim(),
      senderAvatar: message.sender.avatarUrl,
      content: message.content,
      attachmentUrl: message.attachmentUrl,
      attachmentName: message.attachmentName,
      attachmentType: message.attachmentType,
      attachmentSize: message.attachmentSize,
      isDeleted: false,
      createdAt: message.createdAt,
      isRead: false,
      readBy: [],
    };

    // Broadcast immediately to all online participants in this room
    realtimeChat.broadcastToRoom(roomId, {
      type: 'NEW_MESSAGE',
      roomId,
      message: formattedMessage,
    });

    // Also notify offline/other screen room list update & unread count
    for (const p of room.participants) {
      if (p.userId !== ctx.userId) {
        // Calculate updated unread count for recipient
        this.getTotalUnreadCount({
          organizationId: ctx.organizationId,
          userId: p.userId,
        }).then((res) => {
          realtimeChat.broadcastToUser(p.userId, {
            type: 'UNREAD_COUNT_CHANGED',
            totalUnread: res.totalUnread,
            roomId,
          });
        }).catch((err) => {
          console.error('Failed to calculate unread count for recipient:', err);
        });

        realtimeChat.broadcastToUser(p.userId, {
          type: 'CONVERSATION_UPDATED',
          roomId,
          lastMessage: {
            id: message.id,
            content: message.content,
            attachmentName: message.attachmentName,
            senderId: message.senderId,
            senderName: formattedMessage.senderName,
            createdAt: message.createdAt,
          },
        });
      } else {
        realtimeChat.broadcastToUser(p.userId, {
          type: 'CONVERSATION_UPDATED',
          roomId,
          lastMessage: {
            id: message.id,
            content: message.content,
            attachmentName: message.attachmentName,
            senderId: message.senderId,
            senderName: formattedMessage.senderName,
            createdAt: message.createdAt,
          },
        });
      }
    }

    return formattedMessage;
  }

  /**
   * 8. Delete message (User can delete their own message; Owner can also delete if needed)
   * WhatsApp style: marks isDeleted = true, clears sensitive contents, and broadcasts update
   */
  async deleteMessage(ctx: TenantContext, roomId: string, messageId: string) {
    const isParticipant = await prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: ctx.userId } },
    });

    if (!isParticipant) {
      throw new AppError('You do not have access to this conversation.', 403, 'ROOM_ACCESS_DENIED');
    }

    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        roomId,
      },
      include: {
        room: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!message) {
      throw new AppError('Message not found.', 404, 'MESSAGE_NOT_FOUND');
    }

    // Only allow message sender or organization owner to delete
    if (message.senderId !== ctx.userId && ctx.role !== 'OWNER') {
      throw new AppError('You can only delete your own messages.', 403, 'CANNOT_DELETE_OTHERS_MESSAGE');
    }

    // WhatsApp style soft delete: wipe content and attachments, set isDeleted: true
    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        content: null,
        attachmentUrl: null,
        attachmentName: null,
        attachmentType: null,
        attachmentSize: null,
      },
    });

    // Broadcast deletion to all users currently in the room
    realtimeChat.broadcastToRoom(roomId, {
      type: 'MESSAGE_DELETED',
      roomId,
      messageId,
      isDeleted: true,
    });

    // Find the latest remaining message in room to update last message preview
    const remainingLastMsg = await prisma.chatMessage.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    message.room.participants.forEach((p) => {
      realtimeChat.broadcastToUser(p.userId, {
        type: 'CONVERSATION_UPDATED',
        roomId,
        lastMessage: remainingLastMsg
          ? {
              id: remainingLastMsg.id,
              content: remainingLastMsg.isDeleted ? 'This message was deleted' : remainingLastMsg.content,
              attachmentName: remainingLastMsg.isDeleted ? null : remainingLastMsg.attachmentName,
              senderId: remainingLastMsg.senderId,
              senderName: `${remainingLastMsg.sender.firstName} ${remainingLastMsg.sender.lastName}`.trim(),
              createdAt: remainingLastMsg.createdAt,
              isDeleted: remainingLastMsg.isDeleted,
            }
          : null,
      });
    });

    return { success: true, messageId, isDeleted: true };
  }

  /**
   * 10. Add participants to Group Chat (OWNER ONLY)
   */
  async addParticipants(ctx: TenantContext, roomId: string, memberIds: string[]) {
    if (ctx.role !== 'OWNER') {
      throw new AppError('Only organization owners can add members to a group.', 403, 'OWNER_ONLY_ACTION');
    }

    const room = await prisma.chatRoom.findFirst({
      where: {
        id: roomId,
        organizationId: ctx.organizationId,
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new AppError('Chat room not found.', 404, 'ROOM_NOT_FOUND');
    }

    if (room.type !== ChatRoomType.GROUP) {
      throw new AppError('Participants can only be added to group conversations.', 400, 'NOT_A_GROUP_ROOM');
    }

    // Filter out users already in the room
    const existingUserIds = new Set(room.participants.map((p) => p.userId));
    const newUserIds = Array.from(new Set(memberIds.filter((id) => !existingUserIds.has(id))));

    if (newUserIds.length === 0) {
      return this.formatRoom(room, ctx.userId);
    }

    // Verify all newUserIds belong to this organization
    const validMemberships = await prisma.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: { in: newUserIds },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (validMemberships.length !== newUserIds.length) {
      throw new AppError('One or more selected members are invalid.', 400, 'INVALID_GROUP_MEMBERS');
    }

    // Create participant records
    await prisma.chatParticipant.createMany({
      data: newUserIds.map((userId) => ({
        roomId,
        userId,
      })),
      skipDuplicates: true,
    });

    // Fetch updated room
    const updatedRoom = await prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    const formatted = this.formatRoom(updatedRoom, ctx.userId);

    // Broadcast to existing room participants
    realtimeChat.broadcastToRoom(roomId, {
      type: 'PARTICIPANTS_ADDED',
      roomId,
      addedUsers: validMemberships.map((m) => ({
        userId: m.user.id,
        name: `${m.user.firstName} ${m.user.lastName}`.trim(),
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
      })),
      participantsCount: updatedRoom.participants.length,
      participants: formatted.participants,
    });

    // Broadcast ROOM_CREATED to each newly added user so it immediately pops up in their sidebar
    newUserIds.forEach((uid) => {
      realtimeChat.broadcastToUser(uid, {
        type: 'ROOM_CREATED',
        room: this.formatRoom(updatedRoom, uid),
      });
    });

    return formatted;
  }

  /**
   * 9. Remove participant from Group Chat (OWNER ONLY)
   */
  async removeParticipant(ctx: TenantContext, roomId: string, targetUserId: string) {
    if (ctx.role !== 'OWNER') {
      throw new AppError('Only organization owners can remove members from a group.', 403, 'OWNER_ONLY_ACTION');
    }

    const room = await prisma.chatRoom.findFirst({
      where: {
        id: roomId,
        organizationId: ctx.organizationId,
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!room) {
      throw new AppError('Chat room not found.', 404, 'ROOM_NOT_FOUND');
    }

    if (room.type !== ChatRoomType.GROUP) {
      throw new AppError('Participants can only be removed from group conversations.', 400, 'NOT_A_GROUP_ROOM');
    }

    if (targetUserId === ctx.userId) {
      throw new AppError('The organization owner cannot be removed from the group.', 400, 'CANNOT_REMOVE_SELF');
    }

    const participant = room.participants.find((p) => p.userId === targetUserId);
    if (!participant) {
      throw new AppError('This user is not a participant in this group.', 404, 'PARTICIPANT_NOT_FOUND');
    }

    // Delete participant record
    await prisma.chatParticipant.delete({
      where: {
        roomId_userId: {
          roomId,
          userId: targetUserId,
        },
      },
    });

    // Notify room participants
    realtimeChat.broadcastToRoom(roomId, {
      type: 'PARTICIPANT_REMOVED',
      roomId,
      userId: targetUserId,
      userName: `${participant.user.firstName} ${participant.user.lastName}`.trim(),
    });

    // Notify the removed user specifically
    realtimeChat.broadcastToUser(targetUserId, {
      type: 'REMOVED_FROM_ROOM',
      roomId,
    });

    return {
      success: true,
      message: 'Participant removed successfully.',
      roomId,
      userId: targetUserId,
    };
  }

  /**
   * Helper: Format room data for a specific user
   */
  private formatRoom(room: any, currentUserId: string) {
    if (room.type === ChatRoomType.DIRECT) {
      const otherParticipant = room.participants.find((p: any) => p.userId !== currentUserId) || room.participants[0];
      const otherUser = otherParticipant?.user;

      let otherUserName = otherUser ? `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() : 'Direct Message';
      if (otherUser && otherUser.email && otherUserName.includes(otherUser.email)) {
        otherUserName = otherUserName.replace(otherUser.email, '').trim();
      }
      if (!otherUserName) {
        otherUserName = otherUser?.firstName || otherUser?.email?.split('@')[0] || 'Direct Message';
      }

      return {
        id: room.id,
        type: room.type,
        name: otherUserName,
        avatarUrl: otherUser?.avatarUrl || null,
        otherUserId: otherUser?.id,
        otherUserEmail: otherUser?.email,
        participantsCount: room.participants.length,
        participants: room.participants.map((p: any) => {
          let pName = `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim();
          if (p.user?.email && pName.includes(p.user.email)) {
            pName = pName.replace(p.user.email, '').trim();
          }
          if (!pName) {
            pName = p.user?.firstName || p.user?.email?.split('@')[0] || 'User';
          }
          return {
            userId: p.userId,
            name: pName,
            email: p.user?.email,
            avatarUrl: p.user?.avatarUrl,
          };
        }),
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      };
    }

    return {
      id: room.id,
      type: room.type,
      name: room.name || 'Group Chat',
      description: room.description,
      avatarUrl: room.avatarUrl || null,
      createdById: room.createdById,
      participantsCount: room.participants.length,
      participants: room.participants.map((p: any) => {
        let pName = `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim();
        if (p.user?.email && pName.includes(p.user.email)) {
          pName = pName.replace(p.user.email, '').trim();
        }
        if (!pName) {
          pName = p.user?.firstName || p.user?.email?.split('@')[0] || 'User';
        }
        return {
          userId: p.userId,
          name: pName,
          email: p.user?.email,
          avatarUrl: p.user?.avatarUrl,
        };
      }),
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  /**
   * 11. Get total unread messages count for current user across all rooms in organization
   */
  async getTotalUnreadCount(ctx: { organizationId: string; userId: string; role?: Role }): Promise<{ totalUnread: number }> {
    const userRooms = await prisma.chatParticipant.findMany({
      where: {
        userId: ctx.userId,
        room: {
          organizationId: ctx.organizationId,
        },
      },
      select: {
        roomId: true,
        lastReadAt: true,
      },
    });

    if (userRooms.length === 0) {
      return { totalUnread: 0 };
    }

    let totalUnread = 0;
    for (const r of userRooms) {
      const count = await prisma.chatMessage.count({
        where: {
          roomId: r.roomId,
          senderId: { not: ctx.userId },
          ...(r.lastReadAt ? { createdAt: { gt: r.lastReadAt } } : {}),
          receipts: { none: { userId: ctx.userId } },
        },
      });
      totalUnread += count;
    }

    return { totalUnread };
  }
}

export const chatService = new ChatService();
