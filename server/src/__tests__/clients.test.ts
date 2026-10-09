import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { Role, ClientStatus, SubscriptionPlan } from '@prisma/client';
import { resolveClientPortalScope } from '../utils/tenantHelper.js';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    refreshToken: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
    client: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    invoice: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    invite: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUniqueOrThrow: vi.fn(),
    },
    activityLog: {
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

describe('Phase 3 - Clients Module & Strict Tenant Isolation', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Default session mocks
    (prisma.refreshToken.findUnique as any).mockImplementation(({ where }: any) => {
      return Promise.resolve({
        id: where.id,
        userId: where.id === 'sess-owner' ? 'user-owner-1' : where.id === 'sess-member' ? 'user-member-2' : 'user-client-3',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
    });

    // Default memberships
    (prisma.membership.findUnique as any).mockImplementation(({ where }: any) => {
      const { userId, organizationId } = where.userId_organizationId;
      if (organizationId !== orgId) return Promise.resolve(null);
      if (userId === 'user-owner-1') return Promise.resolve({ userId, organizationId: orgId, role: Role.OWNER });
      if (userId === 'user-member-2') return Promise.resolve({ userId, organizationId: orgId, role: Role.MEMBER });
      if (userId === 'user-client-3') return Promise.resolve({ userId, organizationId: orgId, role: Role.CLIENT });
      return Promise.resolve(null);
    });

    // Default subscription: FREE
    (prisma.subscription.findUnique as any).mockResolvedValue({
      plan: SubscriptionPlan.FREE,
      status: 'ACTIVE',
    });

    // Default organization update
    (prisma.organization.update as any).mockResolvedValue({ id: orgId });
  });

  describe('Strict Tenant Scoping & Existence Leakage', () => {
    it('returns 404 (not 403) when accessing a client that belongs to another organization', async () => {
      (prisma.client.findFirst as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/clients/client-from-other-org')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLIENT_NOT_FOUND');
      expect(prisma.client.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'client-from-other-org',
            organizationId: orgId,
          },
        })
      );
    });

    it('rejects unknown fields like organizationId in request body (Zod .strict())', async () => {
      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Acme Corp',
          email: 'acme@example.com',
          organizationId: 'malicious-org-id',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Plan Limits Enforcement (FREE vs PRO) & Concurrency', () => {
    it('2 existing clients + 5 parallel creates => exactly 1 succeeds', async () => {
      (prisma.client.findFirst as any).mockResolvedValue(null);

      let activeClientsCount = 2;
      (prisma.client.count as any).mockImplementation(() => Promise.resolve(activeClientsCount));

      (prisma.client.create as any).mockImplementation(({ data }: any) => {
        activeClientsCount++;
        return Promise.resolve({
          id: `client-${data.name}`,
          name: data.name,
          email: data.email,
          status: ClientStatus.ACTIVE,
        });
      });

      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/v1/clients')
          .set('Authorization', `Bearer ${ownerToken}`)
          .set('X-Organization-Id', orgId)
          .send({
            name: `Parallel Client ${i + 1}`,
            email: `client${i + 1}@parallel.com`,
          })
      );

      const responses = await Promise.all(requests);
      const successful = responses.filter((r) => r.status === 201);
      const rejected = responses.filter((r) => r.status === 403);

      expect(successful.length).toBe(1);
      expect(rejected.length).toBe(4);
      expect(rejected[0].body.error.code).toBe('PLAN_LIMIT_REACHED');
    });

    it('un-archiving/re-activating a client enforces plan limits under row lock', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'client-archived-1',
        name: 'Archived Client',
        email: 'archived@example.com',
        status: ClientStatus.ARCHIVED,
        organizationId: orgId,
      });

      // Active clients already at maximum (3)
      (prisma.client.count as any).mockResolvedValue(3);

      const res = await request(app)
        .patch('/api/v1/clients/client-archived-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          status: ClientStatus.ACTIVE,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PLAN_LIMIT_REACHED');
    });

    it('allows client creation when count is below limit on FREE plan', async () => {
      (prisma.client.count as any).mockResolvedValue(2);
      (prisma.client.findFirst as any).mockResolvedValue(null);
      (prisma.client.create as any).mockResolvedValue({
        id: 'client-new-1',
        name: 'Third Client',
        email: 'third@example.com',
        status: ClientStatus.ACTIVE,
      });

      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Third Client',
          email: 'third@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('client-new-1');
    });

    it('allows unlimited client creation on PRO plan', async () => {
      (prisma.subscription.findUnique as any).mockResolvedValue({
        plan: SubscriptionPlan.PRO,
        status: 'ACTIVE',
      });
      (prisma.client.count as any).mockResolvedValue(50);
      (prisma.client.findFirst as any).mockResolvedValue(null);
      (prisma.client.create as any).mockResolvedValue({
        id: 'client-new-pro',
        name: 'Client 51',
        email: 'c51@example.com',
        status: ClientStatus.ACTIVE,
      });

      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Client 51',
          email: 'c51@example.com',
        });

      expect(res.status).toBe(201);
    });
  });

  describe('Duplicate Email Handling & Case Insensitivity', () => {
    it('rejects client creation if email matches existing in SAME organization (A@x.com vs a@x.com)', async () => {
      (prisma.client.count as any).mockResolvedValue(1);
      (prisma.client.findFirst as any).mockImplementation(({ where }: any) => {
        if (where.email === 'duplicate@example.com') {
          return Promise.resolve({
            id: 'client-existing',
            email: 'duplicate@example.com',
          });
        }
        return Promise.resolve(null);
      });

      // Submit uppercase variant
      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Duplicate Client',
          email: '  Duplicate@Example.COM  ',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_CLIENT_EMAIL');
    });
  });

  describe('Portal Client Isolation & clientScope', () => {
    it('portal-invited CLIENT user is linked to the exact Client and cannot read another client data in the same org', async () => {
      const mockPrismaClient = {
        client: {
          findFirst: vi.fn().mockImplementation(({ where }: any) => {
            if (where.userId === 'user-client-3' && where.organizationId === orgId) {
              return Promise.resolve({ id: 'client-linked-exact' });
            }
            return Promise.resolve(null);
          }),
        },
      };

      const scope = await resolveClientPortalScope(mockPrismaClient, {
        userId: 'user-client-3',
        organizationId: orgId,
        role: Role.CLIENT,
      });

      expect(scope.organizationId).toBe(orgId);
      expect(scope.clientId).toBe('client-linked-exact');

      // Attempting to resolve for an unlinked user throws 403
      await expect(
        resolveClientPortalScope(mockPrismaClient, {
          userId: 'user-unlinked-attacker',
          organizationId: orgId,
          role: Role.CLIENT,
        })
      ).rejects.toThrow();
    });
  });

  describe('ActivityLog Sanitization', () => {
    it('ActivityLog records only ids and changed field names, never tokens or full bodies', async () => {
      (prisma.client.count as any).mockResolvedValue(1);
      (prisma.client.findFirst as any).mockResolvedValue(null);
      (prisma.client.create as any).mockResolvedValue({
        id: 'client-act-1',
        name: 'Logged Client',
        email: 'logged@example.com',
        status: ClientStatus.ACTIVE,
      });

      await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Logged Client',
          email: 'logged@example.com',
          company: 'Secret Corp',
        });

      expect(prisma.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            userId: 'user-owner-1',
            action: 'CLIENT_CREATED',
            entity: 'CLIENT',
            entityId: 'client-act-1',
            metadata: {
              clientId: 'client-act-1',
              changedFields: ['name', 'email', 'company'],
            },
          }),
        })
      );
    });
  });

  describe('Role-Based Access Control', () => {
    it('allows MEMBER role to view and list clients', async () => {
      (prisma.client.count as any).mockResolvedValue(1);
      (prisma.client.findMany as any).mockResolvedValue([
        {
          id: 'client-member-view',
          name: 'Member Client',
          email: 'memberclient@example.com',
          status: ClientStatus.ACTIVE,
          _count: { projects: 0 },
          createdAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('blocks MEMBER role from creating, updating, or deleting a client (OWNER only)', async () => {
      const createRes = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Member Client',
          email: 'memberclient@example.com',
        });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error.code).toBe('FORBIDDEN_ROLE');

      const updateRes = await request(app)
        .patch('/api/v1/clients/client-123')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId)
        .send({ name: 'Hacked Name' });

      expect(updateRes.status).toBe(403);
      expect(updateRes.body.error.code).toBe('FORBIDDEN_ROLE');

      const deleteRes = await request(app)
        .delete('/api/v1/clients/client-123')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId);

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('blocks CLIENT role from accessing client endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('Soft Archive vs Hard Delete (Two-Stage Lifecycle)', () => {
    it('archives active client (status: ARCHIVED) on first delete', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'client-active',
        name: 'Active Client',
        status: ClientStatus.ACTIVE,
        organizationId: orgId,
        _count: { invoices: 3 },
      });
      (prisma.client.update as any).mockResolvedValue({
        id: 'client-active',
        status: ClientStatus.ARCHIVED,
      });

      const res = await request(app)
        .delete('/api/v1/clients/client-active')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('ARCHIVED');
      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-active' },
          data: { status: 'ARCHIVED' },
        })
      );
      expect(prisma.client.delete).not.toHaveBeenCalled();
    });

    it('permanently deletes client when already in ARCHIVED status', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'client-archived',
        name: 'Archived Client',
        email: 'archived@example.com',
        status: ClientStatus.ARCHIVED,
        organizationId: orgId,
        _count: { invoices: 0 },
      });
      (prisma.client.delete as any).mockResolvedValue({
        id: 'client-archived',
      });

      const res = await request(app)
        .delete('/api/v1/clients/client-archived')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('DELETED');
      expect(prisma.client.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-archived' },
        })
      );
    });
  });

  describe('Client Portal Invitations', () => {
    it('generates portal invite for a client with role CLIENT', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'client-portal-target',
        name: 'Portal Client',
        email: 'portal@target.com',
        organizationId: orgId,
        userId: null,
      });
      (prisma.invite.create as any).mockResolvedValue({
        id: 'invite-portal-1',
        email: 'portal@target.com',
        role: Role.CLIENT,
        expiresAt: new Date(),
      });
      (prisma.organization.findUniqueOrThrow as any).mockResolvedValue({ name: 'Acme Org' });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue({ firstName: 'John', lastName: 'Doe' });

      const res = await request(app)
        .post('/api/v1/clients/client-portal-target/portal-invite')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.invite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'portal@target.com',
            role: Role.CLIENT,
          }),
        })
      );
    });
  });
});
