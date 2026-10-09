import { InviteStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { TenantContext } from '../../types/express.js';
import { generateRandomToken, hashToken } from '../../utils/crypto.js';
import { hashPassword } from '../../utils/passwordPolicy.js';
import { sendInviteEmail } from '../../lib/email.js';
import { CreateInviteInput, AcceptInviteInput } from './invite.schema.js';

export class InviteService {
  /**
   * Create and send organization invite (OWNER only)
   */
  async createInvite(ctx: TenantContext, input: CreateInviteInput) {
    // 1. Check if the user is already a member
    const existingMembership = await prisma.membership.findFirst({
      where: {
        organizationId: ctx.organizationId,
        user: { email: input.email },
      },
    });

    if (existingMembership) {
      throw new AppError('This user is already a member of this organization.', 400, 'ALREADY_MEMBER');
    }

    // 2. Invalidate any existing pending invites for this email in this org
    await prisma.invite.updateMany({
      where: {
        organizationId: ctx.organizationId,
        email: input.email,
        status: InviteStatus.PENDING,
      },
      data: { status: InviteStatus.CANCELLED },
    });

    // 3. Generate secure token and hash
    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);

    // 4. Create Invite record (7 days expiry)
    const [invite, org, inviter] = await prisma.$transaction(async (tx) => {
      const createdInvite = await tx.invite.create({
        data: {
          organizationId: ctx.organizationId,
          email: input.email,
          name: input.name || null,
          phone: input.phone || null,
          role: input.role,
          projectId: input.projectId || null,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          status: InviteStatus.PENDING,
        },
      });

      if (input.phone) {
        await tx.user.updateMany({
          where: { email: input.email },
          data: { phone: input.phone.trim() },
        });
      }

      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: ctx.organizationId },
        select: { name: true },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: { id: ctx.userId },
        select: { firstName: true, lastName: true },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'INVITE_CREATED',
          entity: 'INVITE',
          entityId: createdInvite.id,
          metadata: { email: input.email, role: input.role },
        },
      });

      return [createdInvite, organization, user];
    });

    const inviterName = `${inviter.firstName} ${inviter.lastName}`.trim() || 'A team member';

    try {
      await sendInviteEmail(input.email, rawToken, org.name, inviterName, input.role);
    } catch {
      // Non-blocking
    }

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      status: invite.status,
      message: `Invitation sent to ${input.email}`,
    };
  }

  /**
   * List pending invites for active organization (OWNER only)
   */
  async listPendingInvites(ctx: TenantContext) {
    const invites = await prisma.invite.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: InviteStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
      status: inv.status,
      createdAt: inv.createdAt,
    }));
  }

  /**
   * Revoke invite (OWNER only)
   */
  async revokeInvite(ctx: TenantContext, inviteId: string) {
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
    });

    if (!invite || invite.organizationId !== ctx.organizationId) {
      throw new AppError('Invite not found in this organization.', 404, 'INVITE_NOT_FOUND');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new AppError('Invite is not pending and cannot be revoked.', 400, 'INVITE_NOT_PENDING');
    }

    await prisma.$transaction(async (tx) => {
      await tx.invite.update({
        where: { id: inviteId },
        data: { status: InviteStatus.CANCELLED },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'INVITE_REVOKED',
          entity: 'INVITE',
          entityId: inviteId,
          metadata: { email: invite.email },
        },
      });
    });

    return { success: true, message: 'Invite revoked successfully.' };
  }

  /**
   * Get invite details by token (public endpoint to validate link)
   */
  async getInviteDetails(token: string) {
    const tokenHash = hashToken(token);

    const invite = await prisma.invite.findUnique({
      where: { tokenHash },
      include: {
        organization: {
          select: { id: true, name: true, logoUrl: true },
        },
      },
    });

    if (!invite || invite.status !== InviteStatus.PENDING) {
      throw new AppError(
        'This invitation link is invalid or is no longer active. If multiple invites were sent, please use the link in the newest email.',
        400,
        'INVALID_INVITE'
      );
    }

    if (invite.expiresAt < new Date()) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new AppError('This invitation has expired. Please ask the team to resend it.', 400, 'INVITE_EXPIRED');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    return {
      email: invite.email,
      role: invite.role,
      organizationName: invite.organization.name,
      organizationLogo: invite.organization.logoUrl,
      expiresAt: invite.expiresAt,
      hasAccount: !!existingUser,
    };
  }

  /**
   * Accept invite: supports existing logged-in users and new account registrations.
   */
  async acceptInvite(input: AcceptInviteInput, authenticatedUserId?: string) {
    const tokenHash = hashToken(input.token);

    const invite = await prisma.invite.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });

    if (!invite || invite.status !== InviteStatus.PENDING) {
      throw new AppError(
        'Invalid or inactive invite. If you received multiple emails, please make sure you are clicking the link from the most recent email.',
        400,
        'INVALID_INVITE'
      );
    }

    if (invite.expiresAt < new Date()) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new AppError('Invite has expired. Please ask for a new invitation.', 400, 'INVITE_EXPIRED');
    }

    let targetUserId = authenticatedUserId;

    // Case 1: Authenticated user accepting the invite
    if (authenticatedUserId) {
      const authUser = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
      });

      if (!authUser || authUser.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new AppError(
          `This invite was sent to ${invite.email}. Please log in with that account to accept it.`,
          403,
          'INVITE_EMAIL_MISMATCH'
        );
      }
    } else {
      // Case 2: Unauthenticated user accepting
      const existingUser = await prisma.user.findUnique({
        where: { email: invite.email },
      });

      if (existingUser) {
        throw new AppError(
          'An account with this email already exists. Please log in first to accept this invitation.',
          409,
          'ACCOUNT_EXISTS_PLEASE_LOGIN'
        );
      }

      if (!input.password) {
        throw new AppError(
          'Password is required to create your account for this invitation.',
          400,
          'PASSWORD_REQUIRED'
        );
      }

      const passwordHash = await hashPassword(input.password);

      const resolvedFirstName = input.firstName || (invite.name ? invite.name.split(' ')[0] : 'User');
      const resolvedLastName = input.lastName || (invite.name ? invite.name.split(' ').slice(1).join(' ') : '');

      const newUser = await prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          phone: invite.phone || null,
          emailVerified: true, // Email is verified implicitly via token receipt
        },
      });

      targetUserId = newUser.id;
    }

    // Complete acceptance inside transaction
    await prisma.$transaction(async (tx) => {
      // 1. Mark invite accepted
      await tx.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.ACCEPTED },
      });

      if (invite.phone && targetUserId) {
        await tx.user.update({
          where: { id: targetUserId },
          data: { phone: invite.phone },
        });
      }

      // 2. Create Membership (upsert in case already added)
      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: targetUserId!,
            organizationId: invite.organizationId,
          },
        },
        create: {
          userId: targetUserId!,
          organizationId: invite.organizationId,
          role: invite.role,
          projectId: invite.projectId || null,
        },
        update: {
          role: invite.role,
          ...(invite.projectId && { projectId: invite.projectId }),
        },
      });

      // 3. If invite was for a CLIENT role, link to Client record if matching email exists
      if (invite.role === Role.CLIENT) {
        await tx.client.updateMany({
          where: {
            organizationId: invite.organizationId,
            email: invite.email,
            userId: null,
          },
          data: {
            userId: targetUserId!,
          },
        });
      }

      // 4. Activity Log
      await tx.activityLog.create({
        data: {
          organizationId: invite.organizationId,
          userId: targetUserId,
          action: 'INVITE_ACCEPTED',
          entity: 'INVITE',
          entityId: invite.id,
          metadata: { email: invite.email, role: invite.role },
        },
      });
    });

    return {
      success: true,
      message: `You have successfully joined ${invite.organization.name}!`,
      organizationId: invite.organizationId,
      role: invite.role,
    };
  }
}

export const inviteService = new InviteService();
