import React from 'react';
import { Project, ProjectMeetingItem } from '../../types/project.js';
import { Video, Calendar, Clock, ExternalLink, User, CheckCircle, CalendarClock } from 'lucide-react';
import { formatDate, cn } from '../../lib/utils.js';

export interface ProjectMeetingsSectionProps {
  project: Project;
}

export const ProjectMeetingsSection: React.FC<ProjectMeetingsSectionProps> = ({ project }) => {
  const meetings = project.meetings || [];

  const now = new Date();
  const upcomingMeetings = meetings.filter((m) => new Date(m.startTime) >= now);

  const formatMeetingTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getMeetingStatus = (m: ProjectMeetingItem) => {
    const rawStatus = (m.status || '').toLowerCase();
    if (rawStatus === 'live') return 'live';
    if (rawStatus === 'completed' || rawStatus === 'ended') return 'ended';
    if (rawStatus === 'cancelled') return 'cancelled';
    if (rawStatus === 'expired') return 'expired';

    const startMs = new Date(m.startTime).getTime();
    const endMs = m.endTime ? new Date(m.endTime).getTime() : startMs + 60 * 60 * 1000;
    const nowMs = Date.now();

    if (nowMs > endMs) {
      return 'expired';
    }
    return 'scheduled';
  };

  const getStatusBadge = (m: ProjectMeetingItem) => {
    const status = getMeetingStatus(m);
    if (status === 'ended') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
          <CheckCircle className="w-3 h-3 text-slate-500" />
          Completed
        </span>
      );
    }
    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          Cancelled
        </span>
      );
    }
    if (status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <Clock className="w-3 h-3 text-rose-500" />
          Expired
        </span>
      );
    }
    if (status === 'live') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
          Live Now
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
        <CalendarClock className="w-3 h-3 text-blue-600" />
        Upcoming
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0 shadow-2xs">
            <Video className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-slate-900 font-heading">
                Project Meetings & Syncs
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                {meetings.length} {meetings.length === 1 ? 'Meeting' : 'Meetings'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Scheduled discussions, milestone reviews, and client check-in calls.
            </p>
          </div>
        </div>

        {upcomingMeetings.length > 0 && (
          <div className="text-xs font-semibold text-teal-800 bg-teal-50/80 px-3 py-1.5 rounded-xl border border-teal-200/80 shrink-0">
            {upcomingMeetings.length} Upcoming Scheduled
          </div>
        )}
      </div>

      {meetings.length === 0 ? (
        <div className="py-10 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
          <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-500 mx-auto mb-2.5">
            <Video className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No meetings linked to this project</h4>
          <p className="text-xs text-slate-500 mt-0.5 max-w-sm mx-auto">
            Meetings and schedule syncs for this project will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const status = getMeetingStatus(meeting);
            const isInactive = status === 'ended' || status === 'expired' || status === 'cancelled';
            return (
              <div
                key={meeting.id}
                className={cn(
                  'p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group',
                  isInactive
                    ? 'bg-slate-50/70 border-slate-200 opacity-80'
                    : 'bg-white border-slate-200 hover:border-teal-300 hover:shadow-xs'
                )}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border text-xs font-bold',
                      isInactive
                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                        : 'bg-teal-50 text-teal-700 border-teal-200'
                    )}
                  >
                    <Video className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                        {meeting.title}
                      </h4>
                      {getStatusBadge(meeting)}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{formatDate(meeting.startTime)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formatMeetingTime(meeting.startTime)}</span>
                        {meeting.endTime && (
                          <span> - {formatMeetingTime(meeting.endTime)}</span>
                        )}
                      </div>

                      {meeting.hostName && (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>Host: {meeting.hostName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Meet Link (only show if active / upcoming) */}
                {meeting.meetLink && !isInactive && (
                  <div className="shrink-0 self-end sm:self-center">
                    <a
                      href={meeting.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-colors"
                    >
                      <span>Join Meeting</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
