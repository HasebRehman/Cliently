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
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

describe('Phase 2 Tenant Context, Role Middleware, and Last OWNER Safeguards', () => {
  const app = createApp();

  const userToken = jwt.sign(
    { userId: 'user-alice-123', sessionId: 'sess-1' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // Default active session in mock
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      id: 'sess-1',
      userId: 'user-alice-123',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });
  });

  describe('Tenant Context & Isolation', () => {
    it('rejects requests without X-Organization-Id header with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ORGANIZATION_ID_REQUIRED');
    });

    it('rejects access if user is NOT a member of the requested organization with 403 Forbidden', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-forbidden-456');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_TENANT_ACCESS');
    });

    it('allows access when user has valid membership in the requested organization', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue({
        userId: 'user-alice-123',
        organizationId: 'org-allowed-123',
        role: Role.MEMBER,
      });

      (prisma.organization.findUnique as any).mockResolvedValue({
        id: 'org-allowed-123',
        name: 'Allowed Studio',
        slug: 'allowed-studio',
        defaultTaxRate: 0,
        _count: { memberships: 2, clients: 5, projects: 1, invoices: 3 },
      });

      const res = await request(app)
        .get('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-allowed-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('org-allowed-123');
    });
  });

  describe('Role-Based Authorization & CLIENT Role Restrictions', () => {
    it('forbids a CLIENT from accessing organization settings, members list, or invites list', async () => {
      // User is a CLIENT role in this organization
      (prisma.membership.findUnique as any).mockResolvedValue({
        userId: 'user-alice-123',
        organizationId: 'org-123',
        role: Role.CLIENT,
      });

      // 1. GET /organizations/current
      const resOrg = await request(app)
        .get('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123');

      expect(resOrg.status).toBe(403);
      expect(resOrg.body.error.code).toBe('FORBIDDEN_ROLE');

      // 2. GET /members
      const resMembers = await request(app)
        .get('/api/v1/members')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123');

      expect(resMembers.status).toBe(403);
      expect(resMembers.body.error.code).toBe('FORBIDDEN_ROLE');

      // 3. GET /invites
      const resInvites = await request(app)
        .get('/api/v1/invites')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123');

      expect(resInvites.status).toBe(403);
      expect(resInvites.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('forbids a MEMBER from updating organization settings (OWNER only)', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue({
        userId: 'user-alice-123',
        organizationId: 'org-123',
        role: Role.MEMBER,
      });

      const res = await request(app)
        .patch('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123')
        .send({ name: 'Hacked Org Name' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('allows an OWNER to update organization settings with valid HTTPS logo and enum currency', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue({
        userId: 'user-alice-123',
        organizationId: 'org-123',
        role: Role.OWNER,
      });

      (prisma.organization.update as any).mockResolvedValue({
        id: 'org-123',
        name: 'Updated Studio Name',
        slug: 'allowed-studio',
        logoUrl: 'https://cdn.example.com/logo.png',
        currency: 'EUR',
        defaultTaxRate: 15.5,
        invoicePrefix: 'APX-',
      });

      const res = await request(app)
        .patch('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123')
        .send({
          name: 'Updated Studio Name',
          logoUrl: 'https://cdn.example.com/logo.png',
          currency: 'EUR',
          defaultTaxRate: 15.5,
          invoicePrefix: 'APX-',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currency).toBe('EUR');
    });

    it('rejects organization updates with insecure HTTP logo, invalid currency, or bad prefix', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue({
        userId: 'user-alice-123',
        organizationId: 'org-123',
        role: Role.OWNER,
      });

      // 1. Insecure http logo
      const resHttp = await request(app)
        .patch('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123')
        .send({ logoUrl: 'http://insecure.com/logo.png' });

      expect(resHttp.status).toBe(422);

      // 2. Unsupported currency
      const resCurr = await request(app)
        .patch('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123')
        .send({ currency: 'INVALID_CURR' });

      expect(resCurr.status).toBe(422);

      // 3. Invalid prefix with special characters
      const resPrefix = await request(app)
        .patch('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123')
        .send({ invoicePrefix: 'INV@#$%' });

      expect(resPrefix.status).toBe(422);
    });
  });

  describe('Last OWNER Protection Safeguards', () => {
    it('prevents demoting the last OWNER of an organization', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-1',
        userId: 'user-alice-123',
        organizationId: 'org-123',
        role: Role.OWNER,
      });

      // Only 1 OWNER exists
      (prisma.membership.count as any).mockResolvedValue(1);

      const res = await request(app)
        .patch('/api/v1/members/mem-1/role')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123')
        .send({ role: Role.MEMBER });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('LAST_OWNER_PROTECTION');
    });

    it('prevents deleting the last OWNER of an organization', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-1',
        userId: 'user-alice-123',
        organizationId: 'org-123',
        role: Role.OWNER,
      });

      // Only 1 OWNER exists
      (prisma.membership.count as any).mockResolvedValue(1);

      const res = await request(app)
        .delete('/api/v1/members/mem-1')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Organization-Id', 'org-123');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('LAST_OWNER_PROTECTION');
    });
  });
});
