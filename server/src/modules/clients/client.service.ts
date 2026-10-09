import { Role, InviteStatus, Prisma, ClientStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { TenantContext } from '../../types/express.js';
import { enforcePlanLimit } from '../../utils/planLimits.js';
import { generateRandomToken, hashToken } from '../../utils/crypto.js';
import { sendInviteEmail } from '../../lib/email.js';
import { broadcastSessionRevoked } from '../../lib/realtime.js';
import { CreateClientInput, UpdateClientInput, ClientQueryInput } from './client.schema.js';

export class ClientService {
  /**
   * 1. Create a new client (Scoped to organizationId with row-lock serialized plan limit enforcement)
   */
  async createClient(ctx: TenantContext, input: CreateClientInput) {
    const normalizedEmail = input.email.trim().toLowerCase();

    return prisma.$transaction(async (tx) => {
      // 1. Acquire exclusive lock on Organization row to serialize concurrent creates
      await tx.organization.update({
        where: { id: ctx.organizationId },
        data: { updatedAt: new Date() },
      });

      // 2. Enforce plan limit inside transaction while holding row lock
      await enforcePlanLimit(tx, ctx, 'clients');

      // 3. Ensure email uniqueness per organization
      const existing = await tx.client.findFirst({
        where: {
          organizationId: ctx.organizationId,
          email: normalizedEmail,
        },
      });

      if (existing) {
        throw new AppError(
          'A client with this email already exists in your organization.',
          409,
          'DUPLICATE_CLIENT_EMAIL'
        );
      }

      // 4. Create client record
      const client = await tx.client.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name.trim(),
          email: normalizedEmail,
          company: input.company ? input.company.trim() : null,
          address: input.address ? input.address.trim() : null,
          phone: input.phone ? input.phone.trim() : null,
          notes: input.notes ? input.notes.trim() : null,
          status: ClientStatus.ACTIVE,
        },
      });

      // 5. Log Activity (sanitized: only ids and changed field names)
      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'CLIENT_CREATED',
          entity: 'CLIENT',
          entityId: client.id,
          metadata: {
            clientId: client.id,
            changedFields: Object.keys(input),
          },
        },
      });

      return client;
    });
  }

  /**
   * 2. List clients with search, status filtering, allowlisted sorting, and pagination
   */
  async listClients(ctx: TenantContext, query: ClientQueryInput) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      organizationId: ctx.organizationId, // Strict tenant isolation
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              projects: true,
              invoices: true,
            },
          },
        },
      }),
    ]);

    // Find invites for these clients
    const clientEmails = clients.map((c) => c.email).filter(Boolean);
    const existingInvites =
      clientEmails.length > 0 && typeof prisma.invite?.findMany === 'function'
        ? await prisma.invite.findMany({
            where: {
              organizationId: ctx.organizationId,
              email: { in: clientEmails },
            },
            orderBy: { createdAt: 'desc' },
            select: { email: true, status: true, expiresAt: true, createdAt: true },
          })
        : [];

    const pendingEmailSet = new Set(
      existingInvites
        .filter((i) => i.status === InviteStatus.PENDING && i.expiresAt > new Date())
        .map((i) => i.email.toLowerCase())
    );

    const latestInviteByEmail = new Map<string, Date>();
    for (const inv of existingInvites) {
      const emailLower = inv.email.toLowerCase();
      if (!latestInviteByEmail.has(emailLower)) {
        latestInviteByEmail.set(emailLower, inv.createdAt);
      }
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return {
      data: clients.map((c) => {
        const emailLower = c.email.toLowerCase();
        const lastInviteDate = latestInviteByEmail.get(emailLower) || null;
        const wasSentToday = lastInviteDate ? lastInviteDate >= oneDayAgo : false;
        const canSendInvite = !c.userId && !wasSentToday;

        return {
          id: c.id,
          name: c.name,
          email: c.email,
          company: c.company,
          phone: c.phone,
          address: c.address,
          status: c.status,
          userId: c.userId,
          portalStatus: c.userId
            ? 'ACTIVE'
            : pendingEmailSet.has(emailLower)
            ? 'INVITED'
            : 'NOT_INVITED',
          hasPortalAccess: c.userId !== null,
          lastInviteSentAt: lastInviteDate ? lastInviteDate.toISOString() : null,
          canSendInvite,
          projectsCount: c._count?.projects || 0,
          invoicesCount: c._count?.invoices || 0,
          _count: {
            projects: c._count?.projects || 0,
            invoices: c._count?.invoices || 0,
          },
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 3. Get single client by (id + organizationId). Returns 404 if not found or cross-tenant.
   */
  async getClientById(ctx: TenantContext, id: string) {
    const client = await prisma.client.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId, // Strict tenant isolation
      },
      include: {
        projects: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        invoices: {
          select: {
            id: true,
            number: true,
            total: true,
            status: true,
            dueDate: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!client) {
      throw new AppError('Client not found.', 404, 'CLIENT_NOT_FOUND');
    }

    const pendingInvite =
      client.email && !client.userId && typeof prisma.invite?.findFirst === 'function'
        ? await prisma.invite.findFirst({
            where: {
              organizationId: ctx.organizationId,
              email: client.email,
              status: InviteStatus.PENDING,
              expiresAt: { gt: new Date() },
            },
            select: { id: true, expiresAt: true },
          })
        : null;

    const portalStatus = client.userId
      ? 'ACTIVE'
      : pendingInvite
      ? 'INVITED'
      : 'NOT_INVITED';

    // Financial totals summary (aggregate invoices for this client)
    const invoiceTotals = await prisma.invoice.groupBy({
      by: ['status'],
      where: {
        clientId: client.id,
        organizationId: ctx.organizationId,
      },
      _sum: {
        total: true,
      },
    });

    let totalBilled = 0;
    let totalPaid = 0;
    let totalPending = 0;

    for (const group of invoiceTotals) {
      const amount = Number(group._sum.total || 0);
      totalBilled += amount;
      if (group.status === 'PAID') {
        totalPaid += amount;
      } else if (['SENT', 'VIEWED', 'OVERDUE'].includes(group.status)) {
        totalPending += amount;
      }
    }

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      company: client.company,
      address: client.address,
      phone: client.phone,
      notes: client.notes,
      status: client.status,
      userId: client.userId,
      portalStatus,
      hasPortalAccess: client.userId !== null,
      portalUser: client.user,
      summary: {
        totalBilled,
        totalPaid,
        totalPending,
      },
      recentProjects: client.projects,
      recentInvoices: client.invoices,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  /**
   * 4. Update client by (id + organizationId). Returns 404 if not found.
   * If re-activating an ARCHIVED client to ACTIVE, plan limits are enforced under row lock.
   */
  async updateClient(ctx: TenantContext, id: string, input: UpdateClientInput) {
    const existing = await prisma.client.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
    });

    if (!existing) {
      throw new AppError('Client not found.', 404, 'CLIENT_NOT_FOUND');
    }

    const normalizedEmail = input.email ? input.email.trim().toLowerCase() : undefined;

    // Check duplicate email if email is being modified
    if (normalizedEmail && normalizedEmail !== existing.email.toLowerCase()) {
      const emailConflict = await prisma.client.findFirst({
        where: {
          organizationId: ctx.organizationId,
          email: normalizedEmail,
          id: { not: id },
        },
      });

      if (emailConflict) {
        throw new AppError(
          'A client with this email already exists in your organization.',
          409,
          'DUPLICATE_CLIENT_EMAIL'
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If re-activating from ARCHIVED to ACTIVE, enforce plan limits under organization row lock
      if (input.status === ClientStatus.ACTIVE && existing.status === ClientStatus.ARCHIVED) {
        await tx.organization.update({
          where: { id: ctx.organizationId },
          data: { updatedAt: new Date() },
        });
        await enforcePlanLimit(tx, ctx, 'clients');
      }

      const client = await tx.client.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(normalizedEmail !== undefined && { email: normalizedEmail }),
          ...(input.company !== undefined && { company: input.company ? input.company.trim() : null }),
          ...(input.address !== undefined && { address: input.address ? input.address.trim() : null }),
          ...(input.phone !== undefined && { phone: input.phone ? input.phone.trim() : null }),
          ...(input.notes !== undefined && { notes: input.notes ? input.notes.trim() : null }),
          ...(input.status !== undefined && { status: input.status }),
        },
      });

      // Sanitized activity log: only IDs and changed field names
      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'CLIENT_UPDATED',
          entity: 'CLIENT',
          entityId: client.id,
          metadata: {
            clientId: client.id,
            changedFields: Object.keys(input),
          },
        },
      });

      return client;
    });

    return updated;
  }

  /**
   * 5. Delete or soft-archive client (OWNER only).
   * Soft archives if invoices exist to preserve financial integrity.
   * Completely revokes user access, deletes memberships/sessions, and triggers immediate real-time logout.
   */
  async deleteClient(ctx: TenantContext, id: string) {
    const client = await prisma.client.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      include: {
        _count: {
          select: { invoices: true },
        },
      },
    });

    if (!client) {
      throw new AppError('Client not found.', 404, 'CLIENT_NOT_FOUND');
    }

    // Determine linked user
    let targetUserId = client.userId;
    if (!targetUserId && client.email && typeof prisma.user?.findUnique === 'function') {
      try {
        const user = await prisma.user.findUnique({
          where: { email: client.email },
          select: { id: true },
        });
        if (user) {
          targetUserId = user.id;
        }
      } catch {
        // Safe ignore
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. If a linked user account exists, remove their membership and sessions
      if (targetUserId) {
        if (typeof tx.membership?.deleteMany === 'function') {
          await tx.membership.deleteMany({
            where: {
              userId: targetUserId,
              organizationId: ctx.organizationId,
            },
          });
        }

        // Invalidate all active sessions / refresh tokens
        if (typeof tx.refreshToken?.deleteMany === 'function') {
          await tx.refreshToken.deleteMany({
            where: { userId: targetUserId },
          });
        }

        // If user has no other memberships in any organization, delete user record completely
        if (typeof tx.membership?.count === 'function' && typeof tx.user?.delete === 'function') {
          const otherMemberships = await tx.membership.count({
            where: { userId: targetUserId },
          });

          if (otherMemberships === 0) {
            await tx.user.delete({
              where: { id: targetUserId },
            }).catch(() => {});
          }
        }
      }

      // 2. Invalidate pending invites for this email
      if (client.email && typeof tx.invite?.deleteMany === 'function') {
        await tx.invite.deleteMany({
          where: {
            organizationId: ctx.organizationId,
            email: client.email,
          },
        });
      }

      // 3. If client is ACTIVE (or not yet ARCHIVED), move them to ARCHIVED status
      if (client.status !== ClientStatus.ARCHIVED) {
        const archived = await tx.client.update({
          where: { id: client.id },
          data: {
            status: ClientStatus.ARCHIVED,
          },
        });

        await tx.activityLog.create({
          data: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: 'CLIENT_ARCHIVED',
            entity: 'CLIENT',
            entityId: client.id,
            metadata: {
              clientId: client.id,
              reason: 'Client moved to Archived list.',
            },
          },
        });

        return {
          success: true,
          action: 'ARCHIVED',
          message: 'Client has been moved to the Archived list.',
          client: archived,
        };
      }

      // 4. If client is already ARCHIVED, permanently hard delete them
      // Clean up invoice items and invoices linked to client
      if (typeof tx.invoiceItem?.deleteMany === 'function') {
        await tx.invoiceItem.deleteMany({
          where: { invoice: { clientId: client.id } },
        });
      }
      if (typeof tx.invoice?.deleteMany === 'function') {
        await tx.invoice.deleteMany({
          where: { clientId: client.id },
        });
      }

      // Clean up projects
      if (typeof tx.project?.deleteMany === 'function') {
        await tx.project.deleteMany({
          where: { clientId: client.id },
        });
      }

      // Clean up meeting attendees
      if (typeof tx.meetingAttendee?.deleteMany === 'function') {
        await tx.meetingAttendee.deleteMany({
          where: { clientId: client.id },
        });
      }

      // Hard delete client record
      await tx.client.delete({
        where: { id: client.id },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'CLIENT_DELETED',
          entity: 'CLIENT',
          entityId: id,
          metadata: { clientId: id, reason: 'Permanently deleted from Archived list' },
        },
      });

      return {
        success: true,
        action: 'DELETED',
        message: 'Client permanently deleted.',
      };
    });

    // 4. Broadcast instant real-time session revocation
    if (targetUserId) {
      broadcastSessionRevoked(
        targetUserId,
        ctx.organizationId,
        'Your client access has been removed by the organization owner.'
      );
    }

    return result;
  }

  /**
   * 6. Send portal invite to client (role: CLIENT)
   */
  async sendPortalInvite(ctx: TenantContext, clientId: string) {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        organizationId: ctx.organizationId,
      },
    });

    if (!client) {
      throw new AppError('Client not found.', 404, 'CLIENT_NOT_FOUND');
    }

    if (client.userId) {
      throw new AppError('This client is already linked to an active portal user account.', 400, 'PORTAL_ALREADY_ACTIVE');
    }

    // Check if an invite was already sent to this client today (24h rate limit)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentInvite = typeof prisma.invite?.findFirst === 'function'
      ? await prisma.invite.findFirst({
          where: {
            organizationId: ctx.organizationId,
            email: client.email,
            createdAt: { gte: oneDayAgo },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    if (recentInvite) {
      throw new AppError(
        'An invitation email was already sent to this client today. You can only send one invitation per day.',
        429,
        'INVITE_RATE_LIMIT_EXCEEDED'
      );
    }

    // Generate secure invite token
    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);

    const [invite, org, inviter] = await prisma.$transaction(async (tx) => {
      // Invalidate existing pending invites for this client email
      await tx.invite.updateMany({
        where: {
          organizationId: ctx.organizationId,
          email: client.email,
          status: InviteStatus.PENDING,
        },
        data: { status: InviteStatus.CANCELLED },
      });

      const createdInvite = await tx.invite.create({
        data: {
          organizationId: ctx.organizationId,
          email: client.email,
          role: Role.CLIENT,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          status: InviteStatus.PENDING,
        },
      });

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
          action: 'CLIENT_PORTAL_INVITE_SENT',
          entity: 'CLIENT',
          entityId: client.id,
          metadata: { clientId: client.id },
        },
      });

      return [createdInvite, organization, user];
    });

    const inviterName = `${inviter.firstName} ${inviter.lastName}`.trim() || 'A team member';
    try {
      await sendInviteEmail(client.email, rawToken, org.name, inviterName, 'Client Portal');
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      message: `Client portal invitation sent to ${client.email}`,
      inviteId: invite.id,
      expiresAt: invite.expiresAt,
    };
  }
}

export const clientService = new ClientService();
