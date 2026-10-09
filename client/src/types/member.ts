import { Role } from './auth.js';

export interface OrgMember {
  id: string;
  userId: string;
  organizationId: string;
  role: Role;
  projectId?: string | null;
  project?: {
    id: string;
    name: string;
    client?: {
      id: string;
      name: string;
    } | null;
  } | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    avatarUrl?: string | null;
  };
}

export interface UpdateMemberInput {
  phone?: string | null;
  projectId?: string | null;
}

export interface PendingInvite {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
  invitedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  currency: string;
  defaultTaxRate: number;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  plan: string;
  subscriptionStatus: string;
  stats?: {
    memberships: number;
    clients: number;
    projects: number;
    invoices: number;
  };
  createdAt: string;
  userRole: Role;
}

export interface UpdateOrgInput {
  name?: string;
  logoUrl?: string | null;
  currency?: string;
  defaultTaxRate?: number;
  invoicePrefix?: string;
}
