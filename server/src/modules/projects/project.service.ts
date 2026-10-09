import { Prisma, ProjectStatus, ProjectBillingType, MilestoneStatus, MilestoneApprovalStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { TenantContext } from '../../types/express.js';
import {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectQueryInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
  MilestoneRevisionInput,
} from './project.schema.js';
import {
  sendMilestoneCompletedEmail,
  sendMilestoneApprovedEmail,
  sendMilestoneRevisionEmail,
} from '../../lib/email.js';

export class ProjectService {
  /**
   * 1. Create a new project (Scoped to organizationId with client ownership IDOR validation)
   */
  async createProject(ctx: TenantContext, input: CreateProjectInput) {
    // 1. Validate that the specified client belongs to the requesting tenant (Strict IDOR protection)
    const client = await prisma.client.findFirst({
      where: {
        id: input.clientId,
        organizationId: ctx.organizationId,
      },
    });

    if (!client) {
      throw new AppError('Client not found.', 404, 'CLIENT_NOT_FOUND');
    }

    const isMilestoneBased = input.billingType === ProjectBillingType.MILESTONE_BASED;
    let computedBudget = input.budget !== undefined && input.budget !== null ? Number(input.budget) : null;

    if (isMilestoneBased && input.milestones && input.milestones.length > 0) {
      const milestoneSum = input.milestones.reduce((sum, m) => sum + (Number(m.budget) || 0), 0);
      computedBudget = milestoneSum;
    }

    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: input.clientId,
          name: input.name,
          description: input.description || null,
          status: input.status || ProjectStatus.ACTIVE,
          billingType: input.billingType || ProjectBillingType.ONE_TIME,
          budget: computedBudget !== null ? new Prisma.Decimal(computedBudget) : null,
          deadline: input.deadline ? new Date(input.deadline) : null,
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              company: true,
            },
          },
        },
      });

      if (input.files && input.files.length > 0) {
        await tx.projectFile.createMany({
          data: input.files.slice(0, 5).map((f) => ({
            projectId: project.id,
            organizationId: ctx.organizationId,
            fileName: f.fileName,
            fileUrl: f.fileUrl,
            fileType: f.fileType,
            fileSize: f.fileSize,
          })),
        });
      }

      if (isMilestoneBased && input.milestones && input.milestones.length > 0) {
        await tx.milestone.createMany({
          data: input.milestones.map((m, idx) => ({
            projectId: project.id,
            organizationId: ctx.organizationId,
            title: m.title,
            description: m.description || null,
            budget: m.budget !== undefined && m.budget !== null ? new Prisma.Decimal(m.budget) : null,
            deadline: m.deadline ? new Date(m.deadline) : null,
            status: m.status || MilestoneStatus.PENDING,
            order: idx,
          })),
        });
      }

      // Activity log
      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'PROJECT_CREATED',
          entity: 'PROJECT',
          entityId: project.id,
          metadata: {
            name: project.name,
            clientId: project.clientId,
            clientName: client.name,
            filesCount: input.files?.length || 0,
          },
        },
      });

      return project;
    });
  }

  /**
   * 2. List projects with pagination, allowlisted sorting, search, and status/client filtering
   */
  async listProjects(ctx: TenantContext, query: ProjectQueryInput) {
    const { page, limit, search, status, clientId, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    let effectiveClientId = clientId;

    // Strict client isolation: CLIENT users can only see projects assigned to their client record
    if (ctx.role === 'CLIENT') {
      const clientRecord = await prisma.client.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      });

      if (!clientRecord) {
        return {
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 1,
          },
        };
      }

      effectiveClientId = clientRecord.id;
    }

    const where: Prisma.ProjectWhereInput = {
      organizationId: ctx.organizationId, // Strict tenant isolation
      ...(status && { status }),
      ...(effectiveClientId && { clientId: effectiveClientId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Strict member isolation: MEMBER users only see projects assigned to them
    if (ctx.role === 'MEMBER') {
      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      });

      if (!membership || !membership.projectId) {
        return {
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 1,
          },
        };
      }

      where.id = membership.projectId;
    }

    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              company: true,
            },
          },
          milestones: {
            orderBy: { order: 'asc' },
          },
          _count: {
            select: {
              invoices: true,
            },
          },
        },
      }),
    ]);

    return {
      data: projects.map((p) => ({
        id: p.id,
        clientId: p.clientId,
        name: p.name,
        description: p.description,
        status: p.status,
        billingType: p.billingType,
        budget: ctx.role === 'MEMBER' ? null : (p.budget ? Number(p.budget) : null),
        deadline: p.deadline,
        client: p.client,
        milestones: (p.milestones || []).map((m) => ({
          id: m.id,
          projectId: m.projectId,
          title: m.title,
          description: m.description,
          budget: m.budget ? Number(m.budget) : null,
          deadline: m.deadline,
          status: m.status,
          approvalStatus: m.approvalStatus,
          revisionNotes: m.revisionNotes,
          revisionCount: m.revisionCount,
          approvedAt: m.approvedAt,
          order: m.order,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        invoicesCount: p._count.invoices,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 3. Get single project by (id + organizationId). Returns 404 if not found or cross-tenant.
   */
  async getProjectById(ctx: TenantContext, id: string) {
    const project = await prisma.project.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId, // Strict tenant isolation
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
            phone: true,
            status: true,
          },
        },
        invoices: {
          select: {
            id: true,
            number: true,
            total: true,
            status: true,
            issueDate: true,
            dueDate: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        files: {
          orderBy: { createdAt: 'desc' },
        },
        milestones: {
          orderBy: { order: 'asc' },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                avatarUrl: true,
              },
            },
          },
        },
        meetings: {
          orderBy: { startTime: 'desc' },
          include: {
            createdBy: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    if (ctx.role === 'CLIENT') {
      const clientRecord = await prisma.client.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      });

      if (!clientRecord || project.clientId !== clientRecord.id) {
        throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
      }
    }

    if (ctx.role === 'MEMBER') {
      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      });

      if (!membership || membership.projectId !== project.id) {
        throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
      }
    }

    // Financial totals summary for this project
    const invoiceTotals = await prisma.invoice.groupBy({
      by: ['status'],
      where: {
        projectId: project.id,
        organizationId: ctx.organizationId,
        ...(ctx.role === 'CLIENT' ? { status: { not: 'DRAFT' } } : {}),
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

    const filteredInvoices = ctx.role === 'CLIENT'
      ? project.invoices.filter((inv) => inv.status !== 'DRAFT')
      : project.invoices;

    return {
      id: project.id,
      clientId: project.clientId,
      name: project.name,
      description: project.description,
      status: project.status,
      billingType: project.billingType,
      budget: project.budget ? Number(project.budget) : null,
      deadline: project.deadline,
      client: project.client,
      summary: {
        totalBilled,
        totalPaid,
        totalPending,
      },
      invoices: filteredInvoices.map((inv) => ({
        ...inv,
        total: Number(inv.total),
      })),
      files: project.files,
      milestones: (project.milestones || []).map((m) => ({
        id: m.id,
        projectId: m.projectId,
        title: m.title,
        description: m.description,
        budget: m.budget ? Number(m.budget) : null,
        deadline: m.deadline,
        status: m.status,
        approvalStatus: m.approvalStatus,
        revisionNotes: m.revisionNotes,
        revisionCount: m.revisionCount,
        approvedAt: m.approvedAt,
        order: m.order,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      teamMembers: (project.memberships || []).map((mb) => ({
        id: mb.id,
        role: mb.role,
        user: mb.user,
      })),
      meetings: (project.meetings || []).map((mt) => ({
        id: mt.id,
        title: mt.title,
        type: mt.type,
        startTime: mt.startTime,
        endTime: mt.endTime,
        status: mt.status,
        meetLink: mt.meetLink,
        hostName: mt.createdBy ? `${mt.createdBy.firstName} ${mt.createdBy.lastName}` : 'Host',
      })),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  /**
   * 4. Update project by (id + organizationId).
   */
  async updateProject(ctx: TenantContext, id: string, input: UpdateProjectInput) {
    const existing = await prisma.project.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
    });

    if (!existing) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: existing.id },
        data: {
          ...(input.status !== undefined && { status: input.status }),
          ...(input.deadline !== undefined && {
            deadline: input.deadline ? new Date(input.deadline) : null,
          }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              company: true,
            },
          },
        },
      });

      // Handle milestones updates if supplied
      if (input.milestones && Array.isArray(input.milestones)) {
        const existingMilestones = await tx.milestone.findMany({
          where: { projectId: existing.id, organizationId: ctx.organizationId },
        });
        const existingMap = new Map(existingMilestones.map((m) => [m.id, m]));
        const keptIds = new Set<string>();

        let orderIdx = 0;
        for (const m of input.milestones) {
          if (m.id && existingMap.has(m.id)) {
            // Existing milestone: update title, description, deadline, status (locked budget preserved)
            keptIds.add(m.id);
            const oldM = existingMap.get(m.id)!;
            const isNowCompleted = m.status === MilestoneStatus.COMPLETED && oldM.status !== MilestoneStatus.COMPLETED;

            await tx.milestone.update({
              where: { id: m.id },
              data: {
                title: m.title,
                description: m.description || null,
                deadline: m.deadline ? new Date(m.deadline) : null,
                status: m.status || oldM.status,
                order: orderIdx++,
                ...(isNowCompleted ? { approvalStatus: MilestoneApprovalStatus.PENDING } : {}),
              },
            });
          } else {
            // New milestone
            const created = await tx.milestone.create({
              data: {
                projectId: existing.id,
                organizationId: ctx.organizationId,
                title: m.title,
                description: m.description || null,
                budget: m.budget !== undefined && m.budget !== null ? new Prisma.Decimal(m.budget) : null,
                deadline: m.deadline ? new Date(m.deadline) : null,
                status: m.status || MilestoneStatus.PENDING,
                order: orderIdx++,
              },
            });
            keptIds.add(created.id);
          }
        }

        // Delete milestones that were removed by user
        const toDelete = existingMilestones.filter((m) => !keptIds.has(m.id));
        if (toDelete.length > 0) {
          await tx.milestone.deleteMany({
            where: { id: { in: toDelete.map((m) => m.id) } },
          });
        }

        // Recalculate total budget from current milestone deliverables
        const allCurrent = await tx.milestone.findMany({
          where: { projectId: existing.id, organizationId: ctx.organizationId },
          select: { budget: true },
        });
        const totalBudget = allCurrent.reduce((acc, m) => acc + (m.budget ? Number(m.budget) : 0), 0);
        await tx.project.update({
          where: { id: existing.id },
          data: { budget: new Prisma.Decimal(totalBudget) },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'PROJECT_UPDATED',
          entity: 'PROJECT',
          entityId: project.id,
          metadata: input as any,
        },
      });

      return project;
    });

    return {
      ...updated,
      budget: updated.budget ? Number(updated.budget) : null,
    };
  }

  /**
   * 5. Delete project (OWNER only).
   */
  async deleteProject(ctx: TenantContext, id: string) {
    const project = await prisma.project.findFirst({
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

    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    if (project._count.invoices > 0) {
      throw new AppError(
        'Cannot delete project with associated invoices. Archive or remove invoices first.',
        400,
        'PROJECT_HAS_INVOICES'
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.project.delete({
        where: { id: project.id },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'PROJECT_DELETED',
          entity: 'PROJECT',
          entityId: id,
          metadata: { name: project.name },
        },
      });
    });

    return {
      success: true,
      message: 'Project deleted successfully.',
    };
  }

  /**
   * 6. Add/upload files to existing project (Max 5 files limit per project)
   */
  async addProjectFiles(ctx: TenantContext, projectId: string, files: Array<{ fileName: string; fileUrl: string; fileType: 'pdf' | 'word'; fileSize: number }>) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    const currentCount = await prisma.projectFile.count({
      where: {
        projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (currentCount + files.length > 5) {
      throw new AppError(
        `A project can have a maximum of 5 files. Current: ${currentCount}, adding: ${files.length}.`,
        400,
        'MAX_FILES_EXCEEDED'
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const records = [];
      for (const f of files) {
        const file = await tx.projectFile.create({
          data: {
            projectId,
            organizationId: ctx.organizationId,
            fileName: f.fileName,
            fileUrl: f.fileUrl,
            fileType: f.fileType,
            fileSize: f.fileSize,
          },
        });
        records.push(file);
      }

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'PROJECT_UPDATED',
          entity: 'PROJECT',
          entityId: projectId,
          metadata: {
            action: 'FILES_UPLOADED',
            count: files.length,
          },
        },
      });

      return records;
    });

    return created;
  }

  /**
   * 7. Delete project file
   */
  async deleteProjectFile(ctx: TenantContext, projectId: string, fileId: string) {
    const file = await prisma.projectFile.findFirst({
      where: {
        id: fileId,
        projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!file) {
      throw new AppError('File not found.', 404, 'FILE_NOT_FOUND');
    }

    await prisma.projectFile.delete({
      where: { id: file.id },
    });

    return {
      success: true,
      message: 'File deleted successfully.',
    };
  }

  /**
   * 8. Add a milestone to an existing project (OWNER, MEMBER)
   */
  async addMilestone(ctx: TenantContext, projectId: string, input: CreateMilestoneInput) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    const currentCount = await prisma.milestone.count({
      where: {
        projectId,
        organizationId: ctx.organizationId,
      },
    });

    const milestone = await prisma.$transaction(async (tx) => {
      const created = await tx.milestone.create({
        data: {
          projectId,
          organizationId: ctx.organizationId,
          title: input.title,
          description: input.description || null,
          budget: input.budget !== undefined && input.budget !== null ? new Prisma.Decimal(input.budget) : null,
          deadline: input.deadline ? new Date(input.deadline) : null,
          status: input.status || MilestoneStatus.PENDING,
          order: currentCount,
        },
      });

      // Recalculate total budget if project is milestone based
      if (project.billingType === ProjectBillingType.MILESTONE_BASED) {
        const allMilestones = await tx.milestone.findMany({
          where: { projectId, organizationId: ctx.organizationId },
          select: { budget: true },
        });
        const totalBudget = allMilestones.reduce((acc, m) => acc + (m.budget ? Number(m.budget) : 0), 0);
        await tx.project.update({
          where: { id: projectId },
          data: { budget: new Prisma.Decimal(totalBudget) },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MILESTONE_CREATED',
          entity: 'PROJECT',
          entityId: projectId,
          metadata: {
            milestoneId: created.id,
            title: created.title,
          },
        },
      });

      return created;
    });

    return {
      ...milestone,
      budget: milestone.budget ? Number(milestone.budget) : null,
    };
  }

  /**
   * 9. Update a milestone (OWNER only for status changes and general details)
   */
  async updateMilestone(ctx: TenantContext, projectId: string, milestoneId: string, input: UpdateMilestoneInput) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
      },
      include: {
        client: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    const milestone = await prisma.milestone.findFirst({
      where: {
        id: milestoneId,
        projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!milestone) {
      throw new AppError('Milestone not found.', 404, 'MILESTONE_NOT_FOUND');
    }

    // If milestone status is being marked as COMPLETED by Owner, send email to client
    const isNowCompleted = input.status === MilestoneStatus.COMPLETED && milestone.status !== MilestoneStatus.COMPLETED;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.milestone.update({
        where: { id: milestone.id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.deadline !== undefined && {
            deadline: input.deadline ? new Date(input.deadline) : null,
          }),
          ...(input.status !== undefined && {
            status: input.status,
            // If moved to COMPLETED and was previously in REVISION_REQUESTED, reset approvalStatus to PENDING for fresh review
            ...(isNowCompleted ? { approvalStatus: MilestoneApprovalStatus.PENDING } : {}),
          }),
          ...(input.order !== undefined && { order: input.order }),
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MILESTONE_UPDATED',
          entity: 'PROJECT',
          entityId: projectId,
          metadata: {
            milestoneId: milestone.id,
            title: result.title,
            changes: input as any,
          },
        },
      });

      return result;
    });

    // Send email notification to client if marked as COMPLETED
    if (isNowCompleted && project.client?.email) {
      sendMilestoneCompletedEmail({
        to: project.client.email,
        clientName: project.client.name,
        projectName: project.name,
        milestoneTitle: updated.title,
        projectId: project.id,
      }).catch((err) => {
        console.warn('Failed to send milestone completed email:', err);
      });
    }

    return {
      ...updated,
      budget: updated.budget ? Number(updated.budget) : null,
    };
  }

  /**
   * 10. Client Approves Milestone
   */
  async approveMilestone(ctx: TenantContext, projectId: string, milestoneId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
      },
      include: {
        client: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    const milestone = await prisma.milestone.findFirst({
      where: {
        id: milestoneId,
        projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!milestone) {
      throw new AppError('Milestone not found.', 404, 'MILESTONE_NOT_FOUND');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.milestone.update({
        where: { id: milestone.id },
        data: {
          approvalStatus: MilestoneApprovalStatus.APPROVED,
          approvedAt: new Date(),
          status: MilestoneStatus.COMPLETED,
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MILESTONE_APPROVED',
          entity: 'PROJECT',
          entityId: projectId,
          metadata: {
            milestoneId: milestone.id,
            title: milestone.title,
          },
        },
      });

      return res;
    });

    // Notify organization owners
    const owners = await prisma.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: 'OWNER',
      },
      include: {
        user: true,
      },
    });

    for (const owner of owners) {
      if (owner.user?.email) {
        sendMilestoneApprovedEmail({
          to: owner.user.email,
          ownerName: `${owner.user.firstName} ${owner.user.lastName}`,
          clientName: project.client?.name || 'Client',
          projectName: project.name,
          milestoneTitle: updated.title,
          projectId: project.id,
        }).catch((err) => {
          console.warn('Failed to send milestone approved email to owner:', err);
        });
      }
    }

    return {
      ...updated,
      budget: updated.budget ? Number(updated.budget) : null,
    };
  }

  /**
   * 11. Client Requests Revision for Milestone
   */
  async requestMilestoneRevision(
    ctx: TenantContext,
    projectId: string,
    milestoneId: string,
    input: MilestoneRevisionInput
  ) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
      },
      include: {
        client: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    const milestone = await prisma.milestone.findFirst({
      where: {
        id: milestoneId,
        projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!milestone) {
      throw new AppError('Milestone not found.', 404, 'MILESTONE_NOT_FOUND');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.milestone.update({
        where: { id: milestone.id },
        data: {
          status: MilestoneStatus.PENDING, // Automatically set to PENDING upon revision
          approvalStatus: MilestoneApprovalStatus.REVISION_REQUESTED,
          revisionNotes: input.revisionNotes,
          revisionCount: { increment: 1 },
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MILESTONE_REVISION_REQUESTED',
          entity: 'PROJECT',
          entityId: projectId,
          metadata: {
            milestoneId: milestone.id,
            title: milestone.title,
            revisionNotes: input.revisionNotes,
          },
        },
      });

      return res;
    });

    // Notify organization owners
    const owners = await prisma.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: 'OWNER',
      },
      include: {
        user: true,
      },
    });

    for (const owner of owners) {
      if (owner.user?.email) {
        sendMilestoneRevisionEmail({
          to: owner.user.email,
          ownerName: `${owner.user.firstName} ${owner.user.lastName}`,
          clientName: project.client?.name || 'Client',
          projectName: project.name,
          milestoneTitle: updated.title,
          revisionNotes: input.revisionNotes,
          projectId: project.id,
        }).catch((err) => {
          console.warn('Failed to send milestone revision email to owner:', err);
        });
      }
    }

    return {
      ...updated,
      budget: updated.budget ? Number(updated.budget) : null,
    };
  }

  /**
   * 12. Delete a milestone (OWNER only)
   */
  async deleteMilestone(ctx: TenantContext, projectId: string, milestoneId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    const milestone = await prisma.milestone.findFirst({
      where: {
        id: milestoneId,
        projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!milestone) {
      throw new AppError('Milestone not found.', 404, 'MILESTONE_NOT_FOUND');
    }

    await prisma.$transaction(async (tx) => {
      await tx.milestone.delete({
        where: { id: milestone.id },
      });

      // Recalculate total budget if project is milestone based
      if (project.billingType === ProjectBillingType.MILESTONE_BASED) {
        const allMilestones = await tx.milestone.findMany({
          where: { projectId, organizationId: ctx.organizationId },
          select: { budget: true },
        });
        const totalBudget = allMilestones.reduce((acc, m) => acc + (m.budget ? Number(m.budget) : 0), 0);
        await tx.project.update({
          where: { id: projectId },
          data: { budget: new Prisma.Decimal(totalBudget) },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'MILESTONE_DELETED',
          entity: 'PROJECT',
          entityId: projectId,
          metadata: {
            milestoneId: milestone.id,
            title: milestone.title,
          },
        },
      });
    });

    return {
      success: true,
      message: 'Milestone deleted successfully.',
    };
  }
}

export const projectService = new ProjectService();
