import { PrismaClient, SubscriptionPlan } from '@prisma/client';
import { AppError } from '../middlewares/errorHandler.js';
import { TenantContext } from '../types/express.js';

export const PLAN_LIMITS = {
  FREE: {
    maxClients: 3,
    maxInvoicesPerMonth: 5,
  },
  PRO: {
    maxClients: Infinity,
    maxInvoicesPerMonth: Infinity,
  },
} as const;

type LimitResource = 'clients' | 'invoices';

/**
 * Enforces tenant subscription resource limits within a transaction to prevent race conditions.
 */
export async function enforcePlanLimit(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  ctx: TenantContext,
  resource: LimitResource
): Promise<void> {
  // Fetch tenant subscription tier
  const subscription = await tx.subscription.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { plan: true, status: true },
  });

  const plan = subscription?.plan || SubscriptionPlan.FREE;

  if (plan === SubscriptionPlan.FREE) {
    if (resource === 'clients') {
      const activeClientCount = await tx.client.count({
        where: {
          organizationId: ctx.organizationId,
          status: 'ACTIVE',
        },
      });

      if (activeClientCount >= PLAN_LIMITS.FREE.maxClients) {
        throw new AppError(
          `Plan limit reached: Free plan allows a maximum of ${PLAN_LIMITS.FREE.maxClients} active clients. Please upgrade to Pro for unlimited clients.`,
          403,
          'PLAN_LIMIT_REACHED',
          {
            resource: 'clients',
            limit: PLAN_LIMITS.FREE.maxClients,
            current: activeClientCount,
            plan: 'FREE',
          }
        );
      }
    }

    if (resource === 'invoices') {
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

      const monthlyInvoiceCount = await tx.invoice.count({
        where: {
          organizationId: ctx.organizationId,
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
      });

      if (monthlyInvoiceCount >= PLAN_LIMITS.FREE.maxInvoicesPerMonth) {
        throw new AppError(
          `Plan limit reached: Free plan allows a maximum of ${PLAN_LIMITS.FREE.maxInvoicesPerMonth} invoices per calendar month. Please upgrade to Pro for unlimited invoices.`,
          403,
          'PLAN_LIMIT_REACHED',
          {
            resource: 'invoices',
            limit: PLAN_LIMITS.FREE.maxInvoicesPerMonth,
            current: monthlyInvoiceCount,
            plan: 'FREE',
          }
        );
      }
    }
  }
}
