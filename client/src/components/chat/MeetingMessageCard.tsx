import React from 'react';
import { ChatMessage } from '../../types/chat.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { Video, CheckCircle2, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface MeetingMessageCardProps {
  message: ChatMessage;
  onJoinMeeting?: (meetingId: string) => void;
}

export const MeetingMessageCard: React.FC<MeetingMessageCardProps> = ({
  message,
  onJoinMeeting,
}) => {
  const { user } = useAuth();
  const meeting = message.meeting;
  const meetingId = message.meetingId || meeting?.id;

  const title = meeting?.title || message.content || 'Instant Video Meeting';
  const rawStatus = meeting?.status || 'live';
  const now = new Date();
  const isExpired =
    rawStatus === 'expired' ||
    (rawStatus !== 'live' &&
      rawStatus !== 'ended' &&
      meeting?.endTime &&
      new Date(meeting.endTime) < now);
  const isLive = rawStatus === 'live' && !isExpired;
  const isHost = meeting?.createdById === user?.id || message.senderId === user?.id;
  const hostName = meeting?.hostName || message.senderName || 'Team Member';

  const handleJoin = () => {
    if (isLive && meetingId && onJoinMeeting) {
      onJoinMeeting(meetingId);
    }
  };

  return (
    <div
      className={cn(
        'w-full max-w-sm rounded-2xl border p-4 shadow-md transition-all duration-200 text-left',
        isLive
          ? 'bg-slate-900 border-blue-500/40 ring-1 ring-blue-500/20'
          : 'bg-slate-900 border-slate-800 text-slate-400'
      )}
    >
      {/* Top Header with Badge */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
              isLive
                ? 'bg-slate-800 text-blue-400 border border-slate-700 shadow-inner'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            )}
          >
            <Video className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-blue-400 block">
              Video Conference
            </span>
            <span className="text-xs text-slate-400 truncate block">
              Host: <strong className="text-slate-200 font-semibold">{hostName}</strong>
            </span>
          </div>
        </div>

        <div className="shrink-0">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-800 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          ) : isExpired ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/70 text-rose-400 border border-rose-800">
              Expired
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
              <CheckCircle2 className="w-3 h-3 text-slate-500" />
              Ended
            </span>
          )}
        </div>
      </div>

      {/* Meeting Title */}
      <h4 className="text-sm font-bold text-white tracking-tight mb-3 line-clamp-2">
        {title}
      </h4>

      {/* Action CTA */}
      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 font-medium truncate">
          {isLive
            ? isHost
              ? 'You started this meeting'
              : 'Click to join now'
            : isExpired
            ? 'Meeting has expired'
            : 'Meeting has concluded'}
        </span>

        <button
          type="button"
          onClick={handleJoin}
          disabled={!isLive || !meetingId}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all duration-150 shrink-0 cursor-pointer',
            isLive
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 active:scale-95'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          )}
        >
          <span>{isLive ? 'Join Meeting' : isExpired ? 'Expired' : 'Ended'}</span>
          {isLive && <ArrowRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};
