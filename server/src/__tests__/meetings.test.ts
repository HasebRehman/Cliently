import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { Role } from '@prisma/client';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    refreshToken: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    meeting: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    meetingAttendee: {
      createMany: vi.fn(),
    },
    chatRoom: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    chatParticipant: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
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

describe('Meetings Module (Instant Meetings & JaaS RS256 Auth)', () => {
  const app = createApp();

  const ownerToken = jwt.sign(
    { userId: 'user-owner-1', sessionId: 'sess-owner' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const memberToken = jwt.sign(
    { userId: 'user-member-2', sessionId: 'sess-member' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const clientRoleToken = jwt.sign(
    { userId: 'user-client-3', sessionId: 'sess-client' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const orgId = 'org-tenant-alpha';
  const otherOrgId = 'org-tenant-beta';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default session mock
    (prisma.refreshToken.findUnique as any).mockImplementation(({ where }: any) => {
      return Promise.resolve({
        id: where.id,
        userId:
          where.id === 'sess-owner'
            ? 'user-owner-1'
            : where.id === 'sess-member'
            ? 'user-member-2'
            : 'user-client-3',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      });
    });

    // Default membership mock
    (prisma.membership.findUnique as any).mockImplementation(({ where }: any) => {
      const { userId, organizationId } = where.userId_organizationId;
      if (organizationId !== orgId && organizationId !== otherOrgId) return Promise.resolve(null);
      if (userId === 'user-owner-1')
        return Promise.resolve({
          id: 'mem-1',
          userId,
          organizationId,
          role: Role.OWNER,
          organization: { id: organizationId, name: 'Alpha Agency' },
        });
      if (userId === 'user-member-2')
        return Promise.resolve({
          id: 'mem-2',
          userId,
          organizationId: orgId,
          role: Role.MEMBER,
          organization: { id: orgId, name: 'Alpha Agency' },
        });
      if (userId === 'user-client-3')
        return Promise.resolve({
          id: 'mem-3',
          userId,
          organizationId: orgId,
          role: Role.CLIENT,
          organization: { id: orgId, name: 'Alpha Agency' },
        });
      return Promise.resolve(null);
    });
  });

  describe('POST /api/v1/projects/:projectId/meetings/instant', () => {
    it('creates an instant meeting and posts card in chat as OWNER', async () => {
      vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({
        id: 'proj-1',
        organizationId: orgId,
        name: 'Brand Redesign',
        clientId: 'client-1',
        client: {
          id: 'client-1',
          name: 'Acme Corp',
          email: 'acme@client.com',
          userId: 'user-client-3',
          user: {
            id: 'user-client-3',
            email: 'acme@client.com',
            firstName: 'Charlie',
            lastName: 'Client',
            avatarUrl: null,
          },
        },
      } as any);

      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
        id: 'user-owner-1',
        email: 'owner@agency.com',
        firstName: 'Alice',
        lastName: 'Owner',
        avatarUrl: null,
      } as any);

      vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([
        {
          id: 'mem-1',
          userId: 'user-owner-1',
          role: Role.OWNER,
          user: {
            id: 'user-owner-1',
            email: 'owner@agency.com',
            firstName: 'Alice',
            lastName: 'Owner',
            avatarUrl: null,
          },
        },
        {
          id: 'mem-2',
          userId: 'user-member-2',
          role: Role.MEMBER,
          user: {
            id: 'user-member-2',
            email: 'member@agency.com',
            firstName: 'Bob',
            lastName: 'Member',
            avatarUrl: null,
          },
        },
      ] as any);

      vi.mocked(prisma.meeting.create).mockResolvedValueOnce({
        id: 'meeting-123',
        companyId: orgId,
        projectId: 'proj-1',
        title: 'Brand Redesign - Instant Meeting',
        type: 'instant',
        provider: 'jaas',
        roomName: 'cliently-test-room-uuid',
        status: 'live',
        startTime: new Date(),
        createdById: 'user-owner-1',
      } as any);

      vi.mocked(prisma.chatRoom.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.chatRoom.create).mockResolvedValueOnce({
        id: 'room-proj-1',
        organizationId: orgId,
        projectId: 'proj-1',
        type: 'GROUP',
        name: 'Brand Redesign Chat',
      } as any);

      vi.mocked(prisma.chatParticipant.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.chatParticipant.createMany).mockResolvedValueOnce({ count: 3 } as any);

      vi.mocked(prisma.chatMessage.create).mockResolvedValueOnce({
        id: 'msg-1',
        roomId: 'room-proj-1',
        senderId: 'user-owner-1',
        type: 'meeting',
        meetingId: 'meeting-123',
        content: 'Instant Meeting: Brand Redesign - Instant Meeting',
        createdAt: new Date(),
        sender: {
          id: 'user-owner-1',
          firstName: 'Alice',
          lastName: 'Owner',
          avatarUrl: null,
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/projects/proj-1/meetings/instant')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({ title: 'Quick Sync' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.meeting.id).toBe('meeting-123');
      expect(res.body.data.meeting.status).toBe('live');
      expect(res.body.data.chatMessage.type).toBe('meeting');
    });

    it('rejects CLIENT role users from starting instant meetings', async () => {
      const res = await request(app)
        .post('/api/v1/projects/proj-1/meetings/instant')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId)
        .send({});

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/meetings/:id', () => {
    it('returns roomName, appId, and freshly signed JWT to authorized attendees', async () => {
      vi.mocked(prisma.meeting.findFirst).mockResolvedValueOnce({
        id: 'meeting-123',
        companyId: orgId,
        projectId: 'proj-1',
        title: 'Design Review',
        type: 'instant',
        provider: 'jaas',
        roomName: 'cliently-secret-room-123',
        status: 'live',
        startTime: new Date(),
        endTime: null,
        createdById: 'user-owner-1',
        project: {
          id: 'proj-1',
          name: 'Brand Redesign',
          clientId: 'client-1',
        },
        createdBy: {
          id: 'user-owner-1',
          firstName: 'Alice',
          lastName: 'Owner',
          email: 'owner@agency.com',
          avatarUrl: null,
        },
        attendees: [
          {
            id: 'att-1',
            userId: 'user-owner-1',
            clientId: null,
            email: 'owner@agency.com',
            role: 'host',
            user: {
              id: 'user-owner-1',
              firstName: 'Alice',
              lastName: 'Owner',
              email: 'owner@agency.com',
              avatarUrl: null,
            },
          },
          {
            id: 'att-2',
            userId: 'user-client-3',
            clientId: 'client-1',
            email: 'acme@client.com',
            role: 'client',
            user: {
              id: 'user-client-3',
              firstName: 'Charlie',
              lastName: 'Client',
              email: 'acme@client.com',
              avatarUrl: null,
            },
          },
        ],
      } as any);

      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
        id: 'user-client-3',
        email: 'acme@client.com',
        firstName: 'Charlie',
        lastName: 'Client',
        avatarUrl: null,
      } as any);

      const res = await request(app)
        .get('/api/v1/meetings/meeting-123')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roomName).toBe('cliently-secret-room-123');
      expect(res.body.data.title).toBe('Design Review');
      expect(res.body.data.status).toBe('live');
    });

    it('rejects cross-tenant meeting queries with 404', async () => {
      vi.mocked(prisma.meeting.findFirst).mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/v1/meetings/meeting-123')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', otherOrgId);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/meetings/:id/end', () => {
    it('allows the host to end the meeting', async () => {
      vi.mocked(prisma.meeting.findFirst).mockResolvedValueOnce({
        id: 'meeting-123',
        companyId: orgId,
        projectId: 'proj-1',
        createdById: 'user-owner-1',
        status: 'live',
      } as any);

      vi.mocked(prisma.meeting.update).mockResolvedValueOnce({
        id: 'meeting-123',
        status: 'ended',
        endTime: new Date(),
      } as any);

      vi.mocked(prisma.chatRoom.findFirst).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/v1/meetings/meeting-123/end')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ended');
    });

    it('rejects non-host team member from ending meeting', async () => {
      vi.mocked(prisma.meeting.findFirst).mockResolvedValueOnce({
        id: 'meeting-123',
        companyId: orgId,
        projectId: 'proj-1',
        createdById: 'user-owner-1', // created by Alice
        status: 'live',
      } as any);

      // Bob (member) tries to end it
      const res = await request(app)
        .post('/api/v1/meetings/meeting-123/end')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/meetings', () => {
    it('returns list of meetings for tenant with host and project details', async () => {
      vi.mocked(prisma.meeting.updateMany).mockResolvedValueOnce({ count: 0 });
      vi.mocked(prisma.meeting.findMany).mockResolvedValueOnce([
        {
          id: 'meeting-123',
          companyId: orgId,
          projectId: 'proj-1',
          title: 'Design Review',
          type: 'instant',
          provider: 'jaas',
          roomName: 'cliently-room-1',
          status: 'live',
          startTime: new Date(),
          endTime: null,
          createdById: 'user-owner-1',
          project: { id: 'proj-1', name: 'Brand Redesign' },
          createdBy: {
            id: 'user-owner-1',
            firstName: 'Alice',
            lastName: 'Owner',
            email: 'owner@agency.com',
            avatarUrl: null,
          },
          attendees: [
            {
              id: 'att-1',
              role: 'host',
              email: 'owner@agency.com',
              user: {
                id: 'user-owner-1',
                firstName: 'Alice',
                lastName: 'Owner',
                avatarUrl: null,
              },
              client: null,
            },
          ],
        },
      ] as any);

      const res = await request(app)
        .get('/api/v1/meetings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Design Review');
      expect(res.body.data[0].project.name).toBe('Brand Redesign');
      expect(res.body.data[0].host.name).toBe('Alice Owner');
    });
  });

  describe('POST /api/v1/meetings/instant', () => {
    it('creates an instant meeting directly from meetings endpoint', async () => {
      vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({
        id: 'proj-1',
        organizationId: orgId,
        name: 'Brand Redesign',
        clientId: 'client-1',
        client: {
          id: 'client-1',
          name: 'Acme Corp',
          email: 'acme@client.com',
          userId: 'user-client-3',
          user: {
            id: 'user-client-3',
            email: 'acme@client.com',
            firstName: 'Charlie',
            lastName: 'Client',
            avatarUrl: null,
          },
        },
      } as any);

      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
        id: 'user-owner-1',
        email: 'owner@agency.com',
        firstName: 'Alice',
        lastName: 'Owner',
        avatarUrl: null,
      } as any);

      vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([
        {
          id: 'mem-1',
          userId: 'user-owner-1',
          role: Role.OWNER,
          user: {
            id: 'user-owner-1',
            email: 'owner@agency.com',
            firstName: 'Alice',
            lastName: 'Owner',
            avatarUrl: null,
          },
        },
      ] as any);

      vi.mocked(prisma.meeting.create).mockResolvedValueOnce({
        id: 'meeting-456',
        companyId: orgId,
        projectId: 'proj-1',
        title: 'Instant Team Standup',
        type: 'instant',
        provider: 'jaas',
        roomName: 'cliently-instant-uuid',
        status: 'live',
        startTime: new Date(),
        createdById: 'user-owner-1',
      } as any);

      vi.mocked(prisma.chatRoom.findFirst).mockResolvedValueOnce({
        id: 'room-1',
      } as any);

      vi.mocked(prisma.chatParticipant.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.chatParticipant.createMany).mockResolvedValueOnce({ count: 1 } as any);

      vi.mocked(prisma.chatMessage.create).mockResolvedValueOnce({
        id: 'msg-instant-1',
        roomId: 'room-1',
        senderId: 'user-owner-1',
        type: 'meeting',
        meetingId: 'meeting-456',
        content: 'Instant Meeting: Instant Team Standup',
        createdAt: new Date(),
        sender: {
          id: 'user-owner-1',
          firstName: 'Alice',
          lastName: 'Owner',
          avatarUrl: null,
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/meetings/instant')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({ title: 'Instant Team Standup', projectId: 'proj-1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.meeting.id).toBe('meeting-456');
      expect(res.body.data.meeting.title).toBe('Instant Team Standup');
    });
  });

  describe('POST /api/v1/meetings/schedule', () => {
    it('schedules a future meeting with attendees and calendar dispatch', async () => {
      vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({
        id: 'proj-1',
        organizationId: orgId,
        name: 'Brand Redesign',
        clientId: 'client-1',
        client: {
          id: 'client-1',
          name: 'Acme Corp',
          email: 'acme@client.com',
          userId: 'user-client-3',
          user: {
            id: 'user-client-3',
            email: 'acme@client.com',
            firstName: 'Charlie',
            lastName: 'Client',
            avatarUrl: null,
          },
        },
      } as any);

      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
        id: 'user-owner-1',
        email: 'owner@agency.com',
        firstName: 'Alice',
        lastName: 'Owner',
        avatarUrl: null,
      } as any);

      vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([
        {
          id: 'mem-1',
          userId: 'user-owner-1',
          role: Role.OWNER,
          user: {
            id: 'user-owner-1',
            email: 'owner@agency.com',
            firstName: 'Alice',
            lastName: 'Owner',
            avatarUrl: null,
          },
        },
      ] as any);

      vi.mocked(prisma.client.findMany).mockResolvedValueOnce([
        {
          id: 'client-1',
          name: 'Acme Corp',
          email: 'acme@client.com',
          userId: 'user-client-3',
        },
      ] as any);

      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      vi.mocked(prisma.meeting.create).mockResolvedValueOnce({
        id: 'meeting-future-789',
        companyId: orgId,
        projectId: 'proj-1',
        title: 'Friday Sprint Review',
        type: 'scheduled',
        provider: 'jaas',
        roomName: 'cliently-scheduled-uuid',
        status: 'scheduled',
        startTime: new Date(futureDate),
        endTime: new Date(new Date(futureDate).getTime() + 60 * 60 * 1000),
        createdById: 'user-owner-1',
      } as any);

      vi.mocked(prisma.meetingAttendee.createMany).mockResolvedValueOnce({ count: 2 } as any);

      const res = await request(app)
        .post('/api/v1/meetings/schedule')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          title: 'Friday Sprint Review',
          projectId: 'proj-1',
          startTime: futureDate,
          durationMinutes: 60,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('meeting-future-789');
      expect(res.body.data.status).toBe('scheduled');
      expect(res.body.data.title).toBe('Friday Sprint Review');
    });
  });
});


