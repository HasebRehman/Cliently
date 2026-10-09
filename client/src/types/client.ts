export type ClientStatus = 'ACTIVE' | 'ARCHIVED';
export type PortalStatus = 'ACTIVE' | 'INVITED' | 'NOT_INVITED';

export interface Client {
  id: string;
  organizationId: string;
  userId?: string | null;
  name: string;
  email: string;
  company?: string | null;
  address?: string | null;
  phone?: string | null;
  notes?: string | null;
  status: ClientStatus;
  portalStatus?: PortalStatus;
  hasPortalAccess?: boolean;
  lastInviteSentAt?: string | null;
  canSendInvite?: boolean;
  portalUser?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  _count?: {
    projects: number;
    invoices: number;
  };
  projects?: Array<{
    id: string;
    name: string;
    status: string;
    budget?: number | string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ClientInput {
  name: string;
  email: string;
  company?: string | null;
  address?: string | null;
  phone?: string | null;
  notes?: string | null;
  status?: ClientStatus;
}
