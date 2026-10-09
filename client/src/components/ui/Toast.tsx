import React from 'react';
import { useToast, ToastItem as ToastItemType } from '../../contexts/ToastContext.js';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastItemType; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
  };

  const borderStyles = {
    success: 'border-emerald-200 bg-white shadow-lg text-slate-800',
    error: 'border-rose-200 bg-white shadow-lg text-slate-800',
    warning: 'border-orange-200 bg-white shadow-lg text-slate-800',
    info: 'border-blue-200 bg-white shadow-lg text-slate-800',
  };

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border transition-all animate-in slide-in-from-bottom-2 fade-in duration-200',
        borderStyles[toast.type]
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs font-semibold leading-relaxed text-slate-800">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="text-slate-400 hover:text-slate-700 transition p-0.5 rounded-lg hover:bg-slate-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
