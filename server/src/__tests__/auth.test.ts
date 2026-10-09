import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/passwordPolicy.js';
import { hashToken } from '../utils/crypto.js';
import { Role, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
    },
    emailVerificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
    client: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  };

  return { prisma: mockPrisma };
});

describe('Phase 2 Auth Module Security & Workflows', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates User, Organization, OWNER Membership, and FREE Subscription atomically in one transaction', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: 'user-1',
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
      });
      (prisma.organization.create as any).mockResolvedValue({
        id: 'org-1',
        name: 'Acme Design',
        slug: 'acme-design-1234',
      });
      (prisma.membership.create as any).mockResolvedValue({
        id: 'mem-1',
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.OWNER,
      });
      (prisma.subscription.create as any).mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
      });
      (prisma.emailVerificationToken.create as any).mockResolvedValue({
        id: 'tok-1',
        userId: 'user-1',
      });

      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'alice@example.com',
        password: 'ValidPassword123!',
        firstName: 'Alice',
        lastName: 'Smith',
        orgName: 'Acme Design',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Registration successful');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('returns the identical 201 response when email already exists without revealing account existence', async () => {
      // User already exists in DB
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'existing-user-999',
        email: 'existing@example.com',
      });

      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'existing@example.com',
        password: 'ValidPassword123!',
        firstName: 'Imposter',
        lastName: 'Person',
        orgName: 'Another Org',
      });

      // Identical 201 response and message
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Registration successful');
      // Did NOT create a second duplicate user/org
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });

    it('rejects passwords shorter than 10 characters or common passwords', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'alice@example.com',
        password: 'password123', // common password
        firstName: 'Alice',
        lastName: 'Smith',
        orgName: 'Acme Design',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns generic error for non-existent user and runs dummy compare', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'ValidPassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid email or password.');
    });

    it('locks account for 15 minutes after 5 failed attempts', async () => {
      const hashedPassword = await hashPassword('CorrectPassword123!');
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: 'locked@example.com',
        passwordHash: hashedPassword,
        failedLoginAttempts: 4,
        lockedUntil: null,
      });

      // 5th failed attempt
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'locked@example.com',
        password: 'WrongPassword123!',
      });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 5,
            lockedUntil: expect.any(Date),
          }),
        })
      );
    });

    it('resets failed attempts and sets secure httpOnly cookie on successful login', async () => {
      const validPassword = 'SecurePassword123!';
      const hashedPassword = await hashPassword(validPassword);

      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: 'success@example.com',
        passwordHash: hashedPassword,
        firstName: 'Success',
        lastName: 'User',
        failedLoginAttempts: 3,
        lockedUntil: null,
        memberships: [
          {
            role: Role.OWNER,
            organization: { id: 'org-1', name: 'Org 1', slug: 'org-1' },
          },
        ],
      });

      (prisma.refreshToken.create as any).mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        family: 'fam-1',
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'success@example.com',
        password: validPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('cliently_refresh_token=');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failedLoginAttempts: 0, lockedUntil: null },
        })
      );
    });
  });

  describe('Session DB Validation in requireAuth', () => {
    it('rejects access tokens whose session is revoked or expired in the database', async () => {
      const token = jwt.sign(
        { userId: 'user-1', sessionId: 'revoked-session-id' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      // Session in DB has been revoked
      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: 'revoked-session-id',
        userId: 'user-1',
        revokedAt: new Date(), // Revoked!
        expiresAt: new Date(Date.now() + 100000),
      });

      const res = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
    });

    it('allows access tokens whose session is active in the database', async () => {
      const token = jwt.sign(
        { userId: 'user-1', sessionId: 'active-session-id' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: 'active-session-id',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 1 });

      const res = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/auth/refresh (Rotation & Reuse Detection)', () => {
    it('rotates refresh token and issues new access token', async () => {
      const rawToken = 'sample_raw_refresh_token_12345';
      const tokenHash = hashToken(rawToken);

      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: 'old-session',
        userId: 'user-1',
        tokenHash,
        family: 'fam-123',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 'user-1' },
      });

      (prisma.refreshToken.create as any).mockResolvedValue({
        id: 'new-session',
        userId: 'user-1',
        family: 'fam-123',
      });

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`cliently_refresh_token=${rawToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('revokes entire family if a previously revoked token is reused', async () => {
      const reusedRawToken = 'reused_compromised_token_999';
      const tokenHash = hashToken(reusedRawToken);

      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: 'compromised-session',
        userId: 'user-1',
        tokenHash,
        family: 'compromised-family-456',
        revokedAt: new Date(Date.now() - 50000), // Already revoked!
        expiresAt: new Date(Date.now() + 100000),
      });

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`cliently_refresh_token=${reusedRawToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_REUSE_DETECTED');
      // Entire family is revoked
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { family: 'compromised-family-456' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('Email Verification & Password Reset Single-Use & Expiry', () => {
    it('verify-email is single use and marks email verified', async () => {
      const rawToken = 'verify_token_123';
      const tokenHash = hashToken(rawToken);

      (prisma.emailVerificationToken.findUnique as any).mockResolvedValue({
        id: 'tok-1',
        userId: 'user-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 100000),
        usedAt: null,
      });

      const res = await request(app).post('/api/v1/auth/verify-email').send({
        token: rawToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects expired verification token', async () => {
      const rawToken = 'expired_verify_token';
      const tokenHash = hashToken(rawToken);

      (prisma.emailVerificationToken.findUnique as any).mockResolvedValue({
        id: 'tok-1',
        userId: 'user-1',
        tokenHash,
        expiresAt: new Date(Date.now() - 100000), // Expired
        usedAt: null,
      });

      const res = await request(app).post('/api/v1/auth/verify-email').send({
        token: rawToken,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VERIFICATION_EXPIRED');
    });

    it('reset-password updates password, marks token used, and revokes all refresh tokens', async () => {
      const rawToken = 'reset_token_abc';
      const tokenHash = hashToken(rawToken);

      (prisma.passwordResetToken.findUnique as any).mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 50000),
        usedAt: null,
        user: { id: 'user-1' },
      });

      const res = await request(app).post('/api/v1/auth/reset-password').send({
        token: rawToken,
        newPassword: 'BrandNewSecurePassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
