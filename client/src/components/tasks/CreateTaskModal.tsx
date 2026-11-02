import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/apiClient.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Project } from '../../types/project.js';
import { TaskPriority, TaskStatus } from '../../types/task.js';
import { X, CheckSquare, Clock, User, Loader2, FolderKanban, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { DatePicker } from '../ui/DatePicker.js';

interface TeamMember {
  id: string;
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string | null;
  };
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  initialProjectId?: string;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; dotColor: string }[] = [
  { value: 'LOW', label: 'Low', dotColor: 'bg-emerald-500' },
  { value: 'MEDIUM', label: 'Medium', dotColor: 'bg-amber-500' },
  { value: 'HIGH', label: 'High', dotColor: 'bg-orange-500' },
  { value: 'URGENT', label: 'Urgent ⚡', dotColor: 'bg-rose-500' },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string; dotColor: string }[] = [
  { value: 'TODO', label: 'To Do', dotColor: 'bg-slate-400' },
  { value: 'IN_PROGRESS', label: 'In Progress', dotColor: 'bg-blue-500' },
  { value: 'REVIEW', label: 'In Review', dotColor: 'bg-purple-500' },
  { value: 'COMPLETED', label: 'Complete', dotColor: 'bg-emerald-500' },
  { value: 'DONE', label: 'Done', dotColor: 'bg-emerald-600' },
];

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  onTaskCreated,
  initialProjectId,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [projectId, setProjectId] = useState(initialProjectId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState<'project' | 'priority' | 'status' | 'assignee' | null>(null);

  const projectRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (openDropdown === 'project' && projectRef.current && !projectRef.current.contains(target)) ||
        (openDropdown === 'priority' && priorityRef.current && !priorityRef.current.contains(target)) ||
        (openDropdown === 'status' && statusRef.current && !statusRef.current.contains(target)) ||
        (openDropdown === 'assignee' && assigneeRef.current && !assigneeRef.current.contains(target))
      ) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingMetadata(true);
      Promise.all([
        api.get<Project[]>('/projects'),
        api.get<TeamMember[]>('/members'),
      ])
        .then(([projectsRes, membersRes]) => {
          const projs = Array.isArray(projectsRes) ? projectsRes : (projectsRes as any)?.data || [];
          const mems = Array.isArray(membersRes) ? membersRes : (membersRes as any)?.data || [];
          setProjects(projs);
          setMembers(mems);
          if (initialProjectId) {
            setProjectId(initialProjectId);
          } else if (projs.length > 0 && !projectId) {
            setProjectId(projs[0].id);
          }
        })
        .catch((err) => {
          console.error('Failed to load projects/members:', err);
        })
        .finally(() => {
          setIsLoadingMetadata(false);
        });
    }
  }, [isOpen, initialProjectId]);

  // Lock background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      toastError('Please select a project for this task.');
      return;
    }
    if (!title.trim()) {
      toastError('Task title is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/tasks', {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        assigneeId: assigneeId || undefined,
      });

      toastSuccess('Task created successfully!');
      onTaskCreated();
      onClose();
      // Reset
      setTitle('');
      setDescription('');
      setDueDate('');
      setEstimatedHours('');
      setAssigneeId('');
      setOpenDropdown(null);
    } catch (err: any) {
      toastError(err?.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedMember = members.find((m) => (m.userId || m.id) === assigneeId);

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh] my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#070F2B] text-white border-b border-[#1B1A55]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1B1A55] border border-[#535C91]/50 flex items-center justify-center text-blue-400">
              <CheckSquare className="w-5 h-5 text-[#9290C3]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight font-heading">Create New Task</h2>
              <p className="text-[11px] text-[#9290C3]">Assign and track actionable deliverables</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {isLoadingMetadata ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#535C91]" />
              <span className="text-xs font-semibold text-slate-500 font-heading">Loading project data...</span>
            </div>
          ) : (
            <>
              {/* Project Selection */}
              <div ref={projectRef} className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                  Project <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === 'project' ? null : 'project')}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-xs sm:text-sm font-medium transition-all text-left cursor-pointer",
                      "focus:outline-none focus:ring-4 focus:ring-[#535C91]/15",
                      openDropdown === 'project'
                        ? "border-[#535C91] ring-4 ring-[#535C91]/15"
                        : "border-slate-300 hover:border-slate-400"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className={cn("truncate text-xs sm:text-sm", selectedProject ? "text-slate-900 font-semibold" : "text-slate-400 font-normal")}>
                        {selectedProject ? selectedProject.name : "Select a project..."}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                        openDropdown === 'project' && "rotate-180 text-[#535C91]"
                      )}
                    />
                  </button>

                  {openDropdown === 'project' && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                      {projects.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs text-slate-400">
                          No projects available
                        </div>
                      ) : (
                        projects.map((p) => {
                          const isSelected = projectId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setProjectId(p.id);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer my-0.5",
                                isSelected
                                  ? "bg-blue-50 text-blue-700 font-semibold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <FolderKanban className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="truncate">{p.name}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Task Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Design responsive landing page wireframe"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-4 focus:ring-[#535C91]/15 hover:border-slate-400 transition"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Detailed requirements, technical steps, acceptance criteria..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-4 focus:ring-[#535C91]/15 hover:border-slate-400 transition resize-none"
                />
              </div>

              {/* Priority & Status */}
              <div className="grid grid-cols-2 gap-4">
                {/* Custom Priority Dropdown */}
                <div ref={priorityRef} className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                    Priority
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === 'priority' ? null : 'priority')}
                      className={cn(
                        "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-xs sm:text-sm font-medium transition-all text-left cursor-pointer",
                        "focus:outline-none focus:ring-4 focus:ring-[#535C91]/15",
                        openDropdown === 'priority'
                          ? "border-[#535C91] ring-4 ring-[#535C91]/15"
                          : "border-slate-300 hover:border-slate-400"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_OPTIONS.find((p) => p.value === priority)?.dotColor || "bg-amber-500")} />
                        <span className="truncate text-slate-900 font-semibold">
                          {PRIORITY_OPTIONS.find((p) => p.value === priority)?.label || "Medium"}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                          openDropdown === 'priority' && "rotate-180 text-[#535C91]"
                        )}
                      />
                    </button>

                    {openDropdown === 'priority' && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                        {PRIORITY_OPTIONS.map((opt) => {
                          const isSelected = priority === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setPriority(opt.value);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer my-0.5",
                                isSelected
                                  ? "bg-blue-50 text-blue-700 font-semibold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dotColor)} />
                                <span>{opt.label}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Custom Status Dropdown */}
                <div ref={statusRef} className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                    Status
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
                      className={cn(
                        "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-xs sm:text-sm font-medium transition-all text-left cursor-pointer",
                        "focus:outline-none focus:ring-4 focus:ring-[#535C91]/15",
                        openDropdown === 'status'
                          ? "border-[#535C91] ring-4 ring-[#535C91]/15"
                          : "border-slate-300 hover:border-slate-400"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_OPTIONS.find((s) => s.value === status)?.dotColor || "bg-slate-400")} />
                        <span className="truncate text-slate-900 font-semibold">
                          {STATUS_OPTIONS.find((s) => s.value === status)?.label || "To Do"}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                          openDropdown === 'status' && "rotate-180 text-[#535C91]"
                        )}
                      />
                    </button>

                    {openDropdown === 'status' && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                        {STATUS_OPTIONS.map((opt) => {
                          const isSelected = status === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setStatus(opt.value);
                                setOpenDropdown(null);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer my-0.5",
                                isSelected
                                  ? "bg-blue-50 text-blue-700 font-semibold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dotColor)} />
                                <span>{opt.label}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Due Date & Estimated Hours */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                    Due Date
                  </label>
                  <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="Select due date..."
                    position="bottom"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                    Est. Hours
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="500"
                      placeholder="e.g. 8"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-4 focus:ring-[#535C91]/15 hover:border-slate-400 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Assignee */}
              <div ref={assigneeRef} className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                  Assign To Team Member
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === 'assignee' ? null : 'assignee')}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-xs sm:text-sm font-medium transition-all text-left cursor-pointer",
                      "focus:outline-none focus:ring-4 focus:ring-[#535C91]/15",
                      openDropdown === 'assignee'
                        ? "border-[#535C91] ring-4 ring-[#535C91]/15"
                        : "border-slate-300 hover:border-slate-400"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-500">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <span className={cn("truncate text-xs sm:text-sm", selectedMember ? "text-slate-900 font-semibold" : "text-slate-500 font-medium")}>
                        {selectedMember
                          ? `${selectedMember.user?.firstName} ${selectedMember.user?.lastName}`
                          : "Unassigned"}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                        openDropdown === 'assignee' && "rotate-180 text-[#535C91]"
                      )}
                    />
                  </button>

                  {openDropdown === 'assignee' && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setAssigneeId('');
                          setOpenDropdown(null);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer my-0.5",
                          !assigneeId
                            ? "bg-blue-50 text-blue-700 font-semibold"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Unassigned</span>
                        </div>
                        {!assigneeId && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>

                      {members.length > 0 && <div className="h-px bg-slate-100 my-1" />}

                      {members.map((m) => {
                        const val = m.userId || m.id;
                        const isSelected = assigneeId === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setAssigneeId(val);
                              setOpenDropdown(null);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer my-0.5",
                              isSelected
                                ? "bg-blue-50 text-blue-700 font-semibold"
                                : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <div className="w-5 h-5 rounded-full bg-[#535C91]/10 text-[#535C91] text-[10px] font-bold flex items-center justify-center shrink-0 uppercase">
                                {(m.user?.firstName?.[0] || '') + (m.user?.lastName?.[0] || '') || 'U'}
                              </div>
                              <div className="min-w-0 truncate">
                                <span className="font-semibold text-slate-900">{m.user?.firstName} {m.user?.lastName}</span>
                                <span className="text-[11px] text-slate-400 ml-1.5 truncate">({m.user?.email})</span>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Form Actions Footer pinned to bottom */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition cursor-pointer font-heading"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingMetadata}
              className={cn(
                'px-5 py-2.5 rounded-xl bg-[#535C91] hover:bg-[#434a78] text-white text-xs font-bold shadow-md shadow-[#535C91]/20 transition flex items-center gap-2 cursor-pointer font-heading',
                isSubmitting && 'opacity-60 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Task...</span>
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4" />
                  <span>Create Task</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
