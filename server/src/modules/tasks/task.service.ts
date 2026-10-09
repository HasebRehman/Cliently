import path from 'path';
import { prisma } from '../../lib/prisma.js';
import { TenantContext } from '../../types/express.js';
import { AppError } from '../../middlewares/errorHandler.js';
import {
  CreateTaskInput,
  UpdateTaskInput,
  TaskQueryInput,
  SingleAiTaskItem,
} from './task.schema.js';
import { taskAiService, ExtractedDocument } from './task.ai.service.js';

export class TaskService {
  /**
   * List tasks for organization with role-based visibility and filters
   */
  async listTasks(ctx: TenantContext, query: TaskQueryInput) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: ctx.organizationId,
    };

    // If role is MEMBER, team members are only able to see their own assigned tasks
    if (ctx.role === 'MEMBER') {
      where.assigneeId = ctx.userId;
      if (query.projectId) {
        where.projectId = query.projectId;
      }
    } else if (ctx.role === 'CLIENT') {
      const client = await prisma.client.findFirst({
        where: { userId: ctx.userId, organizationId: ctx.organizationId },
      });
      if (client) {
        where.project = { clientId: client.id };
      } else {
        where.project = { clientId: ctx.userId };
      }
      if (query.projectId) {
        where.projectId = query.projectId;
      }
    } else {
      if (query.projectId) {
        where.projectId = query.projectId;
      }
      if (query.assigneeId) {
        where.assigneeId = query.assigneeId;
      }
    }

    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { project: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              status: true,
              billingType: true,
            },
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    return {
      data: tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single task by ID
   */
  async getTaskById(ctx: TenantContext, id: string) {
    const task = await prisma.task.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            billingType: true,
            clientId: true,
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    // Team members can only view their own assigned tasks
    if (ctx.role === 'MEMBER' && task.assigneeId !== ctx.userId) {
      throw new AppError('You only have permission to view your own assigned tasks', 403, 'FORBIDDEN');
    }

    return task;
  }

  /**
   * Create task manually
   */
  async createTask(ctx: TenantContext, data: CreateTaskInput) {
    // Validate project belongs to organization
    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!project) {
      throw new AppError('Project not found in this organization', 404, 'PROJECT_NOT_FOUND');
    }

    // If assignee specified, verify membership
    if (data.assigneeId) {
      const membership = await prisma.membership.findFirst({
        where: {
          userId: data.assigneeId,
          organizationId: ctx.organizationId,
        },
      });
      if (!membership) {
        throw new AppError('Assignee is not a member of this organization', 400, 'INVALID_ASSIGNEE');
      }
    }

    const task = await prisma.task.create({
      data: {
        organizationId: ctx.organizationId,
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        status: data.status || 'TODO',
        priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        estimatedHours: data.estimatedHours,
        createdById: ctx.userId,
        assigneeId: data.assigneeId,
        aiGenerated: false,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    return task;
  }

  /**
   * Update existing task
   */
  async updateTask(ctx: TenantContext, id: string, data: UpdateTaskInput) {
    const existing = await prisma.task.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
    });

    if (!existing) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    // Team members can only update their own assigned tasks, and only update status to TODO, IN_PROGRESS, or COMPLETED
    if (ctx.role === 'MEMBER') {
      if (existing.assigneeId !== ctx.userId) {
        throw new AppError('You only have permission to update your own assigned tasks', 403, 'FORBIDDEN');
      }
      if (data.status && !['TODO', 'IN_PROGRESS', 'COMPLETED'].includes(data.status)) {
        throw new AppError('Team members can only set status to To Do, In Progress, or Complete', 403, 'FORBIDDEN');
      }
      data = {
        status: data.status,
      };
    }

    if (data.assigneeId) {
      const membership = await prisma.membership.findFirst({
        where: {
          userId: data.assigneeId,
          organizationId: ctx.organizationId,
        },
      });
      if (!membership) {
        throw new AppError('Assignee is not a member of this organization', 400, 'INVALID_ASSIGNEE');
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(data.estimatedHours !== undefined ? { estimatedHours: data.estimatedHours } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.order !== undefined ? { order: data.order } : {}),
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Delete task
   */
  async deleteTask(ctx: TenantContext, id: string) {
    const existing = await prisma.task.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
    });

    if (!existing) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    await prisma.task.delete({
      where: { id },
    });

    return { success: true, message: 'Task deleted successfully' };
  }

  /**
   * Generate tasks with AI by analyzing project requirement documents
   */
  async generateAiTasks(
    ctx: TenantContext,
    params: {
      projectId: string;
      fileIds?: string[];
      newFiles?: Express.Multer.File[];
      customInstructions?: string;
    }
  ) {
    const project = await prisma.project.findFirst({
      where: {
        id: params.projectId,
        organizationId: ctx.organizationId,
      },
      include: {
        files: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    const documents: ExtractedDocument[] = [];

    // 1. Process existing project files if requested or if no new files provided
    const targetExistingFiles = params.fileIds && params.fileIds.length > 0
      ? project.files.filter((f) => params.fileIds!.includes(f.id))
      : (!params.newFiles || params.newFiles.length === 0)
      ? project.files
      : [];

    for (const file of targetExistingFiles) {
      try {
        let fullPath = file.fileUrl;
        if (fullPath.startsWith('/')) {
          fullPath = fullPath.slice(1);
        }
        const resolvedPath = path.isAbsolute(fullPath)
          ? fullPath
          : path.join(process.cwd(), fullPath);

        const extractedText = await taskAiService.extractTextFromFile(resolvedPath, file.fileName);
        if (extractedText.trim()) {
          documents.push({
            fileName: file.fileName,
            fileType: file.fileType,
            text: extractedText,
          });
        }
      } catch (err) {
        console.warn(`Failed reading existing file ${file.fileName}:`, err);
      }
    }

    // 2. Process newly uploaded requirement files
    if (params.newFiles && params.newFiles.length > 0) {
      for (const uploadedFile of params.newFiles) {
        try {
          const extractedText = await taskAiService.extractTextFromFile(
            uploadedFile.path,
            uploadedFile.originalname
          );
          if (extractedText.trim()) {
            documents.push({
              fileName: uploadedFile.originalname,
              fileType: path.extname(uploadedFile.originalname).replace('.', ''),
              text: extractedText,
            });
          }

          // Save newly uploaded file to project if not already there
          const relativeUrl = `uploads/projects/${path.basename(uploadedFile.path)}`;
          await prisma.projectFile.create({
            data: {
              organizationId: ctx.organizationId,
              projectId: project.id,
              fileName: uploadedFile.originalname,
              fileUrl: relativeUrl,
              fileType: uploadedFile.mimetype.includes('pdf') ? 'pdf' : 'word',
              fileSize: uploadedFile.size,
            },
          });
        } catch (err) {
          console.warn(`Failed reading uploaded file ${uploadedFile.originalname}:`, err);
        }
      }
    }

    // Check if at least one document or rich project description is available
    if (documents.length === 0 && (!project.description || project.description.length < 20)) {
      throw new AppError(
        'No requirement documents or detailed project description found to generate tasks from. Please upload requirement documents.',
        400,
        'NO_REQUIREMENT_FILES'
      );
    }

    // Call Gemini AI
    const rawAiTasks = await taskAiService.generateTasksFromRequirements({
      projectName: project.name,
      projectDescription: project.description,
      projectBillingType: project.billingType,
      projectDeadline: project.deadline,
      documents,
      customInstructions: params.customInstructions,
    });

    // Format tasks with computed due dates
    const now = Date.now();
    const formattedSuggestedTasks = rawAiTasks.map((t, idx) => {
      const days = t.suggestedDaysFromNow || (idx + 1) * 3;
      const dueDate = new Date(now + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return {
        id: `ai-task-${idx + 1}-${Date.now()}`,
        title: t.title,
        description: t.description,
        priority: t.priority,
        estimatedHours: t.estimatedHours || 8,
        dueDate,
        status: 'TODO' as const,
        projectId: project.id,
        projectName: project.name,
      };
    });

    return {
      projectId: project.id,
      projectName: project.name,
      analyzedFilesCount: documents.length,
      suggestedTasks: formattedSuggestedTasks,
    };
  }

  /**
   * Approve AI-generated tasks in bulk and save them into the project
   */
  async approveAiTasks(
    ctx: TenantContext,
    params: {
      projectId: string;
      tasks: SingleAiTaskItem[];
    }
  ) {
    const project = await prisma.project.findFirst({
      where: {
        id: params.projectId,
        organizationId: ctx.organizationId,
      },
    });

    if (!project) {
      throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    if (!params.tasks || params.tasks.length === 0) {
      throw new AppError('No tasks provided for approval', 400, 'NO_TASKS_TO_APPROVE');
    }

    // Bulk create approved tasks inside a database transaction
    const createdTasks = await prisma.$transaction(
      params.tasks.map((t, index) =>
        prisma.task.create({
          data: {
            organizationId: ctx.organizationId,
            projectId: params.projectId,
            title: t.title,
            description: t.description || null,
            status: 'TODO',
            priority: t.priority || 'MEDIUM',
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            estimatedHours: t.estimatedHours || null,
            assigneeId: t.assigneeId || null,
            createdById: ctx.userId,
            order: index,
            aiGenerated: true,
          },
          include: {
            project: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        })
      )
    );

    return {
      success: true,
      message: `Successfully created and approved ${createdTasks.length} tasks for project "${project.name}".`,
      data: createdTasks,
    };
  }
}

export const taskService = new TaskService();
