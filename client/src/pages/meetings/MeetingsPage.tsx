import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { api } from '../../lib/apiClient.js';
import { Meeting } from '../../types/meeting.js';
import { StartInstantMeetingModal } from '../../components/meetings/StartInstantMeetingModal.js';
import { ScheduleMeetingModal } from '../../components/meetings/ScheduleMeetingModal.js';
import { JitsiMeetingModal } from '../../components/meetings/JitsiMeetingModal.js';
import {
  Video,
  Radio,
  Search,
  Users,
  FolderKanban,
  Clock,
  CheckCircle2,
  Calendar,
  Loader2,
  ExternalLink,
  Lock,
  ClockAlert,
} from 'lucide-react';
import { Pagination } from '../../components/ui/Pagination.js';
import { cn } from '../../lib/utils.js';

export const MeetingsPage: React.FC = () => {
  const { currentRole } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'EXPIRED'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [showStartModal, setShowStartModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update clock every 10 seconds for real-time join button unlocking & expiration
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchMeetings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<Meeting[]>('/meetings');
      const data = Array.isArray(res) ? res : (res as any)?.data || [];
      setMeetings(data);
    } catch (err: any) {
      console.error('Failed to load meetings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Handle Google OAuth callback (?code=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const redirectUri = `${window.location.origin}/meetings`;
      api.post('/meetings/google/callback', { code, redirectUri })
        .then(async () => {
          toastSuccess('Google Calendar connected successfully!');

          // Check if there was a pending meeting saved prior to OAuth
          const pendingRaw = sessionStorage.getItem('cliently_pending_meeting');
          if (pendingRaw) {
            try {
              const pendingMeeting = JSON.parse(pendingRaw);
              sessionStorage.removeItem('cliently_pending_meeting');
              await api.post('/meetings/schedule', pendingMeeting);
              toastSuccess('Meeting scheduled successfully! Google Calendar invites dispatched.');
              fetchMeetings();
              return;
            } catch (err: any) {
              console.error('Failed to auto-schedule pending meeting after OAuth:', err);
              toastError(err?.message || 'Failed to auto-schedule meeting after connecting.');
            }
          }
          setShowScheduleModal(true);
        })
        .catch((err: any) => {
          toastError(err?.message || 'Failed to complete Google Calendar authorization.');
        })
        .finally(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, [fetchMeetings, toastSuccess, toastError]);

  const handleJoinMeeting = (meetingId: string) => {
    setActiveMeetingId(meetingId);
  };

  const getGoogleCalendarUrl = (_meeting: Meeting) => {
    return 'https://calendar.google.com/calendar/r';
  };

  // Check if there is a query param to auto-join meeting (?join=id)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId) {
      setActiveMeetingId(joinId);
    }
  }, []);

  // Helper to compute dynamic effective status
  const getEffectiveStatus = useCallback(
    (meeting: Meeting, nowMs: number): 'live' | 'scheduled' | 'ended' | 'expired' | 'cancelled' => {
      if (meeting.status === 'live') return 'live';
      if (meeting.status === 'ended') return 'ended';
      if (meeting.status === 'cancelled') return 'cancelled';
      if (meeting.status === 'expired') return 'expired';

      const startMs = new Date(meeting.startTime).getTime();
      const endMs = meeting.endTime
        ? new Date(meeting.endTime).getTime()
        : startMs + 60 * 60 * 1000;

      // If scheduled end time has passed and meeting was never joined/live/ended
      if (nowMs > endMs) {
        return 'expired';
      }

      return 'scheduled';
    },
    []
  );

  // Filtered list
  const filteredMeetings = meetings.filter((m) => {
    const effectiveStatus = getEffectiveStatus(m, currentTime);
    if (filter === 'LIVE' && effectiveStatus !== 'live') return false;
    if (filter === 'SCHEDULED' && effectiveStatus !== 'scheduled') return false;
    if (filter === 'ENDED' && effectiveStatus !== 'ended') return false;
    if (filter === 'EXPIRED' && effectiveStatus !== 'expired') return false;
    if (!search.trim()) return true;

    const query = search.toLowerCase();
    const titleMatch = m.title?.toLowerCase().includes(query);
    const projectMatch =
      m.projectName?.toLowerCase().includes(query) ||
      (m as any).project?.name?.toLowerCase().includes(query);
    const hostMatch = m.host?.name?.toLowerCase().includes(query);
    return titleMatch || projectMatch || hostMatch;
  });

  const liveMeetings = meetings.filter((m) => getEffectiveStatus(m, currentTime) === 'live');
  const scheduledMeetings = meetings.filter((m) => getEffectiveStatus(m, currentTime) === 'scheduled');
  const endedMeetings = meetings.filter((m) => getEffectiveStatus(m, currentTime) === 'ended');
  const expiredMeetings = meetings.filter((m) => getEffectiveStatus(m, currentTime) === 'expired');

  const totalPages = Math.ceil(filteredMeetings.length / pageSize) || 1;
  const paginatedMeetings = filteredMeetings.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* 1. Header Banner - Brand Theme */}
      <div className="rounded-2xl bg-[#070F2B] border border-[#1B1A55] p-6 sm:p-7 shadow-xl text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
              Meetings
            </h1>
            <p className="text-xs sm:text-sm text-[#9290C3] leading-relaxed">
              Launch instant video rooms, schedule upcoming meetings, and auto-sync with Google Calendar.
            </p>
          </div>

          {currentRole !== 'CLIENT' && (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B1A55] hover:bg-[#1B1A55]/85 text-white font-bold text-xs border border-[#535C91]/40 shadow-sm transition cursor-pointer font-heading"
              >
                <Calendar className="w-4 h-4 text-[#9290C3]" />
                <span>Schedule Meeting</span>
              </button>

              <button
                type="button"
                onClick={() => setShowStartModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#535C91] hover:bg-[#434a78] text-white font-bold text-xs shadow-md shadow-[#535C91]/30 transition cursor-pointer font-heading"
              >
                <Video className="w-4 h-4" />
                <span>Start Instant Meeting</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Search & Filter Bar (Matching Image 2 Style: Search on Left, Tabs on Right) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
        {/* Search on Left */}
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, project, host..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition-all font-medium"
          />
        </div>

        {/* Tabs on Right */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {[
            { key: 'ALL', label: `All Meetings (${meetings.length})` },
            { key: 'SCHEDULED', label: `Scheduled (${scheduledMeetings.length})` },
            { key: 'LIVE', label: `Live Now (${liveMeetings.length})` },
            { key: 'ENDED', label: `Past (${endedMeetings.length})` },
            { key: 'EXPIRED', label: `Expired (${expiredMeetings.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setFilter(tab.key as any);
                setPage(1);
              }}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer font-heading',
                filter === tab.key
                  ? 'bg-[#070F2B] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Section Container with Dark Table Header */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-md shadow-slate-200/80 overflow-hidden min-h-[380px] flex flex-col">
        {/* Dark Header Bar */}
        <div className="bg-[#070F2B] text-white px-6 py-3.5 text-[11px] font-bold uppercase tracking-wider hidden md:grid md:grid-cols-12 md:gap-4 items-center font-heading">
          <div className="col-span-4">Meeting / Title</div>
          <div className="col-span-2">Project</div>
          <div className="col-span-2">Host & Attendees</div>
          <div className="col-span-2">Date & Time</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {/* Table / List Body */}
        <div key={filter} className="tab-transition flex-1 flex flex-col">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-2 flex-1">
              <Loader2 className="w-6 h-6 animate-spin text-[#535C91]" />
              <span className="text-xs font-semibold text-slate-500 font-heading">Loading meetings...</span>
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="py-20 px-6 text-center flex flex-col items-center justify-center space-y-3 flex-1">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 shadow-inner">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  {filter === 'SCHEDULED'
                    ? 'No scheduled upcoming meetings'
                    : filter === 'LIVE'
                    ? 'No live meetings right now'
                    : filter === 'ENDED'
                    ? 'No past meeting records'
                    : filter === 'EXPIRED'
                    ? 'No expired meetings'
                    : 'No meetings found'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {currentRole !== 'CLIENT'
                    ? 'Use the header buttons above to schedule a meeting or launch an instant video conference.'
                    : 'Meetings will appear here as soon as they are scheduled by your team.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between">
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto no-scrollbar">
                {paginatedMeetings.map((meeting) => {
                  const effectiveStatus = getEffectiveStatus(meeting, currentTime);
                  const isLive = effectiveStatus === 'live';
                  const isScheduled = effectiveStatus === 'scheduled';
                  const isExpired = effectiveStatus === 'expired';
                  const isCancelled = effectiveStatus === 'cancelled';

                  const projectName =
                    meeting.projectName || (meeting as any).project?.name || 'General Meeting';
                  const hostName =
                    meeting.host?.name || (meeting as any).hostName || 'Team Host';
                  const attendeesCount =
                    meeting.attendees?.length || (meeting as any).attendeesCount || 1;

                  const startMs = new Date(meeting.startTime).getTime();
                  const endMs = meeting.endTime
                    ? new Date(meeting.endTime).getTime()
                    : startMs + 60 * 60 * 1000;
                  const timeDiffMs = startMs - currentTime;
                  
                  // Unlock join 10 minutes before start time until end time
                  const isJoinWindow = isLive || (isScheduled && currentTime >= startMs - 10 * 60 * 1000 && currentTime <= endMs);
                  const isFutureLocked = isScheduled && currentTime < startMs - 10 * 60 * 1000;

                  const startDate = new Date(meeting.startTime);
                  const formattedDate = startDate.toLocaleDateString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  });
                  const formattedTime = startDate.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  // Countdown formatting
                  let countdownText = '';
                  if (isScheduled && timeDiffMs > 0) {
                    const diffHours = Math.floor(timeDiffMs / (1000 * 60 * 60));
                    const diffMinutes = Math.floor((timeDiffMs % (1000 * 60 * 60)) / (1000 * 60));
                    if (diffHours > 24) {
                      const diffDays = Math.floor(diffHours / 24);
                      countdownText = `in ${diffDays}d`;
                    } else if (diffHours > 0) {
                      countdownText = `in ${diffHours}h ${diffMinutes}m`;
                    } else {
                      countdownText = `in ${diffMinutes}m`;
                    }
                  }

                  return (
                    <div
                      key={meeting.id}
                      className="px-6 py-4 flex flex-col md:grid md:grid-cols-12 md:gap-4 items-start md:items-center hover:bg-slate-50/80 transition-colors gap-3"
                    >
                      {/* Meeting Title */}
                      <div className="col-span-4 flex items-center gap-3 min-w-0">
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border',
                          isLive
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : isScheduled
                            ? 'bg-blue-50 text-blue-600 border-blue-200'
                            : isExpired
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        )}>
                          {isLive ? (
                            <Radio className="w-5 h-5 animate-pulse text-emerald-600" />
                          ) : isScheduled ? (
                            <Calendar className="w-5 h-5 text-blue-600" />
                          ) : isExpired ? (
                            <ClockAlert className="w-5 h-5 text-rose-600" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-slate-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {meeting.title || 'Team Meeting'}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            ID: {meeting.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>

                      {/* Project */}
                      <div className="col-span-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold truncate max-w-[160px]">
                          <FolderKanban className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{projectName}</span>
                        </span>
                      </div>

                      {/* Host & Attendees */}
                      <div className="col-span-2 text-xs text-slate-600 space-y-0.5">
                        <p className="font-semibold text-slate-800 truncate">Host: {hostName}</p>
                        <p className="text-[11px] text-slate-400">{attendeesCount} participant{attendeesCount === 1 ? '' : 's'}</p>
                      </div>

                      {/* Date & Time */}
                      <div className="col-span-2 text-xs text-slate-700">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{formattedDate}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 pl-5">
                          {formattedTime} {countdownText && <span className="text-blue-600 font-bold">({countdownText})</span>}
                        </p>
                      </div>

                      {/* Status */}
                      <div className="col-span-1">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Live
                          </span>
                        ) : isScheduled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Scheduled
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Expired
                          </span>
                        ) : isCancelled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Cancelled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Ended
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 flex items-center justify-end gap-1.5 w-full md:w-auto">
                        {isScheduled && (
                          <a
                            href={getGoogleCalendarUrl(meeting)}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition border border-transparent hover:border-blue-200"
                            title="View in Google Calendar"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        {isJoinWindow ? (
                          <button
                            type="button"
                            onClick={() => handleJoinMeeting(meeting.id)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition cursor-pointer whitespace-nowrap ml-1"
                          >
                            Join
                          </button>
                        ) : isFutureLocked ? (
                          <button
                            disabled
                            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-400 text-[11px] font-medium cursor-not-allowed border border-slate-200 flex items-center gap-1"
                            title="Unlocks 10 mins before start time"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Locked</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredMeetings.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-2 bg-slate-50/50">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={filteredMeetings.length}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Start Instant Meeting Modal */}
      <StartInstantMeetingModal
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        onMeetingStarted={(newMeetingId) => {
          fetchMeetings();
          setActiveMeetingId(newMeetingId);
        }}
      />

      {/* Schedule Future Meeting Modal */}
      <ScheduleMeetingModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onMeetingScheduled={() => {
          fetchMeetings();
        }}
      />

      {/* Jitsi Meeting Video Room Modal */}
      {activeMeetingId && (
        <JitsiMeetingModal
          isOpen={Boolean(activeMeetingId)}
          meetingId={activeMeetingId}
          onClose={() => {
            setActiveMeetingId(null);
            fetchMeetings();
          }}
          onMeetingEnded={() => {
            fetchMeetings();
          }}
        />
      )}
    </div>
  );
};
