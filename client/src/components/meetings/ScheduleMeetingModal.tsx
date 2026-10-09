import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../contexts/ToastContext.js';
import { api } from '../../lib/apiClient.js';
import { Meeting } from '../../types/meeting.js';
import { ConnectGoogleCalendarModal } from './ConnectGoogleCalendarModal.js';
import {
  Calendar as CalendarIcon,
  Clock,
  FolderKanban,
  Users,
  UserCheck,
  X,
  Sparkles,
  CheckSquare,
  Square,
  Check,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMeetingScheduled: (meeting: Meeting) => void;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface MemberOption {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface ClientOption {
  id: string;
  name: string;
  email: string;
  company?: string | null;
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 Minutes' },
  { value: 30, label: '30 Minutes' },
  { value: 45, label: '45 Minutes' },
  { value: 60, label: '1 Hour (60 mins)' },
  { value: 90, label: '1.5 Hours (90 mins)' },
  { value: 120, label: '2 Hours (120 mins)' },
];

// Generate 30-minute time slots from 07:00 to 23:00
const GENERATED_TIME_SLOTS: { value: string; label: string }[] = [];
for (let h = 7; h <= 23; h++) {
  for (const m of [0, 30]) {
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const val = `${hh}:${mm}`;
    
    // Format 12-hour display
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    const label = `${String(hour12).padStart(2, '0')}:${mm} ${ampm}`;
    
    GENERATED_TIME_SLOTS.push({ value: val, label });
  }
}

export const ScheduleMeetingModal: React.FC<ScheduleMeetingModalProps> = ({
  isOpen,
  onClose,
  onMeetingScheduled,
}) => {
  const { error: toastError, success: toastSuccess } = useToast();

  // Form State
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('14:00');
  const [durationMinutes, setDurationMinutes] = useState(60);

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);

  // Fetched Options
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<MemberOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{
    isConnected: boolean;
    email?: string;
  } | null>(null);

  // Custom Dropdown Open States
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const [isDurationOpen, setIsDurationOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isMembersDropdownOpen, setIsMembersDropdownOpen] = useState(false);
  const [isClientsDropdownOpen, setIsClientsDropdownOpen] = useState(false);

  // Dropdown Searches
  const [memberSearch, setMemberSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  // Calendar View Month/Year State
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  // Click outside listener refs
  const projectRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const timePickerRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef<HTMLDivElement>(null);
  const clientsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) {
        setIsProjectOpen(false);
      }
      if (durationRef.current && !durationRef.current.contains(e.target as Node)) {
        setIsDurationOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setIsDatePickerOpen(false);
      }
      if (timePickerRef.current && !timePickerRef.current.contains(e.target as Node)) {
        setIsTimePickerOpen(false);
      }
      if (membersRef.current && !membersRef.current.contains(e.target as Node)) {
        setIsMembersDropdownOpen(false);
      }
      if (clientsRef.current && !clientsRef.current.contains(e.target as Node)) {
        setIsClientsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize defaults on open
  useEffect(() => {
    if (!isOpen) return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    setDate(dateStr);
    setViewYear(tomorrow.getFullYear());
    setViewMonth(tomorrow.getMonth());

    setTime('14:00');
    setTitle('');
    setProjectId('');
    setDurationMinutes(60);
    setMemberSearch('');
    setClientSearch('');

    Promise.all([
      api.get<any>('/projects?status=ACTIVE'),
      api.get<any>('/members'),
      api.get<any>('/clients?status=ACTIVE'),
      api.get<any>('/meetings/google/status').catch(() => null),
    ])
      .then(([projRes, memRes, clientRes, gRes]) => {
        const pList = Array.isArray(projRes) ? projRes : projRes?.data || [];
        const mList = Array.isArray(memRes) ? memRes : memRes?.data || [];
        const cList = Array.isArray(clientRes) ? clientRes : clientRes?.data || [];
        const gData = gRes?.data || gRes;

        if (gData) setGoogleStatus(gData);

        setProjects(pList.map((p: any) => ({ id: p.id, name: p.name })));
        if (pList.length > 0) setProjectId(pList[0].id);

        const mappedMembers = mList.map((m: any) => ({
          id: m.id,
          userId: m.userId || m.user?.id || m.id,
          name: m.user ? `${m.user.firstName} ${m.user.lastName}`.trim() : m.name || m.email,
          email: m.user?.email || m.email,
          role: m.role || 'MEMBER',
        }));
        setTeamMembers(mappedMembers);
        // Pre-select all team members by default
        setSelectedUserIds(mappedMembers.map((m: any) => m.userId));

        const mappedClients = cList.map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          company: c.company,
        }));
        setClients(mappedClients);
        // Pre-select all clients by default
        setSelectedClientIds(mappedClients.map((c: any) => c.id));
      })
      .catch((err) => {
        console.error('Failed to load schedule options:', err);
      });
  }, [isOpen]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  const toggleAllUsers = () => {
    if (selectedUserIds.length === teamMembers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(teamMembers.map((m) => m.userId));
    }
  };

  const toggleAllClients = () => {
    if (selectedClientIds.length === clients.length) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(clients.map((c) => c.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toastError('Please enter a meeting title.');
      return;
    }

    if (!date || !time) {
      toastError('Please pick both date and start time.');
      return;
    }

    const scheduledDate = new Date(`${date}T${time}`);
    if (isNaN(scheduledDate.getTime())) {
      toastError('Invalid date or time.');
      return;
    }

    const payload = {
      title: title.trim(),
      projectId: projectId || undefined,
      startTime: scheduledDate.toISOString(),
      durationMinutes: Number(durationMinutes) || 60,
      attendeeUserIds: selectedUserIds,
      attendeeClientIds: selectedClientIds,
    };

    // If Google Calendar is not configured yet, save state and show configuration modal
    if (!googleStatus?.isConnected) {
      sessionStorage.setItem('cliently_pending_meeting', JSON.stringify(payload));
      setShowConnectModal(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<any>('/meetings/schedule', payload);
      const meetingData = res?.data || res;

      toastSuccess('Meeting scheduled! Google Calendar invites & confirmation emails dispatched.');
      onClose();
      onMeetingScheduled(meetingData);
    } catch (err: any) {
      toastError(err.message || 'Failed to schedule meeting.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Selected labels
  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedDuration = DURATION_OPTIONS.find((d) => d.value === durationMinutes);
  const selectedTimeSlot = GENERATED_TIME_SLOTS.find((t) => t.value === time);

  // Formatted date string for display
  const displayFormattedDate = () => {
    if (!date) return 'Select date';
    const parts = date.split('-');
    if (parts.length !== 3) return date;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Calendar Helpers
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('en-US', { month: 'long' });

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const y = viewYear;
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    setDate(`${y}-${m}-${d}`);
    setIsDatePickerOpen(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // Filtered dropdown lists
  const filteredTeamMembers = teamMembers.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(clientSearch.toLowerCase()))
  );

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 animate-in zoom-in-95 duration-200">
          {/* Top Header */}
          <div className="p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-800 text-blue-400 border border-slate-700 flex items-center justify-center shadow-inner">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Schedule Future Meeting
                </h3>
                <p className="text-xs text-slate-400">
                  Auto-syncs to Google Calendar & sends 1-hour automated reminders
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

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto no-scrollbar flex-1">
            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Meeting Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Weekly Progress Review, Client Demo, Design Walkthrough"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition font-medium"
              />
            </div>

            {/* Custom Project & Duration Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Project Custom Dropdown */}
              <div className="relative" ref={projectRef}>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                  <span>Project</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsProjectOpen((prev) => !prev);
                    setIsDurationOpen(false);
                    setIsDatePickerOpen(false);
                    setIsTimePickerOpen(false);
                    setIsMembersDropdownOpen(false);
                    setIsClientsDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-between bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition shadow-xs cursor-pointer text-left"
                >
                  <span className="truncate font-medium">
                    {selectedProject ? selectedProject.name : 'General Meeting (Org-wide)'}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150', isProjectOpen && 'rotate-180 text-blue-600')} />
                </button>

                {isProjectOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl py-2 z-40 max-h-56 overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setProjectId('');
                        setIsProjectOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-2.5 text-xs text-left transition cursor-pointer font-medium',
                        !projectId ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <span>General Meeting (Organization-wide)</span>
                      {!projectId && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                    {projects.map((p) => {
                      const isSelected = p.id === projectId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setProjectId(p.id);
                            setIsProjectOpen(false);
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-4 py-2.5 text-xs text-left transition cursor-pointer font-medium',
                            isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          <span className="truncate">{p.name}</span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Duration Custom Dropdown */}
              <div className="relative" ref={durationRef}>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Duration</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsDurationOpen((prev) => !prev);
                    setIsProjectOpen(false);
                    setIsDatePickerOpen(false);
                    setIsTimePickerOpen(false);
                    setIsMembersDropdownOpen(false);
                    setIsClientsDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-between bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition shadow-xs cursor-pointer text-left"
                >
                  <span className="truncate font-medium">
                    {selectedDuration ? selectedDuration.label : `${durationMinutes} Mins`}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150', isDurationOpen && 'rotate-180 text-blue-600')} />
                </button>

                {isDurationOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 z-40 max-h-56 overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-150">
                    {DURATION_OPTIONS.map((d) => {
                      const isSelected = d.value === durationMinutes;
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => {
                            setDurationMinutes(d.value);
                            setIsDurationOpen(false);
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-4 py-2 text-xs text-left transition cursor-pointer font-medium',
                            isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          <span>{d.label}</span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Custom Interactive Date & Time Slots Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date Picker Custom Popup */}
              <div className="relative" ref={datePickerRef}>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Meeting Date</span> <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsDatePickerOpen((prev) => !prev);
                    setIsTimePickerOpen(false);
                    setIsProjectOpen(false);
                    setIsDurationOpen(false);
                    setIsMembersDropdownOpen(false);
                    setIsClientsDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-between bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition shadow-xs cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 truncate">
                    <CalendarIcon className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate font-medium">{displayFormattedDate()}</span>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150', isDatePickerOpen && 'rotate-180 text-blue-600')} />
                </button>

                {/* Calendar Widget Popup */}
                {isDatePickerOpen && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 w-72 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* Month Nav */}
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-slate-900">
                        {monthName} {viewYear}
                      </h4>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={prevMonth}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={nextMonth}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Day Names */}
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase mb-1">
                      <span>Su</span>
                      <span>Mo</span>
                      <span>Tu</span>
                      <span>We</span>
                      <span>Th</span>
                      <span>Fr</span>
                      <span>Sa</span>
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const cellMonth = String(viewMonth + 1).padStart(2, '0');
                        const cellDay = String(dayNum).padStart(2, '0');
                        const cellDateStr = `${viewYear}-${cellMonth}-${cellDay}`;
                        const isSelected = cellDateStr === date;
                        const isToday = cellDateStr === todayStr;
                        const isPast = cellDateStr < todayStr;

                        return (
                          <button
                            key={dayNum}
                            type="button"
                            disabled={isPast}
                            onClick={() => handleSelectDay(dayNum)}
                            className={cn(
                              'h-8 w-8 rounded-xl text-xs font-semibold flex items-center justify-center transition cursor-pointer mx-auto',
                              isSelected
                                ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/25'
                                : isToday
                                ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200'
                                : isPast
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-700 hover:bg-slate-100'
                            )}
                          >
                            {dayNum}
                          </button>
                        );
                      })}
                    </div>

                    {/* Quick Shortcuts */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const t = new Date();
                          const y = t.getFullYear();
                          const m = String(t.getMonth() + 1).padStart(2, '0');
                          const d = String(t.getDate()).padStart(2, '0');
                          setDate(`${y}-${m}-${d}`);
                          setViewYear(y);
                          setViewMonth(t.getMonth());
                          setIsDatePickerOpen(false);
                        }}
                        className="text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const t = new Date();
                          t.setDate(t.getDate() + 1);
                          const y = t.getFullYear();
                          const m = String(t.getMonth() + 1).padStart(2, '0');
                          const d = String(t.getDate()).padStart(2, '0');
                          setDate(`${y}-${m}-${d}`);
                          setViewYear(y);
                          setViewMonth(t.getMonth());
                          setIsDatePickerOpen(false);
                        }}
                        className="text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        Tomorrow
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Time Slots Picker Custom Popup */}
              <div className="relative" ref={timePickerRef}>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Start Time</span> <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsTimePickerOpen((prev) => !prev);
                    setIsDatePickerOpen(false);
                    setIsProjectOpen(false);
                    setIsDurationOpen(false);
                    setIsMembersDropdownOpen(false);
                    setIsClientsDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-between bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition shadow-xs cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate font-medium">{selectedTimeSlot ? selectedTimeSlot.label : time}</span>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150', isTimePickerOpen && 'rotate-180 text-blue-600')} />
                </button>

                {/* Time Slots Grid Dropdown */}
                {isTimePickerOpen && (
                  <div className="absolute right-0 w-72 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1 mb-2 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Select Time Slot</span>
                      <span className="text-[11px] text-slate-400">30m steps</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto no-scrollbar p-1">
                      {GENERATED_TIME_SLOTS.map((slot) => {
                        const isSelected = slot.value === time;
                        return (
                          <button
                            key={slot.value}
                            type="button"
                            onClick={() => {
                              setTime(slot.value);
                              setIsTimePickerOpen(false);
                            }}
                            className={cn(
                              'px-2 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer text-center',
                              isSelected
                                ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/25'
                                : 'text-slate-700 bg-slate-50 hover:bg-slate-100 hover:text-slate-900'
                            )}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Custom Multi-Select Dropdowns for Attendees: Team Members & Clients */}
            <div className="space-y-3 pt-2">
              {/* Team Members Multi-Select Dropdown */}
              <div className="relative" ref={membersRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Team Members</span>
                  </label>
                  <span className="text-[11px] font-bold text-blue-600">
                    {selectedUserIds.length}/{teamMembers.length} Selected
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsMembersDropdownOpen((prev) => !prev);
                    setIsClientsDropdownOpen(false);
                    setIsProjectOpen(false);
                    setIsDurationOpen(false);
                    setIsDatePickerOpen(false);
                    setIsTimePickerOpen(false);
                  }}
                  className="w-full flex items-center justify-between bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition shadow-xs cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 truncate">
                    <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate font-medium text-xs sm:text-sm">
                      {selectedUserIds.length === teamMembers.length
                        ? `All Team Members (${teamMembers.length})`
                        : selectedUserIds.length === 0
                        ? 'No team members selected'
                        : `${selectedUserIds.length} member(s) selected`}
                    </span>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150', isMembersDropdownOpen && 'rotate-180 text-blue-600')} />
                </button>

                {/* Team Members Popup Dropdown */}
                {isMembersDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-40 animate-in fade-in zoom-in-95 duration-150">
                    {/* Search & Actions Header */}
                    <div className="space-y-2 mb-2 pb-2 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search members..."
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] text-slate-500 font-medium">
                          {selectedUserIds.length} of {teamMembers.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={toggleAllUsers}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                        >
                          {selectedUserIds.length === teamMembers.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    </div>

                    {/* Members List */}
                    <div className="max-h-48 overflow-y-auto no-scrollbar space-y-1">
                      {filteredTeamMembers.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">No matching members found</p>
                      ) : (
                        filteredTeamMembers.map((m) => {
                          const isSelected = selectedUserIds.includes(m.userId);
                          return (
                            <div
                              key={m.userId}
                              onClick={() => toggleUser(m.userId)}
                              className={cn(
                                'flex items-center justify-between p-2 rounded-xl cursor-pointer transition border',
                                isSelected
                                  ? 'bg-blue-50/80 border-blue-200 text-slate-900'
                                  : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                                  {m.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold truncate leading-tight">{m.name}</p>
                                  <p className="text-[10px] text-slate-400 truncate">{m.email}</p>
                                </div>
                              </div>

                              <div className="ml-2 shrink-0">
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300" />
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Clients Multi-Select Dropdown */}
              <div className="relative" ref={clientsRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Clients</span>
                  </label>
                  <span className="text-[11px] font-bold text-emerald-600">
                    {selectedClientIds.length}/{clients.length} Selected
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsClientsDropdownOpen((prev) => !prev);
                    setIsMembersDropdownOpen(false);
                    setIsProjectOpen(false);
                    setIsDurationOpen(false);
                    setIsDatePickerOpen(false);
                    setIsTimePickerOpen(false);
                  }}
                  className="w-full flex items-center justify-between bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition shadow-xs cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate font-medium text-xs sm:text-sm">
                      {selectedClientIds.length === clients.length
                        ? `All Clients (${clients.length})`
                        : selectedClientIds.length === 0
                        ? 'No clients selected'
                        : `${selectedClientIds.length} client(s) selected`}
                    </span>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150', isClientsDropdownOpen && 'rotate-180 text-emerald-600')} />
                </button>

                {/* Clients Popup Dropdown */}
                {isClientsDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-40 animate-in fade-in zoom-in-95 duration-150">
                    {/* Search & Actions Header */}
                    <div className="space-y-2 mb-2 pb-2 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search clients..."
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] text-slate-500 font-medium">
                          {selectedClientIds.length} of {clients.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={toggleAllClients}
                          className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                        >
                          {selectedClientIds.length === clients.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    </div>

                    {/* Clients List */}
                    <div className="max-h-48 overflow-y-auto no-scrollbar space-y-1">
                      {clients.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">No active clients registered yet</p>
                      ) : filteredClients.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">No matching clients found</p>
                      ) : (
                        filteredClients.map((c) => {
                          const isSelected = selectedClientIds.includes(c.id);
                          return (
                            <div
                              key={c.id}
                              onClick={() => toggleClient(c.id)}
                              className={cn(
                                'flex items-center justify-between p-2 rounded-xl cursor-pointer transition border',
                                isSelected
                                  ? 'bg-emerald-50/80 border-emerald-200 text-slate-900'
                                  : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold truncate leading-tight">{c.name}</p>
                                  <p className="text-[10px] text-slate-400 truncate">
                                    {c.company ? `${c.company} • ` : ''}{c.email}
                                  </p>
                                </div>
                              </div>

                              <div className="ml-2 shrink-0">
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300" />
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Automated Benefits Banner */}
            <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-blue-700 text-xs font-bold">
                <Sparkles className="w-4 h-4 shrink-0 text-orange-500" />
                <span>Automatic Calendar & Reminder Sync</span>
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
                <li>Instantly creates event in Google Calendar and notifies all invited attendees.</li>
                <li>Automatically triggers a 1-hour advance reminder email to all attendees.</li>
                <li>The "Join Meeting" button unlocks automatically at start time.</li>
              </ul>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition border border-slate-200 cursor-pointer shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/25 transition cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Scheduling...</span>
                </>
              ) : (
                <>
                  <CalendarIcon className="w-4 h-4" />
                  <span>Schedule Meeting & Send Invites</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* Google Calendar Authorization Configuration Modal */}
    <ConnectGoogleCalendarModal
      isOpen={showConnectModal}
      onClose={() => setShowConnectModal(false)}
    />
  </>
  );
};
