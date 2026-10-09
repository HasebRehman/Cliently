import { TenantContext } from '../types/express.js';
import { AppError } from '../middlewares/errorHandler.js';

/**
 * Ensures a query filter object always includes the verified organizationId from request context
 */
export function tenantScope<T extends Record<string, any>>(
  ctx: TenantContext | undefined,
  additionalFilters: T = {} as T
): T & { organizationId: string } {
  if (!ctx || !ctx.organizationId) {
    throw new AppError(
      'Tenant isolation error: Cannot execute scoped query without verified organizationId context.',
      500,
      'TENANT_CONTEXT_MISSING'
    );
  }

  return {
    ...additionalFilters,
    organizationId: ctx.organizationId,
  };
}

/**
 * Helper for Phase 7 Client Portal scoping: enforces that portal queries are filtered by both organizationId and clientId
 */
export function clientScope<T extends Record<string, any>>(
  ctx: TenantContext | undefined,
  clientId: string,
  additionalFilters: T = {} as T
): T & { organizationId: string; clientId: string } {
  if (!ctx || !ctx.organizationId) {
    throw new AppError(
      'Tenant isolation error: Cannot execute client portal query without verified organizationId context.',
      500,
      'TENANT_CONTEXT_MISSING'
    );
  }

  if (!clientId) {
    throw new AppError(
      'Client portal isolation error: Missing verified clientId.',
      403,
      'CLIENT_ID_REQUIRED'
    );
  }

  return {
    ...additionalFilters,
    organizationId: ctx.organizationId,
    clientId,
  };
}

/**
 * Scopes invoices for Client Portal: filters by organizationId, verified clientId, and non-DRAFT status
 */
export function portalInvoiceScope<T extends Record<string, any>>(
  ctx: TenantContext | undefined,
  clientId: string,
  additionalFilters: T = {} as T
): T & { organizationId: string; clientId: string; status: { not: 'DRAFT' } } {
  const base = clientScope(ctx, clientId, additionalFilters);
  return {
    ...base,
    status: { not: 'DRAFT' as const },
  };
}

/**
 * Resolves the verified Client record linked to a CLIENT role user account in the active organization
 */
export async function resolveClientPortalScope(
  prismaClient: { client: { findFirst: (...args: any[]) => Promise<any> } },
  ctx: TenantContext
): Promise<{ organizationId: string; clientId: string }> {
  if (!ctx || !ctx.organizationId || !ctx.userId) {
    throw new AppError('Context missing for portal scope resolution.', 500, 'TENANT_CONTEXT_MISSING');
  }

  const client = await prismaClient.client.findFirst({
    where: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    },
    select: { id: true },
  });

  if (!client) {
    throw new AppError(
      'Access denied: No client profile linked to your user account in this organization.',
      403,
      'PORTAL_CLIENT_LINK_NOT_FOUND'
    );
  }

  return {
    organizationId: ctx.organizationId,
    clientId: client.id,
  };
}


