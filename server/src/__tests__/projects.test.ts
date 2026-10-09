import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { Role, ProjectStatus } from '@prisma/client';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    refreshToken: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    invoice: {
      groupBy: vi.fn(),
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

describe('Phase 3 - Projects Module & IDOR Prevention', () => {
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
  });

  describe('IDOR Prevention on Client Association', () => {
    it('rejects project creation if clientId belongs to another tenant or does not exist (returns 404)', async () => {
      // client lookup scoped by organizationId returns null
      (prisma.client.findFirst as any).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Website Redesign',
          clientId: 'client-from-other-org',
        });

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
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it('rejects project update if target clientId belongs to another organization (returns 404)', async () => {
      (prisma.project.findFirst as any).mockResolvedValue({
        id: 'proj-123',
        organizationId: orgId,
        clientId: 'client-own-1',
      });
      // Target client lookup fails across tenant
      (prisma.client.findFirst as any).mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/v1/projects/proj-123')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          clientId: 'malicious-other-tenant-client',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLIENT_NOT_FOUND');
    });
  });

  describe('Project CRUD & Strict Tenant Isolation', () => {
    it('creates project successfully when client belongs to active tenant', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'client-own-1',
        name: 'In-Org Client',
        organizationId: orgId,
      });

      (prisma.project.create as any).mockResolvedValue({
        id: 'proj-1',
        name: 'Mobile App',
        organizationId: orgId,
        clientId: 'client-own-1',
        status: ProjectStatus.ACTIVE,
        client: {
          id: 'client-own-1',
          name: 'In-Org Client',
          email: 'client@example.com',
        },
      });

      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Mobile App',
          clientId: 'client-own-1',
          budget: 5000,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('proj-1');
      expect(prisma.activityLog.create).toHaveBeenCalled();
    });

    it('returns 404 when requesting a project from another organization', async () => {
      (prisma.project.findFirst as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/projects/proj-foreign-tenant')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('rejects unknown fields in project body (Zod .strict())', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Test Project',
          clientId: 'client-1',
          organizationId: 'injected-org',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Financial Totals Calculation', () => {
    it('aggregates project invoice financial summary correctly', async () => {
      (prisma.project.findFirst as any).mockResolvedValue({
        id: 'proj-1',
        name: 'API Development',
        organizationId: orgId,
        budget: '10000',
        client: { id: 'client-1', name: 'Acme' },
        invoices: [
          { id: 'inv-1', number: 'INV-001', total: '3000', status: 'PAID' },
          { id: 'inv-2', number: 'INV-002', total: '2000', status: 'SENT' },
        ],
      });

      (prisma.invoice.groupBy as any).mockResolvedValue([
        { status: 'PAID', _sum: { total: '3000' } },
        { status: 'SENT', _sum: { total: '2000' } },
      ]);

      const res = await request(app)
        .get('/api/v1/projects/proj-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.totalBilled).toBe(5000);
      expect(res.body.data.summary.totalPaid).toBe(3000);
      expect(res.body.data.summary.totalPending).toBe(2000);
    });
  });

  describe('Project Deletion Safeguards', () => {
    it('project with invoices cannot be deleted', async () => {
      (prisma.project.findFirst as any).mockResolvedValue({
        id: 'proj-with-invoices',
        name: 'Active Project',
        organizationId: orgId,
        _count: { invoices: 2 },
      });

      const res = await request(app)
        .delete('/api/v1/projects/proj-with-invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROJECT_HAS_INVOICES');
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });
  });

  describe('Role-Based Access Control', () => {
    it('allows MEMBER role to create and update projects', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({ id: 'client-1', organizationId: orgId });
      (prisma.project.create as any).mockResolvedValue({
        id: 'proj-by-member',
        name: 'Member Proj',
      });

      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          name: 'Member Proj',
          clientId: 'client-1',
        });

      expect(res.status).toBe(201);
    });

    it('blocks MEMBER from deleting a project (OWNER only)', async () => {
      const res = await request(app)
        .delete('/api/v1/projects/proj-123')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('blocks CLIENT role from project mutating endpoints (POST, PATCH, DELETE)', async () => {
      const createRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId)
        .send({ name: 'Malicious Project', clientId: 'cli-1' });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error.code).toBe('FORBIDDEN_ROLE');

      const updateRes = await request(app)
        .patch('/api/v1/projects/proj-1')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId)
        .send({ name: 'Updated Name' });

      expect(updateRes.status).toBe(403);
      expect(updateRes.body.error.code).toBe('FORBIDDEN_ROLE');

      const deleteRes = await request(app)
        .delete('/api/v1/projects/proj-1')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId);

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('allows CLIENT role to list their own projects scoped by client record', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'cli-client-1',
        organizationId: orgId,
        userId: 'user-client-3',
      });

      (prisma.project.count as any).mockResolvedValue(1);
      (prisma.project.findMany as any).mockResolvedValue([
        {
          id: 'proj-1',
          organizationId: orgId,
          clientId: 'cli-client-1',
          name: 'Client Project Alpha',
          description: null,
          status: ProjectStatus.ACTIVE,
          budget: '5000',
          deadline: new Date(),
          client: { id: 'cli-client-1', name: 'Client User', email: 'client@example.com', company: null },
          _count: { invoices: 2 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].clientId).toBe('cli-client-1');
    });
  });
});
