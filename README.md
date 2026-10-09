# Cliently - Multi-Tenant Client Portal + Invoicing SaaS

Cliently is a production-grade, multi-tenant SaaS platform built for freelancers and agencies to manage clients, projects, invoices, and payments with an isolated client portal.

---

## Architecture Overview

```
Cliently/
├── client/                     # React + Vite + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── App.tsx             # Public health visualizer & UI foundation
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── server/                     # Node.js + Express + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma       # Hardened schema (15 models, enums, indexes, cascade rules)
│   │   ├── migrations/         # SQL database migration history
│   │   │   └── 20260929000000_init/migration.sql
│   │   └── seed.ts             # Test tenant, users, projects, invoices (production-guarded)
│   ├── src/
│   │   ├── config/env.ts       # Zod-validated environment config with TRUST_PROXY & secret length guards
│   │   ├── lib/
│   │   │   ├── prisma.ts       # Prisma Client singleton
│   │   │   ├── redis.ts        # Redis client singleton (with auth support)
│   │   │   └── email.ts        # HTML-sanitized email transport (MailHog/SMTP)
│   │   ├── middlewares/        # Security, auth, tenantContext, requireRole, rateLimiters
│   │   ├── modules/
│   │   │   ├── auth/           # Auth controllers, services, schemas, routes
│   │   │   ├── organization/   # Organization settings controllers & services
│   │   │   ├── members/        # Member management & last-OWNER safeguards
│   │   │   └── invites/        # Organization invitation lifecycle & acceptance
│   │   ├── utils/              # crypto, passwordPolicy (argon2id), sanitize (HTML escaping)
│   │   ├── __tests__/          # Vitest suite (40 automated tests with test-DB safety guard)
│   │   ├── app.ts              # Express configuration with trust proxy, cookies, security
│   │   └── index.ts            # Server entry point with graceful shutdown
│   ├── Dockerfile.dev          # Non-root dev container for API with hot-reload
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── worker/                     # BullMQ Background Worker
│   ├── src/index.ts            # Worker entry point
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.dev.yml      # Local dev stack (Postgres, Redis with auth, MailHog, API)
├── .env.example                # Canonical environment template (no real secrets)
├── .env                        # Local configuration (git-ignored)
├── package.json                # Monorepo workspaces configuration
└── README.md
```

---

## Phase Roadmap

- [x] **Phase 1: Monorepo setup, Docker dev compose, Prisma schema, migrations, seed script, health endpoint.**
- [x] **Phase 2: Auth + Organization + Membership + Invites + Role Middleware (Hardened).**
- [ ] Phase 3: Clients + Projects CRUD with tenant isolation.
- [ ] Phase 4: Invoices (transactions, numbering, status rules, PDF).
- [ ] Phase 5: React frontend (auth, dashboard shell, clients, projects, invoices).
- [ ] Phase 6: Redis + worker: emails, reminders, overdue, recurring.
- [ ] Phase 7: Client portal + Stripe payments + webhooks.
- [ ] Phase 8: Subscription limits, dashboard/reports, prod compose, README, polish.
