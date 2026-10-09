import { InvoiceStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { TenantContext } from '../../types/express.js';
import { enforcePlanLimit } from '../../utils/planLimits.js';
import { calculateInvoiceTotals } from '../../utils/invoiceCalculator.js';
import { generateInvoicePdf } from '../../utils/invoicePdf.js';
import { sendInvoiceEmail } from '../../lib/email.js';
import { assertValidTransition } from './invoiceStateMachine.js';
import {
  CreateInvoiceInput,
  UpdateInvoiceInput,
  CancelInvoiceInput,
  InvoiceQueryInput,
} from './invoice.schema.js';

function mapGenericEmailErrorCode(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('refuse') || msg.includes('econnrefused')) {
    return 'SMTP_CONNECTION_REFUSED';
  }
  if (msg.includes('timeout') || msg.includes('etimedout')) {
    return 'SMTP_TIMEOUT';
  }
  if (msg.includes('auth') || msg.includes('login') || msg.includes('credential')) {
    return 'SMTP_AUTH_FAILED';
  }
  return 'EMAIL_SEND_FAILED';
}

export class InvoiceService {
  /**
   * 1. Create Invoice: Scoped to tenant, enforces plan limits, generates sequential number,
   * validates client/project IDOR, snapshots currency/taxRate/client info, and calculates totals.
   */
  async createInvoice(ctx: TenantContext, input: CreateInvoiceInput) {
    // 1. IDOR: Validate client belongs to active tenant
    const client = await prisma.client.findFirst({
      where: {
        id: input.clientId,
        organizationId: ctx.organizationId,
      },
    });

    if (!client) {
      throw new AppError('Client not found in your organization.', 404, 'CLIENT_NOT_FOUND');
    }

    // 2. IDOR: If project is specified, validate project belongs to active tenant AND this client
    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: ctx.organizationId,
        },
      });

      if (!project) {
        throw new AppError('Project not found in your organization.', 404, 'PROJECT_NOT_FOUND');
      }

      if (project.clientId !== input.clientId) {
        throw new AppError(
          'Project does not belong to the selected client.',
          400,
          'PROJECT_CLIENT_MISMATCH'
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      // 3. Enforce monthly plan limits inside transaction
      await enforcePlanLimit(tx, ctx, 'invoices');

      // 4. Atomically increment Organization.nextInvoiceNumber and fetch org defaults
      const updatedOrg = await tx.organization.update({
        where: { id: ctx.organizationId },
        data: {
          nextInvoiceNumber: { increment: 1 },
        },
        select: {
          name: true,
          currency: true,
          defaultTaxRate: true,
          invoicePrefix: true,
          nextInvoiceNumber: true,
        },
      });

      const assignedNumber = updatedOrg.nextInvoiceNumber - 1;
      const formattedInvoiceNumber = `${updatedOrg.invoicePrefix}${String(assignedNumber).padStart(4, '0')}`;

      // 5. Calculate line item amounts, subtotal, discount, tax, and total
      const taxRateNumber = Number(updatedOrg.defaultTaxRate || 0);
      const totals = calculateInvoiceTotals({
        items: input.items,
        discount: input.discount,
        taxRate: taxRateNumber,
      });

      // 6. Create Invoice record with items and snapshotted values
      const invoice = await tx.invoice.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: input.clientId,
          projectId: input.projectId || null,
          number: formattedInvoiceNumber,
          status: InvoiceStatus.DRAFT,
          subtotal: new Prisma.Decimal(totals.subtotal),
          taxRate: new Prisma.Decimal(totals.taxRate),
          tax: new Prisma.Decimal(totals.tax),
          discount: new Prisma.Decimal(totals.discount),
          total: new Prisma.Decimal(totals.total),
          currency: updatedOrg.currency,
          clientName: client.name,
          clientEmail: client.email,
          clientAddress: client.address || null,
          issueDate: new Date(input.issueDate),
          dueDate: new Date(input.dueDate),
          notes: input.notes || null,
          terms: input.terms || null,
          items: {
            create: totals.items.map((item) => ({
              description: item.description,
              qty: new Prisma.Decimal(item.qty),
              rate: new Prisma.Decimal(item.rate),
              amount: new Prisma.Decimal(item.amount),
            })),
          },
        },
        include: {
          items: true,
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

      // 7. Activity Log
      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'INVOICE_CREATED',
          entity: 'INVOICE',
          entityId: invoice.id,
          metadata: {
            number: invoice.number,
            total: totals.total,
            status: invoice.status,
          },
        },
      });

      return invoice;
    });
  }

  /**
   * 2. List Invoices: Pagination, filtering, searching, and allowlisted sorting
   */
  async listInvoices(ctx: TenantContext, query: InvoiceQueryInput) {
    const { page, limit, status, clientId, projectId, startDate, endDate, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    let effectiveClientId = clientId;

    // Strict client isolation: CLIENT users can only see invoices assigned to their client record
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

    const where: Prisma.InvoiceWhereInput = {
      organizationId: ctx.organizationId, // Strict tenant isolation
      ...(status
        ? { status }
        : ctx.role === 'CLIENT'
        ? { status: { not: InvoiceStatus.DRAFT } }
        : {}),
      ...(effectiveClientId && { clientId: effectiveClientId }),
      ...(projectId && { projectId }),
      ...(search && { number: { contains: search, mode: 'insensitive' } }),
      ...(startDate && { issueDate: { gte: new Date(startDate) } }),
      ...(endDate && { issueDate: { lte: new Date(endDate) } }),
    };

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
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
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              items: true,
              payments: true,
            },
          },
        },
      }),
    ]);

    return {
      data: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        subtotal: Number(inv.subtotal),
        taxRate: Number(inv.taxRate),
        tax: Number(inv.tax),
        discount: Number(inv.discount),
        total: Number(inv.total),
        currency: inv.currency,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        sentAt: inv.sentAt,
        client: inv.client,
        project: inv.project,
        itemsCount: inv._count.items,
        paymentsCount: inv._count.payments,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
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
   * 3. Get single invoice by ID with items, client snapshots, and payments
   */
  async getInvoiceById(ctx: TenantContext, id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId, // Strict tenant isolation
      },
      include: {
        items: true,
        client: true,
        project: true,
        payments: true,
      },
    });

    if (!invoice) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    if (ctx.role === 'CLIENT') {
      const clientRecord = await prisma.client.findFirst({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
      });
      if (!clientRecord || invoice.clientId !== clientRecord.id || invoice.status === InvoiceStatus.DRAFT) {
        throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
      }
    }

    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      subtotal: Number(invoice.subtotal),
      taxRate: Number(invoice.taxRate),
      tax: Number(invoice.tax),
      discount: Number(invoice.discount),
      total: Number(invoice.total),
      currency: invoice.currency,
      clientSnapshot: {
        name: invoice.clientName || invoice.client.name,
        email: invoice.clientEmail || invoice.client.email,
        address: invoice.clientAddress || invoice.client.address,
      },
      client: invoice.client,
      project: invoice.project,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      terms: invoice.terms,
      sentAt: invoice.sentAt,
      viewedAt: invoice.viewedAt,
      paidAt: invoice.paidAt,
      cancelledAt: invoice.cancelledAt,
      cancellationReason: invoice.cancellationReason,
      items: invoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        qty: Number(item.qty),
        rate: Number(item.rate),
        amount: Number(item.amount),
      })),
      payments: invoice.payments,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }

  /**
   * 4. Update Invoice: Only allowed while DRAFT. Recalculates totals and replaces items.
   */
  async updateInvoice(ctx: TenantContext, id: string, input: UpdateInvoiceInput) {
    const existing = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      include: {
        items: true,
      },
    });

    if (!existing) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    if (existing.status !== InvoiceStatus.DRAFT) {
      throw new AppError(
        `Only DRAFT invoices can be edited. Current status is ${existing.status}.`,
        400,
        'INVOICE_NOT_EDITABLE'
      );
    }

    // IDOR validations if client or project changed
    const clientId = input.clientId || existing.clientId;
    if (input.clientId && input.clientId !== existing.clientId) {
      const client = await prisma.client.findFirst({
        where: {
          id: input.clientId,
          organizationId: ctx.organizationId,
        },
      });
      if (!client) {
        throw new AppError('Client not found in your organization.', 404, 'CLIENT_NOT_FOUND');
      }
    }

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: ctx.organizationId,
        },
      });
      if (!project) {
        throw new AppError('Project not found in your organization.', 404, 'PROJECT_NOT_FOUND');
      }
      if (project.clientId !== clientId) {
        throw new AppError('Project does not belong to the selected client.', 400, 'PROJECT_CLIENT_MISMATCH');
      }
    }

    return prisma.$transaction(async (tx) => {
      let totals: ReturnType<typeof calculateInvoiceTotals> | undefined;

      // Recalculate if items or discount is provided
      if (input.items || input.discount !== undefined) {
        const itemsToCalculate = input.items || existing.items.map((it) => ({
          description: it.description,
          qty: Number(it.qty),
          rate: Number(it.rate),
        }));

        const discountToCalculate = input.discount !== undefined ? input.discount : Number(existing.discount);

        totals = calculateInvoiceTotals({
          items: itemsToCalculate,
          discount: discountToCalculate,
          taxRate: Number(existing.taxRate),
        });

        // Replace items
        if (input.items) {
          await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
          await tx.invoiceItem.createMany({
            data: totals.items.map((it) => ({
              invoiceId: id,
              description: it.description,
              qty: new Prisma.Decimal(it.qty),
              rate: new Prisma.Decimal(it.rate),
              amount: new Prisma.Decimal(it.amount),
            })),
          });
        }
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          ...(input.clientId && { clientId: input.clientId }),
          ...(input.projectId !== undefined && { projectId: input.projectId }),
          ...(input.issueDate && { issueDate: new Date(input.issueDate) }),
          ...(input.dueDate && { dueDate: new Date(input.dueDate) }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.terms !== undefined && { terms: input.terms }),
          ...(totals && {
            subtotal: new Prisma.Decimal(totals.subtotal),
            discount: new Prisma.Decimal(totals.discount),
            tax: new Prisma.Decimal(totals.tax),
            total: new Prisma.Decimal(totals.total),
          }),
        },
        include: {
          items: true,
          client: true,
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'INVOICE_UPDATED',
          entity: 'INVOICE',
          entityId: id,
          metadata: { number: updated.number },
        },
      });

      return updated;
    });
  }

  /**
   * 5. Delete Invoice: Only allowed for DRAFT invoices (OWNER only).
   */
  async deleteInvoice(ctx: TenantContext, id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
    });

    if (!invoice) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new AppError(
        `Only DRAFT invoices can be deleted. Sent invoices must be cancelled instead. Current status is ${invoice.status}.`,
        400,
        'CANNOT_DELETE_NON_DRAFT_INVOICE'
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.delete({
        where: { id: invoice.id },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'INVOICE_DELETED',
          entity: 'INVOICE',
          entityId: id,
          metadata: { number: invoice.number },
        },
      });
    });

    return {
      success: true,
      message: 'Draft invoice deleted successfully.',
    };
  }

  /**
   * 6. Send Invoice: Transitions DRAFT -> SENT, sets sentAt, generates PDF, and sends email.
   * Uses conditional update to prevent double-send race conditions.
   */
  async sendInvoice(ctx: TenantContext, id: string) {
    const existing = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      include: {
        items: true,
        client: true,
        organization: true,
      },
    });

    if (!existing) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    assertValidTransition(existing.status, InvoiceStatus.SENT);

    // Conditional atomic status transition
    const updateResult = await prisma.invoice.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
        status: InvoiceStatus.DRAFT, // Enforce single transition
      },
      data: {
        status: InvoiceStatus.SENT,
        sentAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      throw new AppError(
        'Invoice could not be sent. It may have already been sent or is no longer in DRAFT status.',
        400,
        'INVOICE_ALREADY_SENT'
      );
    }

    // Write Activity Log
    await prisma.activityLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'INVOICE_SENT',
        entity: 'INVOICE',
        entityId: id,
        metadata: { number: existing.number, sentTo: existing.clientEmail || existing.client.email },
      },
    });

    // Generate PDF & Send Email
    const pdfBuffer = await generateInvoicePdf({
      organizationName: existing.organization.name,
      invoiceNumber: existing.number,
      issueDate: existing.issueDate,
      dueDate: existing.dueDate,
      currency: existing.currency,
      status: 'SENT',
      client: {
        name: existing.clientName || existing.client.name,
        email: existing.clientEmail || existing.client.email,
        company: existing.client.company,
        address: existing.clientAddress || existing.client.address,
      },
      items: existing.items.map((it) => ({
        description: it.description,
        qty: Number(it.qty),
        rate: Number(it.rate),
        amount: Number(it.amount),
      })),
      subtotal: Number(existing.subtotal),
      discount: Number(existing.discount),
      taxRate: Number(existing.taxRate),
      tax: Number(existing.tax),
      total: Number(existing.total),
      notes: existing.notes,
      terms: existing.terms,
    });

    const recipientEmail = existing.clientEmail || existing.client.email;
    let emailDelivered = true;
    let genericErrorCode: string | null = null;

    try {
      await sendInvoiceEmail({
        to: recipientEmail,
        clientName: existing.clientName || existing.client.name,
        orgName: existing.organization.name,
        invoiceNumber: existing.number,
        total: Number(existing.total),
        currency: existing.currency,
        dueDate: existing.dueDate,
        pdfBuffer,
      });
    } catch (err) {
      emailDelivered = false;
      genericErrorCode = mapGenericEmailErrorCode(err);

      // Store only sanitized generic error code
      await prisma.invoice.update({
        where: { id },
        data: {
          emailFailedAt: new Date(),
          emailError: genericErrorCode,
        },
      });
    }

    return {
      success: true,
      message: emailDelivered
        ? `Invoice ${existing.number} sent to ${recipientEmail}.`
        : `Invoice ${existing.number} status set to SENT, but email delivery failed. You can use /resend to try again.`,
      emailFailed: !emailDelivered,
      invoiceId: existing.id,
      status: InvoiceStatus.SENT,
    };
  }

  /**
   * Resend Invoice Email (OWNER or MEMBER - only for SENT, VIEWED, OVERDUE)
   * Enforces 5-minute cooldown and 5-per-day cap to prevent email bombing/abuse.
   */
  async resendInvoice(ctx: TenantContext, id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      include: {
        items: true,
        client: true,
        organization: true,
      },
    });

    if (!invoice) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    const allowedResendStatuses: InvoiceStatus[] = [
      InvoiceStatus.SENT,
      InvoiceStatus.VIEWED,
      InvoiceStatus.OVERDUE,
    ];

    if (!allowedResendStatuses.includes(invoice.status)) {
      throw new AppError(
        `Invoice cannot be resent from status ${invoice.status}. Only SENT, VIEWED, or OVERDUE invoices can be resent.`,
        400,
        'CANNOT_RESEND_INVOICE'
      );
    }

    const now = new Date();

    // 1. Cooldown Check: 5 minutes between resends per invoice
    if (invoice.lastResentAt) {
      const timeSinceLastResend = now.getTime() - new Date(invoice.lastResentAt).getTime();
      const cooldownMs = 5 * 60 * 1000;
      if (timeSinceLastResend < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastResend) / 1000);
        throw new AppError(
          `Please wait ${remainingSeconds} seconds before resending this invoice (cooldown: 5 minutes).`,
          429,
          'INVOICE_RESEND_COOLDOWN'
        );
      }
    }

    // 2. Daily Cap Check: Maximum 5 resends per calendar day per invoice
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    let currentDailyCount = invoice.dailyResendCount;

    if (!invoice.dailyResendResetAt || new Date(invoice.dailyResendResetAt) < startOfToday) {
      currentDailyCount = 0;
    }

    if (currentDailyCount >= 5) {
      throw new AppError(
        'Daily resend limit reached for this invoice (maximum 5 resends per day). Please try again tomorrow.',
        429,
        'INVOICE_RESEND_DAILY_LIMIT_REACHED'
      );
    }

    const pdfBuffer = await generateInvoicePdf({
      organizationName: invoice.organization.name,
      invoiceNumber: invoice.number,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      status: invoice.status,
      client: {
        name: invoice.clientName || invoice.client.name,
        email: invoice.clientEmail || invoice.client.email,
        company: invoice.client.company,
        address: invoice.clientAddress || invoice.client.address,
      },
      items: invoice.items.map((it) => ({
        description: it.description,
        qty: Number(it.qty),
        rate: Number(it.rate),
        amount: Number(it.amount),
      })),
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      taxRate: Number(invoice.taxRate),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      notes: invoice.notes,
      terms: invoice.terms,
    });

    const recipientEmail = invoice.clientEmail || invoice.client.email;
    let emailDelivered = true;
    let genericErrorCode: string | null = null;

    try {
      await sendInvoiceEmail({
        to: recipientEmail,
        clientName: invoice.clientName || invoice.client.name,
        orgName: invoice.organization.name,
        invoiceNumber: invoice.number,
        total: Number(invoice.total),
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        pdfBuffer,
      });

      await prisma.invoice.update({
        where: { id },
        data: {
          lastResentAt: now,
          dailyResendCount: currentDailyCount + 1,
          dailyResendResetAt: now,
          sentAt: now,
          emailFailedAt: null,
          emailError: null,
        },
      });
    } catch (err) {
      emailDelivered = false;
      genericErrorCode = mapGenericEmailErrorCode(err);

      await prisma.invoice.update({
        where: { id },
        data: {
          lastResentAt: now,
          dailyResendCount: currentDailyCount + 1,
          dailyResendResetAt: now,
          emailFailedAt: now,
          emailError: genericErrorCode,
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'INVOICE_RESENT',
        entity: 'INVOICE',
        entityId: id,
        metadata: {
          number: invoice.number,
          emailDelivered,
        },
      },
    });

    return {
      success: true,
      message: emailDelivered
        ? `Invoice ${invoice.number} resent to ${recipientEmail}.`
        : `Invoice email delivery failed upon resend attempt.`,
      emailFailed: !emailDelivered,
      invoiceId: invoice.id,
      status: invoice.status,
    };
  }

  /**
   * 7. Cancel Invoice: SENT/VIEWED/OVERDUE -> CANCELLED (OWNER only).
   */
  async cancelInvoice(ctx: TenantContext, id: string, input: CancelInvoiceInput) {
    const existing = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
    });

    if (!existing) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    assertValidTransition(existing.status, InvoiceStatus.CANCELLED);

    // Conditional atomic status transition
    const updateResult = await prisma.invoice.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE] },
      },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: input.reason,
      },
    });

    if (updateResult.count === 0) {
      throw new AppError(
        `Invoice cannot be cancelled from status ${existing.status}.`,
        400,
        'CANNOT_CANCEL_INVOICE'
      );
    }

    await prisma.activityLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'INVOICE_CANCELLED',
        entity: 'INVOICE',
        entityId: id,
        metadata: { number: existing.number, reason: input.reason },
      },
    });

    return {
      success: true,
      message: `Invoice ${existing.number} cancelled successfully.`,
      status: InvoiceStatus.CANCELLED,
    };
  }

  /**
   * 8. Duplicate Invoice: Creates a new DRAFT copy with fresh sequential number and duplicate items.
   */
  async duplicateInvoice(ctx: TenantContext, id: string) {
    const existing = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      include: {
        items: true,
        client: true,
      },
    });

    if (!existing) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    return prisma.$transaction(async (tx) => {
      // 1. Enforce monthly plan limits
      await enforcePlanLimit(tx, ctx, 'invoices');

      // 2. Increment nextInvoiceNumber
      const updatedOrg = await tx.organization.update({
        where: { id: ctx.organizationId },
        data: {
          nextInvoiceNumber: { increment: 1 },
        },
        select: {
          invoicePrefix: true,
          nextInvoiceNumber: true,
        },
      });

      const assignedNumber = updatedOrg.nextInvoiceNumber - 1;
      const formattedInvoiceNumber = `${updatedOrg.invoicePrefix}${String(assignedNumber).padStart(4, '0')}`;

      // 3. Create duplicate in DRAFT status
      const duplicated = await tx.invoice.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: existing.clientId,
          projectId: existing.projectId,
          number: formattedInvoiceNumber,
          status: InvoiceStatus.DRAFT,
          subtotal: existing.subtotal,
          taxRate: existing.taxRate,
          tax: existing.tax,
          discount: existing.discount,
          total: existing.total,
          currency: existing.currency,
          clientName: existing.clientName,
          clientEmail: existing.clientEmail,
          clientAddress: existing.clientAddress,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Default 14 days
          notes: existing.notes,
          terms: existing.terms,
          items: {
            create: existing.items.map((it) => ({
              description: it.description,
              qty: it.qty,
              rate: it.rate,
              amount: it.amount,
            })),
          },
        },
        include: {
          items: true,
          client: true,
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'INVOICE_DUPLICATED',
          entity: 'INVOICE',
          entityId: duplicated.id,
          metadata: {
            originalId: existing.id,
            originalNumber: existing.number,
            newNumber: duplicated.number,
          },
        },
      });

      return duplicated;
    });
  }

  /**
   * 9. Generate Invoice PDF Buffer (tenant scoped)
   */
  async getInvoicePdf(ctx: TenantContext, id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      include: {
        items: true,
        client: true,
        organization: true,
      },
    });

    if (!invoice) {
      throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
    }

    if (ctx.role === 'CLIENT') {
      const clientRecord = await prisma.client.findFirst({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
      });
      if (!clientRecord || invoice.clientId !== clientRecord.id || invoice.status === InvoiceStatus.DRAFT) {
        throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND');
      }
    }

    const pdfBuffer = await generateInvoicePdf({
      organizationName: invoice.organization.name,
      invoiceNumber: invoice.number,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      status: invoice.status,
      client: {
        name: invoice.clientName || invoice.client.name,
        email: invoice.clientEmail || invoice.client.email,
        company: invoice.client.company,
        address: invoice.clientAddress || invoice.client.address,
      },
      items: invoice.items.map((it) => ({
        description: it.description,
        qty: Number(it.qty),
        rate: Number(it.rate),
        amount: Number(it.amount),
      })),
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      taxRate: Number(invoice.taxRate),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      notes: invoice.notes,
      terms: invoice.terms,
    });

    return {
      pdfBuffer,
      filename: `Invoice-${invoice.number}.pdf`,
    };
  }
}

export const invoiceService = new InvoiceService();
