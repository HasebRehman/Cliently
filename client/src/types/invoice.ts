export type InvoiceStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface InvoiceItem {
  id?: string;
  description: string;
  qty: number | string;
  rate: number | string;
  amount?: number | string;
}

export interface Invoice {
  id: string;
  organizationId: string;
  clientId: string;
  projectId?: string | null;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  subtotal: number | string;
  discount: number | string;
  taxRate: number | string;
  tax: number | string;
  total: number | string;
  amountPaid?: number | string;
  notes?: string | null;
  terms?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  paidAt?: string | null;
  client?: {
    id: string;
    name: string;
    email: string;
    company?: string | null;
    address?: string | null;
  };
  project?: {
    id: string;
    name: string;
  } | null;
  items: InvoiceItem[];
  organization?: {
    name: string;
    currency: string;
    logoUrl?: string | null;
    defaultTaxRate?: number | string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceInput {
  clientId: string;
  projectId?: string | null;
  issueDate: string;
  dueDate: string;
  items: Array<{
    description: string;
    qty: number | string;
    rate: number | string;
  }>;
  discount?: number | string | null;
  notes?: string | null;
  terms?: string | null;
}
