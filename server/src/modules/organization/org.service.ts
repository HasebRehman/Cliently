import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { TenantContext } from '../../types/express.js';
import { UpdateOrgInput } from './org.schema.js';

export class OrganizationService {
  /**
   * List all organizations for the authenticated user
   */
  async listUserOrganizations(userId: string) {
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            subscription: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      logoUrl: m.organization.logoUrl,
      currency: m.organization.currency,
      role: m.role,
      plan: m.organization.subscription?.plan || 'FREE',
      joinedAt: m.createdAt,
    }));
  }

  /**
   * Get settings for the active organization
   */
  async getCurrentOrganization(ctx: TenantContext) {
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      include: {
        subscription: true,
        _count: {
          select: {
            memberships: true,
            clients: true,
            projects: true,
            invoices: true,
          },
        },
      },
    });

    if (!org) {
      throw new AppError('Organization not found.', 404, 'ORG_NOT_FOUND');
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
      currency: org.currency,
      defaultTaxRate: Number(org.defaultTaxRate),
      invoicePrefix: org.invoicePrefix,
      nextInvoiceNumber: org.nextInvoiceNumber,
      plan: org.subscription?.plan || 'FREE',
      subscriptionStatus: org.subscription?.status || 'ACTIVE',
      stats: org._count,
      createdAt: org.createdAt,
      userRole: ctx.role,
    };
  }

  /**
   * Update settings for the active organization (OWNER only)
   */
  async updateCurrentOrganization(ctx: TenantContext, input: UpdateOrgInput) {
    const updated = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: ctx.organizationId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
          ...(input.currency !== undefined && { currency: input.currency }),
          ...(input.defaultTaxRate !== undefined && { defaultTaxRate: input.defaultTaxRate }),
          ...(input.invoicePrefix !== undefined && { invoicePrefix: input.invoicePrefix }),
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'ORG_SETTINGS_UPDATED',
          entity: 'ORGANIZATION',
          entityId: org.id,
          metadata: input as any,
        },
      });

      return org;
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      logoUrl: updated.logoUrl,
      currency: updated.currency,
      defaultTaxRate: Number(updated.defaultTaxRate),
      invoicePrefix: updated.invoicePrefix,
      nextInvoiceNumber: updated.nextInvoiceNumber,
      updatedAt: updated.updatedAt,
    };
  }
}

export const organizationService = new OrganizationService();
