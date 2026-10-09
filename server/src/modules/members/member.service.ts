import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { TenantContext } from '../../types/express.js';
import { UpdateMemberRoleInput, UpdateMemberDetailsInput } from './member.schema.js';
import { broadcastSessionRevoked } from '../../lib/realtime.js';

export class MemberService {
  /**
   * List all members of the active organization
   */
  async listMembers(ctx: TenantContext) {
    const members = await prisma.membership.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
            emailVerified: true,
            createdAt: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      projectId: m.projectId,
      project: m.project,
      user: m.user,
      createdAt: m.createdAt,
      joinedAt: m.createdAt,
    }));
  }

  /**
   * Update member role (OWNER only). Prevents demoting the last OWNER.
   */
  async updateMemberRole(ctx: TenantContext, memberId: string, input: UpdateMemberRoleInput) {
    const targetMembership = await prisma.membership.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!targetMembership || targetMembership.organizationId !== ctx.organizationId) {
      throw new AppError('Member not found in this organization.', 404, 'MEMBER_NOT_FOUND');
    }

    // Check if demoting an OWNER
    if (targetMembership.role === Role.OWNER && input.role !== Role.OWNER) {
      const ownerCount = await prisma.membership.count({
        where: {
          organizationId: ctx.organizationId,
          role: Role.OWNER,
        },
      });

      if (ownerCount <= 1) {
        throw new AppError(
          'Cannot demote the last OWNER of the organization. Transfer ownership or assign another OWNER first.',
          400,
          'LAST_OWNER_PROTECTION'
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const mem = await tx.membership.update({
        where: { id: memberId },
        data: { role: input.role },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MEMBER_ROLE_CHANGED',
          entity: 'MEMBERSHIP',
          entityId: mem.id,
          metadata: {
            targetUserId: targetMembership.userId,
            oldRole: targetMembership.role,
            newRole: input.role,
          },
        },
      });

      return mem;
    });

    return {
      id: updated.id,
      userId: updated.userId,
      role: updated.role,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Remove member (OWNER only). Prevents removing the last OWNER.
   * Revokes all active refresh tokens, cleans up user if no other orgs, and triggers instant real-time logout.
   */
  async removeMember(ctx: TenantContext, memberId: string) {
    const targetMembership = await prisma.membership.findUnique({
      where: { id: memberId },
    });

    if (!targetMembership || targetMembership.organizationId !== ctx.organizationId) {
      throw new AppError('Member not found in this organization.', 404, 'MEMBER_NOT_FOUND');
    }

    // Protect last OWNER
    if (targetMembership.role === Role.OWNER) {
      const ownerCount = await prisma.membership.count({
        where: {
          organizationId: ctx.organizationId,
          role: Role.OWNER,
        },
      });

      if (ownerCount <= 1) {
        throw new AppError(
          'Cannot remove the last OWNER of the organization. Assign another OWNER first.',
          400,
          'LAST_OWNER_PROTECTION'
        );
      }
    }

    const targetUserId = targetMembership.userId;

    await prisma.$transaction(async (tx) => {
      await tx.membership.delete({
        where: { id: memberId },
      });

      // Revoke all active refresh tokens for the user
      await tx.refreshToken.deleteMany({
        where: { userId: targetUserId },
      });

      // If user has no other memberships in any organization, delete user record
      const otherMemberships = await tx.membership.count({
        where: { userId: targetUserId },
      });

      if (otherMemberships === 0) {
        await tx.user.delete({
          where: { id: targetUserId },
        }).catch(() => {});
      }

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MEMBER_REMOVED',
          entity: 'MEMBERSHIP',
          entityId: memberId,
          metadata: {
            removedUserId: targetUserId,
            previousRole: targetMembership.role,
          },
        },
      });
    });

    // Broadcast instant real-time session revocation
    broadcastSessionRevoked(
      targetUserId,
      ctx.organizationId,
      'Your membership access has been removed by the organization owner.'
    );

    return { success: true, message: 'Member removed successfully.' };
  }

  /**
   * Update member details (phone and assigned project) (OWNER only).
   */
  async updateMember(ctx: TenantContext, memberId: string, input: UpdateMemberDetailsInput) {
    const targetMembership = await prisma.membership.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!targetMembership || targetMembership.organizationId !== ctx.organizationId) {
      throw new AppError('Member not found in this organization.', 404, 'MEMBER_NOT_FOUND');
    }

    let resolvedProjectId: string | null | undefined = undefined;
    if (input.projectId !== undefined) {
      if (input.projectId && input.projectId.trim() !== '') {
        const proj = await prisma.project.findFirst({
          where: { id: input.projectId, organizationId: ctx.organizationId },
        });
        if (!proj) {
          throw new AppError('Assigned project not found in this organization.', 400, 'PROJECT_NOT_FOUND');
        }
        resolvedProjectId = proj.id;
      } else {
        resolvedProjectId = null;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.phone !== undefined) {
        await tx.user.update({
          where: { id: targetMembership.userId },
          data: { phone: input.phone ? input.phone.trim() : null },
        });
      }

      const mem = await tx.membership.update({
        where: { id: memberId },
        data: {
          ...(resolvedProjectId !== undefined ? { projectId: resolvedProjectId } : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
              emailVerified: true,
              createdAt: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MEMBER_UPDATED',
          entity: 'MEMBERSHIP',
          entityId: mem.id,
          metadata: {
            targetUserId: targetMembership.userId,
            phone: input.phone,
            projectId: resolvedProjectId,
          },
        },
      });

      return mem;
    });

    return {
      id: updated.id,
      userId: updated.userId,
      role: updated.role,
      projectId: updated.projectId,
      project: updated.project,
      user: updated.user,
      createdAt: updated.createdAt,
      joinedAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}

export const memberService = new MemberService();
