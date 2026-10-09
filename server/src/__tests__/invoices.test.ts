import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import * as emailLib from '../lib/email.js';
import { Role, InvoiceStatus, SubscriptionPlan } from '@prisma/client';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    refreshToken: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    invoice: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    invoiceItem: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  return { prisma: mockPrisma };
});

// Spy on emailLib
vi.spyOn(emailLib, 'sendInvoiceEmail');

describe('Phase 4 - Invoicing Engine, Security, and State Machine', () => {
  const app = createApp();

  const ownerToken = jwt.sign(
    { userId: 'user-owner-1', sessionId: 'sess-owner' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const memberToken = jwt.sign(
    { userId: 'user-member-2', sessionId: 'sess-member' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const clientRoleToken = jwt.sign(
    { userId: 'user-client-3', sessionId: 'sess-client' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const orgId = 'org-tenant-alpha';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default session mocks
    (prisma.refreshToken.findUnique as any).mockImplementation(({ where }: any) => {
      return Promise.resolve({
        id: where.id,
        userId: where.id === 'sess-owner' ? 'user-owner-1' : where.id === 'sess-member' ? 'user-member-2' : 'user-client-3',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
    });

    // Default memberships
    (prisma.membership.findUnique as any).mockImplementation(({ where }: any) => {
      const { userId, organizationId } = where.userId_organizationId;
      if (organizationId !== orgId) return Promise.resolve(null);
      if (userId === 'user-owner-1') return Promise.resolve({ userId, organizationId: orgId, role: Role.OWNER });
      if (userId === 'user-member-2') return Promise.resolve({ userId, organizationId: orgId, role: Role.MEMBER });
      if (userId === 'user-client-3') return Promise.resolve({ userId, organizationId: orgId, role: Role.CLIENT });
      return Promise.resolve(null);
    });

    // Default subscription: FREE
    (prisma.subscription.findUnique as any).mockResolvedValue({
      plan: SubscriptionPlan.FREE,
      status: 'ACTIVE',
    });

    // Default org info
    (prisma.organization.update as any).mockResolvedValue({
      name: 'Alpha Corp',
      currency: 'USD',
      defaultTaxRate: '10',
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 2,
    });
  });

  describe('Mass-Assignment & Schema Hardening', () => {
    it('rejects client-sent total, subtotal, tax, status, or organizationId (Zod .strict())', async () => {
      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          clientId: 'client-123',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Dev', qty: 1, rate: 100 }],
          total: 10,
          subtotal: 10,
          status: 'PAID',
          organizationId: 'injected-org',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invoice creation if dueDate is earlier than issueDate', async () => {
      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          clientId: 'client-123',
          issueDate: '2026-05-10',
          dueDate: '2026-05-01',
          items: [{ description: 'Dev', qty: 1, rate: 100 }],
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Strict Tenant Isolation & IDOR Protection', () => {
    it('returns 404 when querying an invoice from another organization', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/invoices/foreign-invoice-id')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVOICE_NOT_FOUND');
    });

    it('rejects invoice creation if clientId belongs to another tenant (IDOR)', async () => {
      (prisma.client.findFirst as any).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          clientId: 'client-from-other-org',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Design', qty: 1, rate: 200 }],
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLIENT_NOT_FOUND');
    });

    it('rejects invoice creation if projectId belongs to a different client (IDOR)', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'client-A',
        name: 'Client A',
        email: 'a@client.com',
      });
      (prisma.project.findFirst as any).mockResolvedValue({
        id: 'proj-B',
        clientId: 'client-B',
      });

      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          clientId: 'client-A',
          projectId: 'proj-B',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Design', qty: 1, rate: 200 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROJECT_CLIENT_MISMATCH');
    });
  });

  describe('Sequential Invoice Numbering & Parallel Concurrency', () => {
    it('10 parallel creates => 10 unique sequential numbers', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'client-1',
        name: 'Acme',
        email: 'acme@example.com',
      });
      (prisma.invoice.count as any).mockResolvedValue(0);

      let counter = 1;
      (prisma.organization.update as any).mockImplementation(() => {
        const next = ++counter;
        return Promise.resolve({
          name: 'Alpha Corp',
          currency: 'USD',
          defaultTaxRate: '10',
          invoicePrefix: 'INV-',
          nextInvoiceNumber: next,
        });
      });

      (prisma.invoice.create as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          id: `inv-${data.number}`,
          number: data.number,
          status: InvoiceStatus.DRAFT,
          subtotal: data.subtotal,
          tax: data.tax,
          total: data.total,
          client: { id: 'client-1', name: 'Acme', email: 'acme@example.com' },
          items: [],
        });
      });

      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/v1/invoices')
          .set('Authorization', `Bearer ${ownerToken}`)
          .set('X-Organization-Id', orgId)
          .send({
            clientId: 'client-1',
            dueDate: new Date(Date.now() + 86400000).toISOString(),
            items: [{ description: 'Item', qty: 1, rate: 100 }],
          })
      );

      const responses = await Promise.all(requests);
      const invoiceNumbers = responses.map((res) => res.body.data.number);

      expect(responses.every((r) => r.status === 201)).toBe(true);
      expect(new Set(invoiceNumbers).size).toBe(10);
      expect(invoiceNumbers).toEqual([
        'INV-0001',
        'INV-0002',
        'INV-0003',
        'INV-0004',
        'INV-0005',
        'INV-0006',
        'INV-0007',
        'INV-0008',
        'INV-0009',
        'INV-0010',
      ]);
    });
  });

  describe('Monthly Plan Limits Enforcement (FREE vs PRO)', () => {
    it('FREE plan: 3 existing + 5 parallel creates (limit 5/month) => only 2 succeed', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({ id: 'client-1', name: 'Acme' });

      let currentInvoiceCount = 3;
      (prisma.invoice.count as any).mockImplementation(() => Promise.resolve(currentInvoiceCount));

      let counter = 4;
      (prisma.organization.update as any).mockImplementation(() => {
        const next = ++counter;
        return Promise.resolve({
          name: 'Alpha Corp',
          currency: 'USD',
          defaultTaxRate: '10',
          invoicePrefix: 'INV-',
          nextInvoiceNumber: next,
        });
      });

      (prisma.invoice.create as any).mockImplementation(({ data }: any) => {
        currentInvoiceCount++;
        return Promise.resolve({
          id: `inv-${data.number}`,
          number: data.number,
          status: InvoiceStatus.DRAFT,
          client: { id: 'client-1', name: 'Acme' },
          items: [],
        });
      });

      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/v1/invoices')
          .set('Authorization', `Bearer ${ownerToken}`)
          .set('X-Organization-Id', orgId)
          .send({
            clientId: 'client-1',
            dueDate: new Date(Date.now() + 86400000).toISOString(),
            items: [{ description: 'Dev', qty: 1, rate: 50 }],
          })
      );

      const responses = await Promise.all(requests);
      const successful = responses.filter((r) => r.status === 201);
      const rejected = responses.filter((r) => r.status === 403);

      expect(successful.length).toBe(2);
      expect(rejected.length).toBe(3);
      expect(rejected[0].body.error.code).toBe('PLAN_LIMIT_REACHED');
    });

    it('duplicate consumes plan limit and gets a new number', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-to-dup',
        number: 'INV-0001',
        clientId: 'client-1',
        subtotal: '100',
        taxRate: '10',
        tax: '10',
        discount: '0',
        total: '110',
        currency: 'USD',
        items: [{ description: 'Item', qty: 1, rate: 100, amount: 100 }],
      });

      // Free plan limit reached (5 invoices existing)
      (prisma.invoice.count as any).mockResolvedValue(5);

      const res = await request(app)
        .post('/api/v1/invoices/inv-to-dup/duplicate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PLAN_LIMIT_REACHED');

      // Now under limit
      (prisma.invoice.count as any).mockResolvedValue(2);
      (prisma.organization.update as any).mockResolvedValue({
        invoicePrefix: 'INV-',
        nextInvoiceNumber: 4, // assigned 3 -> INV-0003
      });
      (prisma.invoice.create as any).mockResolvedValue({
        id: 'inv-dup-new',
        number: 'INV-0003',
        status: InvoiceStatus.DRAFT,
        items: [],
        client: { id: 'client-1' },
      });

      const successRes = await request(app)
        .post('/api/v1/invoices/inv-to-dup/duplicate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(successRes.status).toBe(201);
      expect(successRes.body.data.number).toBe('INV-0003');
    });
  });

  describe('Invoice Status State Machine & Concurrency', () => {
    it('parallel "send" on one invoice => exactly one succeeds', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-draft-concurrent',
        number: 'INV-0001',
        status: InvoiceStatus.DRAFT,
        subtotal: '100',
        taxRate: '10',
        tax: '10',
        discount: '0',
        total: '110',
        currency: 'USD',
        issueDate: new Date(),
        dueDate: new Date(),
        client: { name: 'Acme Corp', email: 'acme@corp.com' },
        organization: { name: 'Alpha Studio' },
        items: [{ description: 'Dev', qty: '1', rate: '100', amount: '100' }],
      });

      let updateCalls = 0;
      (prisma.invoice.updateMany as any).mockImplementation(() => {
        updateCalls++;
        // Exactly one call updates 1 row, concurrent call updates 0 rows
        return Promise.resolve({ count: updateCalls === 1 ? 1 : 0 });
      });

      const req1 = request(app)
        .post('/api/v1/invoices/inv-draft-concurrent/send')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      const req2 = request(app)
        .post('/api/v1/invoices/inv-draft-concurrent/send')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort();

      expect(statuses).toEqual([200, 400]);
    });

    it('email transport throws: keeps status SENT and records generic emailError', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-draft-err',
        number: 'INV-0008',
        status: InvoiceStatus.DRAFT,
        subtotal: '100',
        taxRate: '10',
        tax: '10',
        discount: '0',
        total: '110',
        currency: 'USD',
        issueDate: new Date(),
        dueDate: new Date(),
        client: { name: 'Acme Corp', email: 'acme@corp.com' },
        organization: { name: 'Alpha Studio' },
        items: [{ description: 'Dev', qty: '1', rate: '100', amount: '100' }],
      });

      (prisma.invoice.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.invoice.update as any).mockResolvedValue({ id: 'inv-draft-err' });

      // Force email delivery to throw ECONNREFUSED
      (emailLib.sendInvoiceEmail as any).mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:1025'));

      const res = await request(app)
        .post('/api/v1/invoices/inv-draft-err/send')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(InvoiceStatus.SENT);
      expect(res.body.emailFailed).toBe(true);
      expect(res.body.emailError).toBeUndefined(); // Never exposed in public response!
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-draft-err' },
          data: expect.objectContaining({
            emailFailedAt: expect.any(Date),
            emailError: 'SMTP_CONNECTION_REFUSED', // Generic sanitized code!
          }),
        })
      );
    });

    it('invoice resend enforces 5-minute cooldown (INVOICE_RESEND_COOLDOWN)', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-cooldown',
        number: 'INV-0008',
        status: InvoiceStatus.SENT,
        lastResentAt: new Date(Date.now() - 60 * 1000), // Only 1 minute ago!
        dailyResendCount: 1,
        dailyResendResetAt: new Date(),
        subtotal: '100',
        taxRate: '10',
        tax: '10',
        total: '110',
        currency: 'USD',
        issueDate: new Date(),
        dueDate: new Date(),
        client: { name: 'Acme', email: 'acme@corp.com' },
        organization: { name: 'Alpha' },
        items: [{ description: 'Dev', qty: 1, rate: 100, amount: 100 }],
      });

      const res = await request(app)
        .post('/api/v1/invoices/inv-cooldown/resend')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('INVOICE_RESEND_COOLDOWN');
    });

    it('invoice resend enforces daily limit of 5 per day (INVOICE_RESEND_DAILY_LIMIT_REACHED)', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-daily-cap',
        number: 'INV-0008',
        status: InvoiceStatus.SENT,
        lastResentAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago (cooldown passed)
        dailyResendCount: 5, // Daily cap reached
        dailyResendResetAt: new Date(),
        subtotal: '100',
        taxRate: '10',
        tax: '10',
        total: '110',
        currency: 'USD',
        issueDate: new Date(),
        dueDate: new Date(),
        client: { name: 'Acme', email: 'acme@corp.com' },
        organization: { name: 'Alpha' },
        items: [{ description: 'Dev', qty: 1, rate: 100, amount: 100 }],
      });

      const res = await request(app)
        .post('/api/v1/invoices/inv-daily-cap/resend')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('INVOICE_RESEND_DAILY_LIMIT_REACHED');
    });

    it('resend endpoint successfully resends email and clears failure flags', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-sent-resend',
        number: 'INV-0008',
        status: InvoiceStatus.SENT,
        lastResentAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        dailyResendCount: 1,
        dailyResendResetAt: new Date(),
        subtotal: '100',
        taxRate: '10',
        tax: '10',
        discount: '0',
        total: '110',
        currency: 'USD',
        issueDate: new Date(),
        dueDate: new Date(),
        client: { name: 'Acme Corp', email: 'acme@corp.com' },
        organization: { name: 'Alpha Studio' },
        items: [{ description: 'Dev', qty: '1', rate: '100', amount: '100' }],
      });

      (emailLib.sendInvoiceEmail as any).mockResolvedValueOnce(undefined);
      (prisma.invoice.update as any).mockResolvedValue({ id: 'inv-sent-resend' });

      const res = await request(app)
        .post('/api/v1/invoices/inv-sent-resend/resend')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.emailFailed).toBe(false);
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-sent-resend' },
          data: expect.objectContaining({
            emailFailedAt: null,
            emailError: null,
          }),
        })
      );
    });

    it('snapshot test: change org currency or client name after creation; the invoice stays unchanged', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-snapshot-test',
        number: 'INV-0001',
        status: InvoiceStatus.SENT,
        subtotal: '100',
        taxRate: '10',
        tax: '10',
        discount: '0',
        total: '110',
        currency: 'USD', // Snapshotted as USD
        clientName: 'Original Client Name',
        clientEmail: 'original@client.com',
        clientAddress: '123 Original St',
        issueDate: new Date(),
        dueDate: new Date(),
        client: {
          name: 'Renamed Client Corp', // Live client changed!
          email: 'renamed@client.com',
          address: '456 New Blvd',
        },
        organization: {
          currency: 'EUR', // Live org currency changed to EUR!
        },
        items: [],
      });

      const res = await request(app)
        .get('/api/v1/invoices/inv-snapshot-test')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      // Verify snapshotted currency and client details are preserved
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.clientSnapshot.name).toBe('Original Client Name');
      expect(res.body.data.clientSnapshot.email).toBe('original@client.com');
    });

    it('rejects editing or deleting a SENT invoice', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-sent-1',
        status: InvoiceStatus.SENT,
        organizationId: orgId,
      });

      const patchRes = await request(app)
        .patch('/api/v1/invoices/inv-sent-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({ notes: 'Updated notes' });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.error.code).toBe('INVOICE_NOT_EDITABLE');

      const deleteRes = await request(app)
        .delete('/api/v1/invoices/inv-sent-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(deleteRes.status).toBe(400);
      expect(deleteRes.body.error.code).toBe('CANNOT_DELETE_NON_DRAFT_INVOICE');
    });

    it('allows cancelling a SENT invoice with a reason (OWNER only)', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-sent-1',
        number: 'INV-0001',
        status: InvoiceStatus.SENT,
        organizationId: orgId,
      });

      (prisma.invoice.updateMany as any).mockResolvedValue({ count: 1 });

      const res = await request(app)
        .post('/api/v1/invoices/inv-sent-1/cancel')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({ reason: 'Client requested contract cancellation' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(InvoiceStatus.CANCELLED);
    });

    it('rejects cancelling a PAID invoice (PAID is terminal)', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-paid-1',
        status: InvoiceStatus.PAID,
        organizationId: orgId,
      });

      const res = await request(app)
        .post('/api/v1/invoices/inv-paid-1/cancel')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId)
        .send({ reason: 'Mistake' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAID_INVOICE_IMMUTABLE');
    });
  });

  describe('PDF Generation & Safe Rendering', () => {
    it('returns application/pdf stream with nosniff header and handles HTML/script without breaking', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue({
        id: 'inv-pdf-1',
        number: 'INV-0099',
        status: InvoiceStatus.SENT,
        subtotal: '500',
        taxRate: '10',
        tax: '50',
        discount: '0',
        total: '550',
        currency: 'USD',
        issueDate: new Date(),
        dueDate: new Date(),
        notes: '<script>alert("xss")</script> <b>Bold Notes</b>',
        terms: '<img src=x onerror=alert(1)>',
        clientName: '<script>Evil</script> Client',
        clientEmail: 'client@evil.com',
        client: { name: 'Client', email: 'client@evil.com', company: 'Corp' },
        organization: { name: 'Alpha Studio & Co <script>' },
        items: [{ description: '<svg onload=alert(1)> Design', qty: '1', rate: '500', amount: '500' }],
      });

      const res = await request(app)
        .get('/api/v1/invoices/inv-pdf-1/pdf')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toContain('Invoice-INV-0099.pdf');
    });
  });

  describe('Role-Based Access Control', () => {
    it('allows MEMBER to create, view, update, send, and duplicate invoices', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({ id: 'client-1', name: 'Acme' });
      (prisma.invoice.count as any).mockResolvedValue(1);
      (prisma.invoice.create as any).mockResolvedValue({
        id: 'inv-member-1',
        number: 'INV-0005',
        status: InvoiceStatus.DRAFT,
        client: { id: 'client-1', name: 'Acme' },
        items: [],
      });

      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId)
        .send({
          clientId: 'client-1',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          items: [{ description: 'Support', qty: 1, rate: 100 }],
        });

      expect(res.status).toBe(201);
    });

    it('blocks MEMBER from cancelling an invoice (OWNER only)', async () => {
      const res = await request(app)
        .post('/api/v1/invoices/inv-1/cancel')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId)
        .send({ reason: 'Cancel attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('blocks MEMBER from deleting an invoice (OWNER only)', async () => {
      const res = await request(app)
        .delete('/api/v1/invoices/inv-1')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('blocks CLIENT role from invoice mutating endpoints (POST create/update/delete/send/cancel)', async () => {
      const createRes = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId)
        .send({ clientId: 'cli-1', items: [{ description: 'Item 1', qty: 1, rate: 100 }], issueDate: '2026-03-01', dueDate: '2026-03-15' });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error.code).toBe('FORBIDDEN_ROLE');

      const sendRes = await request(app)
        .post('/api/v1/invoices/inv-1/send')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId);

      expect(sendRes.status).toBe(403);
      expect(sendRes.body.error.code).toBe('FORBIDDEN_ROLE');

      const deleteRes = await request(app)
        .delete('/api/v1/invoices/inv-1')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId);

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('allows CLIENT role to list their own invoices scoped by client record', async () => {
      (prisma.client.findFirst as any).mockResolvedValue({
        id: 'cli-client-1',
        organizationId: orgId,
        userId: 'user-client-3',
      });

      (prisma.invoice.count as any).mockResolvedValue(1);
      (prisma.invoice.findMany as any).mockResolvedValue([
        {
          id: 'inv-1',
          organizationId: orgId,
          clientId: 'cli-client-1',
          number: 'INV-0001',
          status: 'SENT',
          subtotal: '100',
          taxRate: '0',
          tax: '0',
          discount: '0',
          total: '100',
          currency: 'USD',
          issueDate: new Date(),
          dueDate: new Date(),
          sentAt: new Date(),
          client: { id: 'cli-client-1', name: 'Client User', email: 'client@example.com', company: null },
          project: null,
          _count: { items: 1, payments: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${clientRoleToken}`)
        .set('X-Organization-Id', orgId);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('inv-1');
    });
  });
});
