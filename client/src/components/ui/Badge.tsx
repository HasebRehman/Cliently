import React from 'react';
import { cn } from '../../lib/utils.js';
import { Crown, UserCheck, Users, Clock } from 'lucide-react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral' | 'orange';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'default',
  size = 'md',
  ...props
}) => {
  const variants = {
    default: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-orange-50 text-orange-700 border-orange-200',
    orange: 'bg-orange-500/10 text-orange-700 border-orange-200 font-bold',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    purple: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold rounded-full border uppercase tracking-wider',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

export const InvoiceStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="neutral">Draft</Badge>;
    case 'SENT':
      return <Badge variant="info">Sent</Badge>;
    case 'VIEWED':
      return <Badge variant="default">Viewed</Badge>;
    case 'PAID':
      return <Badge variant="success">Paid</Badge>;
    case 'OVERDUE':
      return <Badge variant="danger">Overdue</Badge>;
    case 'CANCELLED':
      return <Badge variant="neutral">Cancelled</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

export const ProjectStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'PLANNING':
      return <Badge variant="purple">Planning</Badge>;
    case 'ACTIVE':
      return <Badge variant="info">Active</Badge>;
    case 'ON_HOLD':
      return <Badge variant="warning">On Hold</Badge>;
    case 'COMPLETED':
      return <Badge variant="success">Completed</Badge>;
    case 'CANCELLED':
      return <Badge variant="neutral">Cancelled</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

export const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  switch (role) {
    case 'OWNER':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200 shadow-sm">
          <Crown className="w-3 h-3 text-orange-600" />
          OWNER
        </span>
      );
    case 'MEMBER':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
          <Users className="w-3 h-3 text-slate-500" />
          MEMBER
        </span>
      );
    case 'CLIENT':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          CLIENT
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
          {role}
        </span>
      );
  }
};

export const PortalStatusBadge: React.FC<{
  status?: string;
  hasPortalAccess?: boolean;
}> = ({ status, hasPortalAccess }) => {
  if (status === 'ACTIVE' || hasPortalAccess) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
        <UserCheck className="w-3 h-3 text-blue-600" />
        JOINED
      </span>
    );
  }
  if (status === 'INVITED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
        <Clock className="w-3 h-3 text-orange-600" />
        INVITED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
      NO ACCESS
    </span>
  );
};
