import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  title = 'Something went wrong',
  message,
  onRetry,
}) => {
  const displayMessage = message || (error ? getFriendlyErrorMessage(error) : 'An unexpected error occurred.');

  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-rose-200 bg-rose-50/50 shadow-sm max-w-lg mx-auto my-6">
      <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 mb-4 shadow-sm">
        <AlertCircle className="w-7 h-7" />
      </div>
      <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
      <p className="text-xs text-slate-600 mt-1.5 max-w-sm leading-relaxed">{displayMessage}</p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RotateCcw className="w-4 h-4" />}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
};
