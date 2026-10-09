import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
import { Skeleton } from '../ui/Skeleton.js';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 animate-pulse flex items-center justify-center text-white font-bold text-lg">
          C
        </div>
        <Skeleton className="h-4 w-40 bg-slate-800" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirectUrl}`} replace />;
  }

  return <>{children}</>;
};
