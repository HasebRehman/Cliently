import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatService } from '../modules/chat/chat.service.js';
import { prisma } from '../lib/prisma.js';
import { Role, ChatRoomType } from '@prisma/client';
import { TenantContext } from '../types/express.js';

vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    membership: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    chatRoom: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    chatParticipant: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      createMany: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    chatMessageReceipt: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  return { prisma: mockPrisma };
});

describe('Chat Module - Strict Role Permissions, Group Rooms, and Read Receipts', () => {
  const orgId = 'org-123';
  const ownerCtx: TenantContext = { userId: 'owner-1', organizationId: orgId, role: Role.OWNER };
  const memberCtx: TenantContext = { userId: 'member-1', organizationId: orgId, role: Role.MEMBER };
  const clientCtx: TenantContext = { userId: 'client-1', organizationId: orgId, role: Role.CLIENT };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Eligible Contacts Filter', () => {
    it('returns everyone for OWNER (members and clients)', async () => {
      vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([
        { userId: 'member-1', role: Role.MEMBER, user: { id: 'member-1', firstName: 'Bob', lastName: 'Member', email: 'bob@example.com', avatarUrl: null } },
        { userId: 'client-1', role: Role.CLIENT, user: { id: 'client-1', firstName: 'Charlie', lastName: 'Client', email: 'charlie@example.com', avatarUrl: null } },
      ] as any);

      const users = await chatService.getEligibleUsers(ownerCtx);
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.userId)).toEqual(['member-1', 'client-1']);
    });

    it('filters out CLIENTs for MEMBER (MEMBER can only chat with OWNER and MEMBER)', async () => {
      vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([
        { userId: 'owner-1', role: Role.OWNER, user: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner', email: 'alice@example.com', avatarUrl: null } },
        { userId: 'member-2', role: Role.MEMBER, user: { id: 'member-2', firstName: 'Dave', lastName: 'Member', email: 'dave@example.com', avatarUrl: null } },
        { userId: 'client-1', role: Role.CLIENT, user: { id: 'client-1', firstName: 'Charlie', lastName: 'Client', email: 'charlie@example.com', avatarUrl: null } },
      ] as any);

      const users = await chatService.getEligibleUsers(memberCtx);
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.userId)).toEqual(['owner-1', 'member-2']);
      expect(users.find((u) => u.userId === 'client-1')).toBeUndefined();
    });

    it('filters out MEMBERs for CLIENT (CLIENT can only chat with OWNER)', async () => {
      vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([
        { userId: 'owner-1', role: Role.OWNER, user: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner', email: 'alice@example.com', avatarUrl: null } },
        { userId: 'member-1', role: Role.MEMBER, user: { id: 'member-1', firstName: 'Bob', lastName: 'Member', email: 'bob@example.com', avatarUrl: null } },
      ] as any);

      const users = await chatService.getEligibleUsers(clientCtx);
      expect(users).toHaveLength(1);
      expect(users[0].userId).toBe('owner-1');
    });
  });

  describe('1-on-1 Direct Chat Matrix', () => {
    it('allows OWNER to start a direct chat with a CLIENT', async () => {
      vi.mocked(prisma.membership.findFirst).mockResolvedValueOnce({
        userId: 'client-1',
        organizationId: orgId,
        role: Role.CLIENT,
      } as any);

      vi.mocked(prisma.chatRoom.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.chatRoom.create).mockResolvedValueOnce({
        id: 'room-1',
        organizationId: orgId,
        type: ChatRoomType.DIRECT,
        createdById: 'owner-1',
        participants: [
          { userId: 'owner-1', user: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner', email: 'alice@test.com', avatarUrl: null } },
          { userId: 'client-1', user: { id: 'client-1', firstName: 'Charlie', lastName: 'Client', email: 'charlie@test.com', avatarUrl: null } },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const room = await chatService.getOrCreateDirectChat(ownerCtx, {
        targetUserId: 'client-1',
      });

      expect(room).toBeDefined();
      expect(room.type).toBe(ChatRoomType.DIRECT);
      expect(room.participantsCount).toBe(2);
      expect(room.name).toBe('Charlie Client');
    });

    it('blocks MEMBER from starting a direct 1-on-1 chat with a CLIENT', async () => {
      vi.mocked(prisma.membership.findFirst).mockResolvedValueOnce({
        userId: 'client-1',
        organizationId: orgId,
        role: Role.CLIENT,
      } as any);

      await expect(
        chatService.getOrCreateDirectChat(memberCtx, {
          targetUserId: 'client-1',
        })
      ).rejects.toThrow('Team members cannot direct message clients');
    });

    it('blocks CLIENT from starting a direct 1-on-1 chat with a MEMBER', async () => {
      vi.mocked(prisma.membership.findFirst).mockResolvedValueOnce({
        userId: 'member-1',
        organizationId: orgId,
        role: Role.MEMBER,
      } as any);

      await expect(
        chatService.getOrCreateDirectChat(clientCtx, {
          targetUserId: 'member-1',
        })
      ).rejects.toThrow('Clients can only direct message the organization owner');
    });
  });

  describe('Group Chats (Owner Only Creation & Participant Removal)', () => {
    it('allows OWNER to create a group chat with both members and clients', async () => {
      vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([
        { userId: 'owner-1', organizationId: orgId, role: Role.OWNER },
        { userId: 'member-1', organizationId: orgId, role: Role.MEMBER },
        { userId: 'client-1', organizationId: orgId, role: Role.CLIENT },
      ] as any);

      vi.mocked(prisma.chatRoom.create).mockResolvedValueOnce({
        id: 'group-1',
        organizationId: orgId,
        type: ChatRoomType.GROUP,
        name: 'Project Apollo Updates',
        description: 'Collaborative channel',
        createdById: 'owner-1',
        participants: [
          { userId: 'owner-1', user: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner', email: 'alice@test.com', avatarUrl: null } },
          { userId: 'member-1', user: { id: 'member-1', firstName: 'Bob', lastName: 'Member', email: 'bob@test.com', avatarUrl: null } },
          { userId: 'client-1', user: { id: 'client-1', firstName: 'Charlie', lastName: 'Client', email: 'charlie@test.com', avatarUrl: null } },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const group = await chatService.createGroupChat(ownerCtx, {
        name: 'Project Apollo Updates',
        description: 'Collaborative channel',
        memberIds: ['member-1', 'client-1'],
      });

      expect(group).toBeDefined();
      expect(group.type).toBe(ChatRoomType.GROUP);
      expect(group.name).toBe('Project Apollo Updates');
      expect(group.participantsCount).toBe(3);
    });

    it('blocks non-owner from creating group chat', async () => {
      await expect(
        chatService.createGroupChat(memberCtx, {
          name: 'Unauthorized Group',
          memberIds: ['owner-1'],
        })
      ).rejects.toThrow('Only organization owners have permission to create group chats');
    });

    it('allows OWNER to remove a participant from a group', async () => {
      vi.mocked(prisma.chatRoom.findFirst).mockResolvedValueOnce({
        id: 'group-1',
        organizationId: orgId,
        type: ChatRoomType.GROUP,
        participants: [
          { userId: 'owner-1', user: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner' } },
          { userId: 'member-1', user: { id: 'member-1', firstName: 'Bob', lastName: 'Member' } },
        ],
      } as any);

      vi.mocked(prisma.chatParticipant.delete).mockResolvedValueOnce({} as any);

      const result = await chatService.removeParticipant(ownerCtx, 'group-1', 'member-1');
      expect(result.success).toBe(true);
      expect(result.userId).toBe('member-1');
      expect(prisma.chatParticipant.delete).toHaveBeenCalledWith({
        where: { roomId_userId: { roomId: 'group-1', userId: 'member-1' } },
      });
    });

    it('blocks non-owner from removing a participant from a group', async () => {
      await expect(
        chatService.removeParticipant(memberCtx, 'group-1', 'client-1')
      ).rejects.toThrow('Only organization owners can remove members from a group');
    });

    it('blocks owner from removing themselves from a group', async () => {
      vi.mocked(prisma.chatRoom.findFirst).mockResolvedValueOnce({
        id: 'group-1',
        organizationId: orgId,
        type: ChatRoomType.GROUP,
        participants: [
          { userId: 'owner-1', user: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner' } },
        ],
      } as any);

      await expect(
        chatService.removeParticipant(ownerCtx, 'group-1', 'owner-1')
      ).rejects.toThrow('The organization owner cannot be removed from the group');
    });

    it('allows OWNER to add participants to an existing group', async () => {
      vi.mocked(prisma.chatRoom.findFirst).mockResolvedValueOnce({
        id: 'group-1',
        organizationId: orgId,
        type: ChatRoomType.GROUP,
        participants: [
          { userId: 'owner-1', user: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner' } },
        ],
      } as any);

      vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([
        { userId: 'member-2', role: Role.MEMBER, user: { id: 'member-2', firstName: 'Charlie', lastName: 'Dev', email: 'charlie@example.com' } },
      ] as any);

      vi.mocked(prisma.chatParticipant.createMany).mockResolvedValueOnce({ count: 1 });

      vi.mocked(prisma.chatRoom.findUniqueOrThrow).mockResolvedValueOnce({
        id: 'group-1',
        organizationId: orgId,
        type: ChatRoomType.GROUP,
        participants: [
          { userId: 'owner-1', user: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner', email: 'alice@example.com' } },
          { userId: 'member-2', user: { id: 'member-2', firstName: 'Charlie', lastName: 'Dev', email: 'charlie@example.com' } },
        ],
      } as any);

      const result = await chatService.addParticipants(ownerCtx, 'group-1', ['member-2']);
      expect(result.id).toBe('group-1');
      expect(result.participants.length).toBe(2);
    });

    it('blocks non-owner from adding participants to a group', async () => {
      await expect(
        chatService.addParticipants(memberCtx, 'group-1', ['client-1'])
      ).rejects.toThrow('Only organization owners can add members to a group');
    });
  });

  describe('Message Deletion', () => {
    it('allows user to delete their own message (WhatsApp style soft delete)', async () => {
      vi.mocked(prisma.chatParticipant.findUnique).mockResolvedValueOnce({
        roomId: 'room-1',
        userId: 'member-1',
      } as any);

      vi.mocked(prisma.chatMessage.findFirst).mockResolvedValueOnce({
        id: 'msg-1',
        roomId: 'room-1',
        senderId: 'member-1',
        room: { participants: [{ userId: 'member-1' }] },
      } as any);

      vi.mocked(prisma.chatMessage.update).mockResolvedValueOnce({
        id: 'msg-1',
        roomId: 'room-1',
        senderId: 'member-1',
        isDeleted: true,
      } as any);
      vi.mocked(prisma.chatMessage.findFirst).mockResolvedValueOnce(null);

      const result = await chatService.deleteMessage(memberCtx, 'room-1', 'msg-1');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-1');
      expect(prisma.chatMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1' },
          data: expect.objectContaining({ isDeleted: true, content: null }),
        })
      );
    });

    it('blocks user from deleting another user message', async () => {
      vi.mocked(prisma.chatParticipant.findUnique).mockResolvedValueOnce({
        roomId: 'room-1',
        userId: 'member-1',
      } as any);

      vi.mocked(prisma.chatMessage.findFirst).mockResolvedValueOnce({
        id: 'msg-2',
        roomId: 'room-1',
        senderId: 'owner-1', // Message belongs to Owner, not Member
        room: { participants: [{ userId: 'member-1' }, { userId: 'owner-1' }] },
      } as any);

      await expect(
        chatService.deleteMessage(memberCtx, 'room-1', 'msg-2')
      ).rejects.toThrow('You can only delete your own messages');
    });
  });

  describe('WhatsApp Double Ticks & Read Receipts', () => {
    it('returns double grey tick initially (isRead = false) and double blue tick (isRead = true) when receipts are recorded', async () => {
      vi.mocked(prisma.chatParticipant.findUnique).mockResolvedValueOnce({
        roomId: 'room-1',
        userId: 'owner-1',
      } as any);

      vi.mocked(prisma.chatRoom.findUniqueOrThrow).mockResolvedValueOnce({
        id: 'room-1',
        participants: [
          { userId: 'owner-1' },
          { userId: 'client-1' },
        ],
      } as any);

      // Unread message from owner to client (no receipts)
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValueOnce([
        {
          id: 'msg-1',
          roomId: 'room-1',
          senderId: 'owner-1',
          content: 'Hello client!',
          attachmentUrl: null,
          attachmentName: null,
          attachmentType: null,
          attachmentSize: null,
          createdAt: new Date(),
          sender: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner', avatarUrl: null },
          receipts: [], // Not read yet
        },
      ] as any);

      const unreadResult = await chatService.getMessages(ownerCtx, 'room-1', { limit: 50 });
      expect(unreadResult.messages[0].isRead).toBe(false); // Double grey tick

      // Now with client's read receipt
      vi.mocked(prisma.chatParticipant.findUnique).mockResolvedValueOnce({
        roomId: 'room-1',
        userId: 'owner-1',
      } as any);

      vi.mocked(prisma.chatRoom.findUniqueOrThrow).mockResolvedValueOnce({
        id: 'room-1',
        participants: [
          { userId: 'owner-1' },
          { userId: 'client-1' },
        ],
      } as any);

      vi.mocked(prisma.chatMessage.findMany).mockResolvedValueOnce([
        {
          id: 'msg-1',
          roomId: 'room-1',
          senderId: 'owner-1',
          content: 'Hello client!',
          attachmentUrl: null,
          attachmentName: null,
          attachmentType: null,
          attachmentSize: null,
          createdAt: new Date(),
          sender: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner', avatarUrl: null },
          receipts: [{ userId: 'client-1', readAt: new Date() }], // Read receipt recorded
        },
      ] as any);

      const readResult = await chatService.getMessages(ownerCtx, 'room-1', { limit: 50 });
      expect(readResult.messages[0].isRead).toBe(true); // Double blue tick!
    });
  });
});
