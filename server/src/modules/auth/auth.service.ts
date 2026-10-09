import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Role, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { hashPassword, verifyPassword, getDummyHash } from '../../utils/passwordPolicy.js';
import { generateRandomToken, hashToken } from '../../utils/crypto.js';
import { sendVerificationEmail, sendPasswordResetEmail, sendExistingAccountNoticeEmail } from '../../lib/email.js';
import {
  RegisterInput,
  LoginInput,
  VerifyEmailInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from './auth.schema.js';

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 30);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base || 'workspace'}-${suffix}`;
}

export class AuthService {
  /**
   * 1. Register: Creates User, Organization, OWNER Membership, FREE Subscription, and Verification Token in one transaction.
   */
  async register(input: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    const genericResponse = {
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
    };

    if (existingUser) {
      // Balanced timing: hash a dummy password to keep response timing similar
      const dummyHash = await getDummyHash();
      await verifyPassword(dummyHash, input.password);

      try {
        await sendExistingAccountNoticeEmail(input.email);
      } catch {
        // Non-blocking
      }

      return genericResponse;
    }

    const passwordHash = await hashPassword(input.password);
    const slug = generateSlug(input.orgName);
    const rawVerifyToken = generateRandomToken(32);
    const verifyTokenHash = hashToken(rawVerifyToken);

    await prisma.$transaction(async (tx) => {
      // Create User
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          emailVerified: false,
        },
      });

      // Create Organization
      const org = await tx.organization.create({
        data: {
          name: input.orgName,
          slug,
          currency: 'USD',
          defaultTaxRate: 0,
          invoicePrefix: 'INV-',
          nextInvoiceNumber: 1,
        },
      });

      // Create Membership (OWNER)
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: Role.OWNER,
        },
      });

      // Create FREE Subscription
      await tx.subscription.create({
        data: {
          organizationId: org.id,
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.ACTIVE,
        },
      });

      // Create Email Verification Token (24h expiry)
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: verifyTokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Log activity
      await tx.activityLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: 'USER_REGISTERED',
          entity: 'USER',
          entityId: user.id,
          metadata: { email: user.email, orgName: org.name },
        },
      });
    });

    // Send verification email asynchronously
    try {
      await sendVerificationEmail(input.email, rawVerifyToken, input.firstName);
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  /**
   * 2. Login: Verifies credentials, enforces lockout, timing attack mitigation, creates session and tokens.
   */
  async login(input: LoginInput, meta: { userAgent?: string; ip?: string }) {
    const genericErrorMessage = 'Invalid email or password.';

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    // If user does not exist, perform dummy verification to protect against timing enumeration
    if (!user) {
      const dummyHash = await getDummyHash();
      await verifyPassword(dummyHash, input.password);
      throw new AppError(genericErrorMessage, 401, 'INVALID_CREDENTIALS');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError(
        `Account is temporarily locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
        429,
        'ACCOUNT_LOCKED'
      );
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, input.password);

    if (!isPasswordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const willLock = newAttempts >= 5;
      const lockedUntil = willLock ? new Date(Date.now() + 15 * 60 * 1000) : null; // 15 min lock

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil,
        },
      });

      if (willLock) {
        throw new AppError(
          'Account has been temporarily locked for 15 minutes due to 5 consecutive failed login attempts.',
          429,
          'ACCOUNT_LOCKED'
        );
      }

      throw new AppError(genericErrorMessage, 401, 'INVALID_CREDENTIALS');
    }

    // Reset failed login counter on success
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Create Refresh Token with new family
    const family = crypto.randomUUID();
    const rawRefreshToken = generateRandomToken(40);
    const refreshTokenHash = hashToken(rawRefreshToken);

    const refreshTokenRecord = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    // Create Access Token (15 min)
    const accessToken = jwt.sign(
      {
        userId: user.id,
        sessionId: refreshTokenRecord.id,
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
    );

    // Activity Log
    if (user.memberships.length > 0) {
      try {
        await prisma.activityLog.create({
          data: {
            organizationId: user.memberships[0].organizationId,
            userId: user.id,
            action: 'USER_LOGIN',
            entity: 'USER',
            entityId: user.id,
            metadata: { ip: meta.ip, userAgent: meta.userAgent },
          },
        });
      } catch {
        // Non-blocking log failure
      }
    }

    return {
      accessToken,
      rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
      },
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  /**
   * 3. Refresh: Rotates refresh token, detects reuse, revokes family on compromise.
   */
  async refresh(rawRefreshToken: string, meta: { userAgent?: string; ip?: string }) {
    if (!rawRefreshToken) {
      throw new AppError('Refresh token is required.', 401, 'UNAUTHORIZED');
    }

    const incomingHash = hashToken(rawRefreshToken);

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash: incomingHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new AppError('Invalid refresh token.', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Reuse detection: If a revoked token is presented, revoke the ENTIRE token family!
    if (tokenRecord.revokedAt !== null) {
      await prisma.refreshToken.updateMany({
        where: { family: tokenRecord.family },
        data: { revokedAt: new Date() },
      });

      throw new AppError(
        'Security alert: Attempted refresh token reuse detected. All sessions in this family have been terminated.',
        401,
        'TOKEN_REUSE_DETECTED'
      );
    }

    // Check expiration
    if (tokenRecord.expiresAt < new Date()) {
      throw new AppError('Refresh token has expired. Please log in again.', 401, 'REFRESH_TOKEN_EXPIRED');
    }

    // Generate new rotated token in the same family
    const newRawRefreshToken = generateRandomToken(40);
    const newRefreshTokenHash = hashToken(newRawRefreshToken);

    const result = await prisma.$transaction(async (tx) => {
      // Create new token
      const newTokenRecord = await tx.refreshToken.create({
        data: {
          userId: tokenRecord.userId,
          tokenHash: newRefreshTokenHash,
          family: tokenRecord.family,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          userAgent: meta.userAgent || tokenRecord.userAgent,
          ip: meta.ip || tokenRecord.ip,
        },
      });

      // Revoke old token and link to replacement
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: newTokenRecord.id,
        },
      });

      return newTokenRecord;
    });

    // Create new Access Token
    const accessToken = jwt.sign(
      {
        userId: tokenRecord.userId,
        sessionId: result.id,
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
    );

    return {
      accessToken,
      newRawRefreshToken,
    };
  }

  /**
   * 4. Logout: Revokes current refresh token.
   */
  async logout(rawRefreshToken: string | undefined) {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { success: true, message: 'Logged out successfully.' };
  }

  /**
   * 5. Logout All: Revokes ALL sessions for user.
   */
  async logoutAll(userId: string) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true, message: 'All active sessions have been logged out.' };
  }

  /**
   * 6. Verify Email: Single use token.
   */
  async verifyEmail(input: VerifyEmailInput) {
    const tokenHash = hashToken(input.token);

    const tokenRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!tokenRecord || tokenRecord.usedAt !== null) {
      throw new AppError('Invalid or already used verification token.', 400, 'INVALID_VERIFICATION_TOKEN');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new AppError('Verification link has expired. Please request a new one.', 400, 'VERIFICATION_EXPIRED');
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: tokenRecord.userId },
        data: { emailVerified: true },
      }),
    ]);

    return { success: true, message: 'Email verified successfully. You can now access all workspace features.' };
  }

  /**
   * 7. Forgot Password: Always returns same response to prevent enumeration.
   */
  async forgotPassword(input: ForgotPasswordInput) {
    const genericResponse = {
      success: true,
      message: 'If an account with that email exists, password reset instructions have been sent.',
    };

    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      return genericResponse;
    }

    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);

    // Invalidate existing unused tokens
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Create 1-hour expiry reset token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    try {
      await sendPasswordResetEmail(user.email, rawToken, user.firstName);
    } catch {
      // Non-blocking
    }

    return genericResponse;
  }

  /**
   * 8. Reset Password: Token hashed, single-use, 1h expiry; revokes all refresh tokens.
   */
  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = hashToken(input.token);

    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.usedAt !== null) {
      throw new AppError('Invalid or already used password reset token.', 400, 'INVALID_RESET_TOKEN');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new AppError('Password reset token has expired. Please request a new link.', 400, 'RESET_TOKEN_EXPIRED');
    }

    const newPasswordHash = await hashPassword(input.newPassword);

    await prisma.$transaction(async (tx) => {
      // Mark token used
      await tx.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });

      // Update password hash & reset lockout attempts
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          passwordHash: newPasswordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      // Revoke ALL refresh tokens for user security
      await tx.refreshToken.updateMany({
        where: { userId: tokenRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return {
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    };
  }

  /**
   * 9. Change Password: Requires current password, updates hash, revokes other sessions.
   */
  async changePassword(userId: string, input: ChangePasswordInput, currentSessionId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    const isCurrentValid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!isCurrentValid) {
      throw new AppError('Current password is incorrect.', 400, 'INVALID_CURRENT_PASSWORD');
    }

    const newPasswordHash = await hashPassword(input.newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      // Revoke other active sessions except current
      await tx.refreshToken.updateMany({
        where: {
          userId,
          id: { not: currentSessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    });

    return {
      success: true,
      message: 'Password changed successfully. All other active sessions have been terminated.',
    };
  }

  /**
   * 10. Get Current User & Organizations
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: {
        organization: true,
      },
    });

    return {
      user,
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        currency: m.organization.currency,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
    };
  }

  /**
   * 11. Update Profile (Name)
   */
  async updateProfile(userId: string, input: { firstName?: string; lastName?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * 12. Update or Remove Avatar
   */
  async updateAvatar(userId: string, avatarUrl: string | null) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    return user;
  }
}

export const authService = new AuthService();
