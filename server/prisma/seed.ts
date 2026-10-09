import { PrismaClient, Role, ProjectStatus, InvoiceStatus, SubscriptionPlan, SubscriptionStatus, PaymentMethod } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Safety guard: refuse to run in production
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Refusing to run seed script in production environment!');
    process.exit(1);
  }

  console.log('🌱 Starting database seed...');

  // Clean up existing data in reverse relation order
  await prisma.activityLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  console.log('🧹 Cleaned up existing database records.');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create Users
  const ownerUser = await prisma.user.create({
    data: {
      email: 'owner@cliently.dev',
      passwordHash,
      firstName: 'Alex',
      lastName: 'Morgan',
      emailVerified: true,
      failedLoginAttempts: 0,
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      email: 'member@cliently.dev',
      passwordHash,
      firstName: 'Sam',
      lastName: 'Taylor',
      emailVerified: true,
      failedLoginAttempts: 0,
    },
  });

  const clientUser = await prisma.user.create({
    data: {
      email: 'client@acmecorp.com',
      passwordHash,
      firstName: 'Elena',
      lastName: 'Rostova',
      emailVerified: true,
      failedLoginAttempts: 0,
    },
  });

  console.log('👤 Created users:');
  console.log('   - Owner: owner@cliently.dev / Password123!');
  console.log('   - Member: member@cliently.dev / Password123!');
  console.log('   - Client: client@acmecorp.com / Password123!');

  // 2. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Apex Digital Studio',
      slug: 'apex-digital',
      currency: 'USD',
      defaultTaxRate: 10.0,
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 4,
    },
  });

  console.log(`🏢 Created organization: ${org.name} (${org.slug})`);

  // 3. Create Memberships
  await prisma.membership.createMany({
    data: [
      {
        userId: ownerUser.id,
        organizationId: org.id,
        role: Role.OWNER,
      },
      {
        userId: memberUser.id,
        organizationId: org.id,
        role: Role.MEMBER,
      },
      {
        userId: clientUser.id,
        organizationId: org.id,
        role: Role.CLIENT,
      },
    ],
  });

  // 4. Create Subscription
  await prisma.subscription.create({
    data: {
      organizationId: org.id,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // 5. Create Client
  const client = await prisma.client.create({
    data: {
      organizationId: org.id,
      userId: clientUser.id,
      name: 'Acme Global Innovations',
      email: 'client@acmecorp.com',
      company: 'Acme Corporation',
      phone: '+1 (555) 019-2834',
      address: '100 Enterprise Way, Suite 400, San Francisco, CA 94107',
      notes: 'Enterprise client with NET 30 payment terms.',
    },
  });

  // 6. Create Projects
  const projectAlpha = await prisma.project.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      name: 'Brand Identity & Web Application Redesign',
      description: 'Full rebrand, modern design system, and multi-tenant web application redesign.',
      status: ProjectStatus.ACTIVE,
      budget: 15000.0,
      deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    },
  });

  const projectBeta = await prisma.project.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      name: 'Mobile App Prototype & UX Research',
      description: 'Discovery sprint, wireframes, and interactive prototype.',
      status: ProjectStatus.COMPLETED,
      budget: 8500.0,
      deadline: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
  });

  // 7. Create Invoices
  // Invoice 1: PAID ($5,000 + $500 tax = $5,500)
  const inv1 = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      projectId: projectBeta.id,
      number: 'INV-0001',
      status: InvoiceStatus.PAID,
      subtotal: 5000.0,
      tax: 500.0,
      discount: 0.0,
      total: 5500.0,
      currency: 'USD',
      issueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      paidAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
      viewedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      notes: 'Thank you for your prompt payment.',
      terms: 'Payment due within 15 days of issue.',
      items: {
        create: [
          {
            description: 'Discovery & User Journey Mapping',
            qty: 20,
            rate: 125.0,
            amount: 2500.0,
          },
          {
            description: 'High-Fidelity Interactive Prototype in Figma',
            qty: 20,
            rate: 125.0,
            amount: 2500.0,
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      organizationId: org.id,
      invoiceId: inv1.id,
      amount: 5500.0,
      method: PaymentMethod.STRIPE,
      stripePaymentId: 'pi_test_seed_payment_001',
      stripeReceiptUrl: 'https://pay.stripe.com/receipts/test_001',
      paidAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
    },
  });

  // Invoice 2: SENT ($3,000 + $300 tax = $3,300)
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      projectId: projectAlpha.id,
      number: 'INV-0002',
      status: InvoiceStatus.SENT,
      subtotal: 3000.0,
      tax: 300.0,
      discount: 0.0,
      total: 3300.0,
      currency: 'USD',
      issueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      viewedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      notes: 'Phase 1 Milestone Deliverable: Brand Guidelines & Design Tokens.',
      terms: 'Payment due within 15 days of issue.',
      items: {
        create: [
          {
            description: 'Brand Guidelines, Typography, & Color System',
            qty: 1,
            rate: 1500.0,
            amount: 1500.0,
          },
          {
            description: 'Component Library & Design Tokens Setup',
            qty: 1,
            rate: 1500.0,
            amount: 1500.0,
          },
        ],
      },
    },
  });

  // Invoice 3: DRAFT ($1,500 + $150 tax = $1,650)
  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      projectId: projectAlpha.id,
      number: 'INV-0003',
      status: InvoiceStatus.DRAFT,
      subtotal: 1500.0,
      tax: 150.0,
      discount: 0.0,
      total: 1650.0,
      currency: 'USD',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      notes: 'Draft invoice for upcoming sprint kickoff.',
      terms: 'Payment due within 14 days of issue.',
      items: {
        create: [
          {
            description: 'Sprint Kickoff & Architecture Planning',
            qty: 10,
            rate: 150.0,
            amount: 1500.0,
          },
        ],
      },
    },
  });

  // 8. Create Activity Logs
  await prisma.activityLog.createMany({
    data: [
      {
        organizationId: org.id,
        userId: ownerUser.id,
        action: 'CREATED_ORGANIZATION',
        entity: 'ORGANIZATION',
        entityId: org.id,
        metadata: { name: org.name },
      },
      {
        organizationId: org.id,
        userId: ownerUser.id,
        action: 'CREATED_CLIENT',
        entity: 'CLIENT',
        entityId: client.id,
        metadata: { clientName: client.name },
      },
      {
        organizationId: org.id,
        userId: ownerUser.id,
        action: 'CREATED_INVOICE',
        entity: 'INVOICE',
        entityId: inv1.id,
        metadata: { invoiceNumber: 'INV-0001', amount: 5500.0 },
      },
    ],
  });

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
