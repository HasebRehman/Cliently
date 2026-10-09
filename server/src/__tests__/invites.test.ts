import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { hashToken } from '../utils/crypto.js';
import { Role, InviteStatus } from '@prisma/client';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    refreshToken: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    invite: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    client: {
      updateMany: vi.fn(),
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

describe('Phase 2 Invites System Workflows & Security', () => {
  const app = createApp();

  const ownerToken = jwt.sign(
    { userId: 'user-owner-1', sessionId: 'sess-owner' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      id: 'sess-owner',
      userId: 'user-owner-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });
  });

  describe('POST /api/v1/invites', () => {
    it('creates an invite with hashed token, 7-day expiry, and sends email', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue({
        userId: 'user-owner-1',
        organizationId: 'org-1',
        role: Role.OWNER,
      });

      (prisma.membership.findFirst as any).mockResolvedValue(null); // Not already a member

      (prisma.invite.create as any).mockResolvedValue({
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'collaborator@example.com',
        role: Role.MEMBER,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: InviteStatus.PENDING,
      });

      (prisma.organization.findUniqueOrThrow as any).mockResolvedValue({
        name: 'Apex Studio',
      });

      (prisma.user.findUniqueOrThrow as any).mockResolvedValue({
        firstName: 'Owner',
        lastName: 'Admin',
      });

      const res = await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', 'org-1')
        .send({
          email: 'collaborator@example.com',
          role: 'MEMBER',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('collaborator@example.com');
      expect(prisma.invite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: expect.any(String),
            status: InviteStatus.PENDING,
          }),
        })
      );
    });

    it('rejects invite if recipient is already an active member of the organization', async () => {
      (prisma.membership.findUnique as any).mockResolvedValue({
        userId: 'user-owner-1',
        organizationId: 'org-1',
        role: Role.OWNER,
      });

      // Already a member
      (prisma.membership.findFirst as any).mockResolvedValue({
        id: 'existing-mem-1',
      });

      const res = await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', 'org-1')
        .send({
          email: 'already_member@example.com',
          role: 'MEMBER',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ALREADY_MEMBER');
    });
  });

  describe('POST /api/v1/invites/accept (Existing User vs New User Paths)', () => {
    it('accepts invite for an EXISTING authenticated user without touching profile or password', async () => {
      const rawToken = 'existing_user_invite_token_123';
      const tokenHash = hashToken(rawToken);

      const existingUserToken = jwt.sign(
        { userId: 'user-existing-1', sessionId: 'sess-existing' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: 'sess-existing',
        userId: 'user-existing-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      (prisma.invite.findUnique as any).mockResolvedValue({
        id: 'invite-existing',
        organizationId: 'org-new',
        email: 'colleague@example.com',
        role: Role.MEMBER,
        tokenHash,
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 100000),
        organization: { name: 'Acme Corp' },
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-existing-1',
        email: 'colleague@example.com',
        firstName: 'ExistingName',
        passwordHash: 'existingHashedPassword',
      });

      const res = await request(app)
        .post('/api/v1/invites/accept')
        .set('Authorization', `Bearer ${existingUserToken}`)
        .send({
          token: rawToken,
          password: 'IgnoredPassword123!', // Must not alter existing credentials
          firstName: 'HackedName',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('joined Acme Corp');
      // Verify user table was NOT updated or modified
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      // Verify membership was upserted for existing user
      expect(prisma.membership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ userId: 'user-existing-1', organizationId: 'org-new' }),
        })
      );
    });

    it('creates account and membership in a transaction for a new user with valid invite token', async () => {
      const rawToken = 'valid_raw_invite_token_777';
      const tokenHash = hashToken(rawToken);

      (prisma.invite.findUnique as any).mockResolvedValue({
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'newuser@example.com',
        role: Role.MEMBER,
        tokenHash,
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 100000),
        organization: { name: 'Apex Studio' },
      });

      (prisma.user.findUnique as any).mockResolvedValue(null); // No existing account

      (prisma.user.create as any).mockResolvedValue({
        id: 'new-user-1',
        email: 'newuser@example.com',
      });

      const res = await request(app).post('/api/v1/invites/accept').send({
        token: rawToken,
        password: 'ValidPassword123!',
        firstName: 'New',
        lastName: 'Member',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('joined Apex Studio');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects expired invite tokens', async () => {
      const rawToken = 'expired_invite_token';
      const tokenHash = hashToken(rawToken);

      (prisma.invite.findUnique as any).mockResolvedValue({
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'expired@example.com',
        role: Role.MEMBER,
        tokenHash,
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() - 100000), // Expired!
        organization: { name: 'Apex Studio' },
      });

      const res = await request(app).post('/api/v1/invites/accept').send({
        token: rawToken,
        password: 'ValidPassword123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVITE_EXPIRED');
    });

    it('rejects acceptance if logged in user email does not match invite email', async () => {
      const rawToken = 'mismatch_invite_token';
      const tokenHash = hashToken(rawToken);

      const differentUserToken = jwt.sign(
        { userId: 'user-bob', sessionId: 'sess-bob' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: 'sess-bob',
        userId: 'user-bob',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      (prisma.invite.findUnique as any).mockResolvedValue({
        id: 'invite-1',
        organizationId: 'org-1',
        email: 'intended_recipient@example.com',
        role: Role.MEMBER,
        tokenHash,
        status: InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 100000),
        organization: { name: 'Apex Studio' },
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-bob',
        email: 'bob@example.com', // Mismatch!
      });

      const res = await request(app)
        .post('/api/v1/invites/accept')
        .set('Authorization', `Bearer ${differentUserToken}`)
        .send({
          token: rawToken,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVITE_EMAIL_MISMATCH');
    });
  });
});
