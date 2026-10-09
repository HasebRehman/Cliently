import React, { useState } from 'react';
import { useToast } from '../../contexts/ToastContext.js';
import { api } from '../../lib/apiClient.js';
import {
  Calendar,
  Sparkles,
  CheckCircle2,
  X,
  ShieldCheck,
  Users,
  Loader2,
} from 'lucide-react';

interface ConnectGoogleCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueAnyway?: () => void;
}

export const ConnectGoogleCalendarModal: React.FC<ConnectGoogleCalendarModalProps> = ({
  isOpen,
  onClose,
  onContinueAnyway,
}) => {
  const { error: toastError } = useToast();
  const [isRedirecting, setIsRedirecting] = useState(false);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setIsRedirecting(true);
    try {
      const redirectUri = `${window.location.origin}/meetings`;
      const res = await api.get<{ authUrl: string }>(
        `/meetings/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`
      );
      const data = (res as any)?.data || res;
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error('No authorization URL received from server.');
      }
    } catch (err: any) {
      setIsRedirecting(false);
      toastError(err.message || 'Failed to initiate Google Calendar connection.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header - Matching App Theme */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 text-orange-400 border border-slate-700 flex items-center justify-center shadow-inner">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Connect Google Calendar
              </h3>
              <p className="text-xs text-slate-400">
                Required for 100% automated meeting sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-500 mx-auto shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-slate-900">
              Enable Auto-Sync for All Attendees
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
              Connect your Google account <strong>once</strong>. Cliently will automatically add every scheduled meeting to your Google Calendar and dispatch native invites to all clients and team members.
            </p>
          </div>

          {/* Benefits Bullet Points */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex items-start gap-2.5 text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span><strong>Zero clicks for attendees:</strong> Events appear automatically on all clients' and members' calendars.</span>
            </div>
            <div className="flex items-start gap-2.5 text-slate-700">
              <Users className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span><strong>Official Google invites:</strong> Attendees receive native Google Calendar invitations with meeting links.</span>
            </div>
            <div className="flex items-start gap-2.5 text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span><strong>One-time authorization:</strong> Set up once and all future meetings sync permanently in the background.</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isRedirecting}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold shadow-md shadow-orange-500/20 transition cursor-pointer disabled:opacity-60"
            >
              {isRedirecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Redirecting to Google...</span>
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  <span>Connect Google Calendar</span>
                </>
              )}
            </button>

            {onContinueAnyway && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onContinueAnyway();
                }}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 transition font-semibold cursor-pointer"
              >
                Schedule without Google Calendar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
