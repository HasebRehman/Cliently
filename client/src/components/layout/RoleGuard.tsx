import React from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { Role } from '../../types/auth.js';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../ui/Button.js';
import { Link } from 'react-router-dom';

export interface RoleGuardProps {
  allowedRoles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children, fallback }) => {
  const { currentRole, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!currentRole || !allowedRoles.includes(currentRole)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto my-12 bg-slate-900/60 border border-slate-800 rounded-2xl">
        <div className="w-12 h-12 rounded-xl bg-amber-950/60 border border-amber-800/60 text-amber-400 flex items-center justify-center mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Access Restricted</h2>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Your current role (<strong className="text-slate-200">{currentRole || 'CLIENT'}</strong>) does not have permission to view or manage this section.
        </p>
        <Link to="/dashboard">
          <Button variant="secondary" size="sm">
            Return to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};
