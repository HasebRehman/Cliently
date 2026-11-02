import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { api } from '../../lib/apiClient.js';
import { Task, TaskPriority, TaskStatus } from '../../types/task.js';
import { Project } from '../../types/project.js';
import { CreateTaskModal } from '../../components/tasks/CreateTaskModal.js';
import { EditTaskModal } from '../../components/tasks/EditTaskModal.js';
import { AiTaskGeneratorModal } from '../../components/tasks/AiTaskGeneratorModal.js';
import { Pagination } from '../../components/ui/Pagination.js';
import {
  CheckSquare,
  Sparkles,
  Plus,
  Search,
  FolderKanban,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Circle,
  Loader2,
  List,
  Kanban,
  Edit2,
  Trash2,
  Filter,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

const PRIORITY_FILTER_OPTIONS: { value: 'ALL' | TaskPriority; label: string; dotColor: string }[] = [
  { value: 'ALL', label: 'All Priorities', dotColor: 'bg-slate-400' },
  { value: 'LOW', label: 'Low', dotColor: 'bg-emerald-500' },
  { value: 'MEDIUM', label: 'Medium', dotColor: 'bg-amber-500' },
  { value: 'HIGH', label: 'High', dotColor: 'bg-orange-500' },
  { value: 'URGENT', label: 'Urgent ⚡', dotColor: 'bg-rose-500' },
];

const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string; dotColor: string }[] = [
  { value: 'TODO', label: 'To Do', dotColor: 'bg-slate-400' },
  { value: 'IN_PROGRESS', label: 'In Progress', dotColor: 'bg-blue-500' },
  { value: 'COMPLETED', label: 'Complete', dotColor: 'bg-amber-500' },
  { value: 'REVIEW', label: 'In Review', dotColor: 'bg-purple-500' },
  { value: 'DONE', label: 'Done', dotColor: 'bg-emerald-500' },
];

const getStatusConfig = (status: TaskStatus) => {
  return TASK_STATUS_OPTIONS.find((s) => s.value === status) || TASK_STATUS_OPTIONS[0];
};

export const TasksPage: React.FC = () => {
  const { currentRole } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & State
  const [viewMode, setViewMode] = useState<'LIST' | 'KANBAN'>('LIST');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Custom Dropdowns state
  const [isProjectFilterOpen, setIsProjectFilterOpen] = useState(false);
  const [isPriorityFilterOpen, setIsPriorityFilterOpen] = useState(false);
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<string | null>(null);

  // Delete Confirmation Modal state
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const projectFilterRef = React.useRef<HTMLDivElement>(null);
  const priorityFilterRef = React.useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (projectFilterRef.current && !projectFilterRef.current.contains(event.target as Node)) {
        setIsProjectFilterOpen(false);
      }
      if (priorityFilterRef.current && !priorityFilterRef.current.contains(event.target as Node)) {
        setIsPriorityFilterOpen(false);
      }
      if (openStatusDropdownId !== null) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-status-dropdown]')) {
          setOpenStatusDropdownId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openStatusDropdownId]);

  // Handle ESC key and scroll lock for Delete Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && taskToDelete && !isDeleting) {
        setTaskToDelete(null);
      }
    };
    if (taskToDelete) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [taskToDelete, isDeleting]);

  const getAvailableStatusOptions = (currentStatus: TaskStatus) => {
    if (currentRole === 'MEMBER') {
      return TASK_STATUS_OPTIONS.filter(
        (opt) =>
          opt.value === 'TODO' ||
          opt.value === 'IN_PROGRESS' ||
          opt.value === 'COMPLETED' ||
          opt.value === currentStatus
      );
    }
    return TASK_STATUS_OPTIONS;
  };

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: Task[] }>('/tasks');
      const data = Array.isArray(res) ? res : (res as any)?.data || [];
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch projects for filter dropdown
  useEffect(() => {
    api.get<Project[]>('/projects')
      .then((res) => {
        const projs = Array.isArray(res) ? res : (res as any)?.data || [];
        setProjects(projs);
      })
      .catch((err) => {
        console.error('Failed to fetch projects:', err);
      });
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Quick Status Change handler
  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
      toastSuccess(`Task status changed to ${newStatus.replace('_', ' ')}`);
    } catch (err: any) {
      toastError(err?.message || 'Failed to update task status');
    }
  };

  // Delete confirmation handler (Owner only)
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/tasks/${taskToDelete.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskToDelete.id));
      toastSuccess('Task deleted successfully');
      setTaskToDelete(null);
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered tasks
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'ALL' && task.status !== statusFilter) return false;
    if (selectedProjectId !== 'ALL' && task.projectId !== selectedProjectId) return false;
    if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) return false;

    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const titleMatch = task.title.toLowerCase().includes(query);
    const descMatch = task.description?.toLowerCase().includes(query);
    const projMatch = task.project?.name.toLowerCase().includes(query);
    const assigneeMatch = `${task.assignee?.firstName || ''} ${task.assignee?.lastName || ''}`.toLowerCase().includes(query);

    return titleMatch || descMatch || projMatch || assigneeMatch;
  });

  const todoTasks = tasks.filter((t) => t.status === 'TODO');
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS');
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const reviewTasks = tasks.filter((t) => t.status === 'REVIEW');
  const doneTasks = tasks.filter((t) => t.status === 'DONE');

  // Client role guard
  if (currentRole === 'CLIENT') {
    return <Navigate to="/dashboard" replace />;
  }

  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const paginatedTasks = filteredTasks.slice((page - 1) * pageSize, page * pageSize);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'URGENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
            Urgent ⚡
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            High
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            Medium
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            Low
          </span>
        );
    }
  };

  const getTaskStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'DONE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            Done
          </span>
        );
      case 'REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            In Review
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            Complete
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            In Progress
          </span>
        );
      case 'TODO':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            To Do
          </span>
        );
    }
  };

  // Row background color style based on status
  const getTaskRowStyle = (status: TaskStatus) => {
    switch (status) {
      case 'DONE':
        return 'bg-emerald-50/60 border-l-4 border-l-emerald-500 hover:bg-emerald-50/90';
      case 'REVIEW':
        return 'bg-purple-50/60 border-l-4 border-l-purple-500 hover:bg-purple-50/90';
      case 'COMPLETED':
        return 'bg-amber-50/60 border-l-4 border-l-amber-500 hover:bg-amber-50/90';
      case 'IN_PROGRESS':
        return 'bg-blue-50/60 border-l-4 border-l-blue-500 hover:bg-blue-50/90';
      case 'TODO':
      default:
        return 'bg-white border-l-4 border-l-slate-300 hover:bg-slate-50/80';
    }
  };

  // Kanban card background style based on status
  const getTaskCardStyle = (status: TaskStatus) => {
    switch (status) {
      case 'DONE':
        return 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-400 hover:shadow-md';
      case 'REVIEW':
        return 'bg-purple-50/70 border-purple-300 hover:border-purple-400 hover:shadow-md';
      case 'COMPLETED':
        return 'bg-amber-50/70 border-amber-300 hover:border-amber-400 hover:shadow-md';
      case 'IN_PROGRESS':
        return 'bg-blue-50/70 border-blue-300 hover:border-blue-400 hover:shadow-md';
      case 'TODO':
      default:
        return 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md';
    }
  };

// Animated Progress Circle Component
const TaskProgressCircle: React.FC<{
  total: number;
  done: number;
  completed?: number;
}> = ({ total, done, completed = 0 }) => {
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
  const [animatedPercent, setAnimatedPercent] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1000; // ms
    const stepTime = 16;
    const steps = duration / stepTime;
    const increment = percentage / steps;
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if (current >= percentage) {
        setAnimatedPercent(percentage);
        clearInterval(timer);
      } else {
        setAnimatedPercent(Math.round(current));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [percentage]);

  const radius = 30;
  const stroke = 5.5;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (animatedPercent / 100) * circumference;

  return (
    <div className="flex items-center gap-3.5 bg-[#1B1A55]/80 border border-[#535C91]/60 rounded-2xl p-2.5 px-4 shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95 duration-500">
      {/* Animated SVG Circular Progress Gauge */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg height={radius * 2} width={radius * 2} className="-rotate-90">
          <defs>
            <linearGradient id="taskProgressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
          </defs>
          {/* Background Track Circle */}
          <circle
            stroke="#070F2B"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* Animated Glowing Progress Stroke */}
          <circle
            stroke="url(#taskProgressGrad)"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{
              strokeDashoffset,
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-black text-white tracking-tight font-heading leading-none">
            {animatedPercent}%
          </span>
        </div>
      </div>

      {/* Details & Counter */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-white font-heading">
            Progress
          </span>
          <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-1.5 py-0.2 rounded-md">
            {done} / {total} Done
          </span>
          {completed > 0 && (
            <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-700/50 px-1.5 py-0.2 rounded-md">
              {completed} Pending Review
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#9290C3] leading-tight">
          {total === 0
            ? 'No tasks created'
            : done === total
            ? '🎉 100% Tasks Done!'
            : `${total - done} task${total - done > 1 ? 's' : ''} remaining`}
        </p>
      </div>
    </div>
  );
};

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* 1. Header Banner - Brand Theme */}
      <div className="rounded-2xl bg-[#070F2B] border border-[#1B1A55] p-6 sm:p-7 shadow-xl text-white">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
                {currentRole === 'MEMBER' ? 'My Assigned Tasks' : 'Tasks'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1B1A55] text-[#9290C3] border border-[#535C91]/50">
                {tasks.length} Total
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#9290C3] leading-relaxed">
              {currentRole === 'MEMBER'
                ? 'Track and update your task status (To Do, In Progress, Complete).'
                : 'Create deliverables manually or let Gemini AI analyze your project requirement documents to auto-generate structured tasks. Review and mark tasks as Done once completed.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 flex-wrap">
            {/* Animated Progress Circle */}
            <TaskProgressCircle
              total={tasks.length}
              done={doneTasks.length}
              completed={completedTasks.length}
            />

            {currentRole === 'OWNER' && (
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Generate with AI Button */}
                <button
                  type="button"
                  onClick={() => setShowAiModal(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#1B1A55] via-[#535C91] to-[#9290C3]/80 hover:from-[#1B1A55]/90 hover:to-[#535C91] text-white font-bold text-xs border border-[#535C91]/60 shadow-lg shadow-[#535C91]/25 transition cursor-pointer font-heading group"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform" />
                  <span>Create with AI</span>
                </button>

                {/* Create Task Manually Button */}
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#535C91] hover:bg-[#434a78] text-white font-bold text-xs shadow-md shadow-[#535C91]/30 transition cursor-pointer font-heading"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Manually</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Filters Bar: Search, Project Selector, Status Tabs, View Switcher */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search & Project Selector */}
          <div className="flex flex-col sm:flex-row items-center gap-3 flex-1">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tasks by title, project, assignee..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition-all font-medium"
              />
            </div>

            {/* Project Filter */}
            <div ref={projectFilterRef} className="relative w-full sm:w-64">
              <button
                type="button"
                onClick={() => {
                  setIsProjectFilterOpen((prev) => !prev);
                  setIsPriorityFilterOpen(false);
                  setOpenStatusDropdownId(null);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3.5 py-2 bg-slate-50 border rounded-xl text-xs sm:text-sm font-semibold transition-all text-left cursor-pointer",
                  "focus:outline-none focus:ring-2 focus:ring-[#535C91]/20",
                  isProjectFilterOpen
                    ? "border-[#535C91] bg-white ring-2 ring-[#535C91]/20 text-[#070F2B]"
                    : "border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-white"
                )}
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <FolderKanban className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="truncate">
                    {selectedProjectId === 'ALL'
                      ? `All Projects (${projects.length})`
                      : selectedProject?.name || 'Select Project'}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                    isProjectFilterOpen && "rotate-180 text-[#535C91]"
                  )}
                />
              </button>

              {isProjectFilterOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectId('ALL');
                      setPage(1);
                      setIsProjectFilterOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer my-0.5",
                      selectedProjectId === 'ALL'
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <FolderKanban className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">All Projects ({projects.length})</span>
                    </div>
                    {selectedProjectId === 'ALL' && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>

                  {projects.map((p) => {
                    const isSelected = selectedProjectId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(p.id);
                          setPage(1);
                          setIsProjectFilterOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer my-0.5",
                          isSelected
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <FolderKanban className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{p.name}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Priority Filter */}
            <div ref={priorityFilterRef} className="relative w-full sm:w-44">
              <button
                type="button"
                onClick={() => {
                  setIsPriorityFilterOpen((prev) => !prev);
                  setIsProjectFilterOpen(false);
                  setOpenStatusDropdownId(null);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3.5 py-2 bg-slate-50 border rounded-xl text-xs sm:text-sm font-semibold transition-all text-left cursor-pointer",
                  "focus:outline-none focus:ring-2 focus:ring-[#535C91]/20",
                  isPriorityFilterOpen
                    ? "border-[#535C91] bg-white ring-2 ring-[#535C91]/20 text-[#070F2B]"
                    : "border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-white"
                )}
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {PRIORITY_FILTER_OPTIONS.find((opt) => opt.value === priorityFilter)?.label || 'All Priorities'}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                    isPriorityFilterOpen && "rotate-180 text-[#535C91]"
                  )}
                />
              </button>

              {isPriorityFilterOpen && (
                <div className="absolute z-50 top-full left-0 right-0 sm:w-48 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                  {PRIORITY_FILTER_OPTIONS.map((opt) => {
                    const isSelected = priorityFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setPriorityFilter(opt.value);
                          setPage(1);
                          setIsPriorityFilterOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer my-0.5",
                          isSelected
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dotColor)} />
                          <span className="truncate">{opt.label}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* View Switcher (List vs Kanban) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 shrink-0 self-end lg:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer font-heading',
                viewMode === 'LIST'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('KANBAN')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer font-heading',
                viewMode === 'KANBAN'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
          </div>
        </div>

        {/* Status Filter Tabs (Only shown in List mode) */}
        {viewMode === 'LIST' && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100">
            {[
              { key: 'ALL', label: `All Tasks (${tasks.length})` },
              { key: 'TODO', label: `To Do (${todoTasks.length})` },
              { key: 'IN_PROGRESS', label: `In Progress (${inProgressTasks.length})` },
              { key: 'COMPLETED', label: `Complete (${completedTasks.length})` },
              { key: 'REVIEW', label: `In Review (${reviewTasks.length})` },
              { key: 'DONE', label: `Done (${doneTasks.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key as any);
                  setPage(1);
                }}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer font-heading',
                  statusFilter === tab.key
                    ? 'bg-[#070F2B] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. Main Content: List View or Kanban Board */}
      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 text-slate-400 gap-2">
          <Loader2 className="w-7 h-7 animate-spin text-[#535C91]" />
          <span className="text-xs font-semibold text-slate-500 font-heading">Loading tasks...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="py-20 px-6 text-center bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 shadow-inner">
            <CheckSquare className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">No tasks found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {currentRole === 'OWNER'
                ? 'Create tasks manually or use "Create with AI" to extract tasks directly from your project specification documents.'
                : 'Tasks will appear here once assigned to you by the project owner.'}
            </p>
          </div>
          {currentRole === 'OWNER' && (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="px-4 py-2 rounded-xl bg-[#1B1A55] text-white text-xs font-bold hover:bg-[#070F2B] transition cursor-pointer font-heading flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Create with AI</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl bg-[#535C91] text-white text-xs font-bold hover:bg-[#434a78] transition cursor-pointer font-heading flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Manually</span>
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'LIST' ? (
        /* ================= LIST VIEW ================= */
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col">
          {/* Header Bar */}
          <div className="bg-[#070F2B] text-white px-6 py-3.5 text-[11px] font-bold uppercase tracking-wider hidden md:grid md:grid-cols-12 md:gap-4 items-center font-heading rounded-t-2xl">
            <div className="col-span-4">Task / Deliverable</div>
            <div className="col-span-2">Project</div>
            <div className="col-span-2">Assignee & Due Date</div>
            <div className="col-span-1">Priority</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">
              {currentRole === 'OWNER' ? 'Actions' : 'State'}
            </div>
          </div>

          {/* List Rows */}
          <div className="divide-y divide-slate-100">
            {paginatedTasks.map((task, rowIndex) => {
              const isDone = task.status === 'DONE';
              const isCompleted = task.status === 'COMPLETED';
              const formattedDueDate = task.dueDate
                ? new Date(task.dueDate).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })
                : null;

              return (
                <div
                  key={task.id}
                  className={cn(
                    'px-6 py-4 flex flex-col md:grid md:grid-cols-12 md:gap-4 items-start md:items-center transition-all duration-150 gap-3 group',
                    getTaskRowStyle(task.status)
                  )}
                >
                  {/* Task Title & Description */}
                  <div className="col-span-4 flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentRole === 'MEMBER') {
                          handleStatusChange(task.id, isCompleted ? 'TODO' : 'COMPLETED');
                        } else {
                          handleStatusChange(task.id, isDone ? 'TODO' : 'DONE');
                        }
                      }}
                      className="mt-0.5 text-slate-400 hover:text-emerald-600 transition cursor-pointer shrink-0"
                      title={
                        currentRole === 'MEMBER'
                          ? isCompleted
                            ? 'Mark as To Do'
                            : 'Mark as Complete'
                          : isDone
                          ? 'Mark as Incomplete'
                          : 'Mark as Done'
                      }
                    >
                      {isDone || isCompleted ? (
                        <CheckCircle2
                          className={cn(
                            'w-5 h-5',
                            isDone ? 'text-emerald-600' : 'text-amber-600'
                          )}
                        />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 hover:text-emerald-500" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={cn(
                            'text-sm font-bold text-slate-900 truncate',
                            isDone && 'line-through text-slate-500'
                          )}
                        >
                          {task.title}
                        </p>
                        {task.aiGenerated && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                            <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                            AI
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Project */}
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/80 border border-slate-200 text-slate-700 text-xs font-semibold truncate max-w-[170px] shadow-2xs">
                      <FolderKanban className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{task.project?.name || 'Project'}</span>
                    </span>
                  </div>

                  {/* Assignee & Due Date */}
                  <div className="col-span-2 text-xs text-slate-600 space-y-0.5">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {task.assignee
                          ? `${task.assignee.firstName} ${task.assignee.lastName}`
                          : 'Unassigned'}
                      </span>
                    </div>
                    {formattedDueDate && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>Due {formattedDueDate}</span>
                        {task.estimatedHours && <span>• {task.estimatedHours}h</span>}
                      </div>
                    )}
                  </div>

                  {/* Priority */}
                  <div className="col-span-1">
                    {getPriorityBadge(task.priority)}
                  </div>

                  {/* Status Dropdown - Role restricted */}
                  <div className="col-span-2 relative" data-status-dropdown>
                    <button
                      type="button"
                      onClick={() => setOpenStatusDropdownId(openStatusDropdownId === task.id ? null : task.id)}
                      className={cn(
                        "inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all text-left cursor-pointer shadow-2xs whitespace-nowrap",
                        "focus:outline-none focus:ring-2 focus:ring-[#535C91]/20",
                        openStatusDropdownId === task.id
                          ? "border-[#535C91] bg-white ring-2 ring-[#535C91]/20 text-[#070F2B]"
                          : "border-slate-200 bg-white/95 text-slate-700 hover:border-slate-300 hover:bg-white"
                      )}
                    >
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", getStatusConfig(task.status).dotColor)} />
                        <span className="whitespace-nowrap">{getStatusConfig(task.status).label}</span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ml-1",
                          openStatusDropdownId === task.id && "rotate-180 text-[#535C91]"
                        )}
                      />
                    </button>

                    {openStatusDropdownId === task.id && (
                      <div
                        className={cn(
                          "absolute z-50 left-0 min-w-[145px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 animate-in fade-in duration-150",
                          rowIndex >= paginatedTasks.length - 2 && paginatedTasks.length > 2
                            ? "bottom-full mb-1.5 slide-in-from-bottom-1"
                            : "top-full mt-1.5 slide-in-from-top-1"
                        )}
                      >
                        {getAvailableStatusOptions(task.status).map((opt) => {
                          const isSelected = task.status === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                handleStatusChange(task.id, opt.value);
                                setOpenStatusDropdownId(null);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer my-0.5",
                                isSelected
                                  ? "bg-blue-50 text-blue-700 font-bold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-1">
                                <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dotColor)} />
                                <span className="truncate">{opt.label}</span>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Actions - OWNER only gets Edit & Delete; MEMBER only sees Badge */}
                  <div className="col-span-1 flex items-center justify-end gap-1 w-full md:w-auto">
                    {currentRole === 'OWNER' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-[#535C91] hover:bg-white/80 transition cursor-pointer"
                          title="Edit task"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskToDelete(task)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Delete task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      getTaskStatusBadge(task.status)
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {filteredTasks.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={filteredTasks.length}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      ) : (
        /* ================= KANBAN BOARD VIEW (5 COLUMNS) ================= */
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {(
            [
              { status: 'TODO', title: 'To Do', items: todoTasks, dot: 'bg-slate-400', border: 'border-slate-300' },
              { status: 'IN_PROGRESS', title: 'In Progress', items: inProgressTasks, dot: 'bg-blue-500', border: 'border-blue-400' },
              { status: 'COMPLETED', title: 'Complete', items: completedTasks, dot: 'bg-amber-500', border: 'border-amber-400' },
              { status: 'REVIEW', title: 'In Review', items: reviewTasks, dot: 'bg-purple-500', border: 'border-purple-400' },
              { status: 'DONE', title: 'Done', items: doneTasks, dot: 'bg-emerald-500', border: 'border-emerald-400' },
            ] as const
          ).map((col) => (
            <div
              key={col.status}
              className="bg-slate-100/70 rounded-2xl p-3 border border-slate-200 flex flex-col min-h-[500px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-2 py-1.5 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full', col.dot)} />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-heading truncate">
                    {col.title}
                  </h3>
                </div>
                <span className="w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-600 text-[10px] font-extrabold flex items-center justify-center shadow-2xs">
                  {col.items.length}
                </span>
              </div>

              {/* Column Cards */}
              <div className="space-y-2.5 flex-1 overflow-y-auto no-scrollbar">
                {col.items.length === 0 ? (
                  <div className="h-24 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[11px] text-slate-400 font-medium">
                    No tasks
                  </div>
                ) : (
                  col.items.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        'p-3 rounded-xl border shadow-xs transition-all flex flex-col gap-2 group',
                        getTaskCardStyle(task.status)
                      )}
                    >
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-white/80 px-2 py-0.5 rounded-md truncate max-w-[120px] border border-blue-100">
                          <FolderKanban className="w-3 h-3 shrink-0" />
                          <span className="truncate">{task.project?.name}</span>
                        </span>
                        {getPriorityBadge(task.priority)}
                      </div>

                      {/* Title */}
                      <h4
                        onClick={() => {
                          if (currentRole === 'OWNER') {
                            setEditingTask(task);
                          }
                        }}
                        className={cn(
                          'text-xs font-bold text-slate-900 line-clamp-2',
                          currentRole === 'OWNER' && 'cursor-pointer hover:text-blue-700 transition'
                        )}
                      >
                        {task.title}
                      </h4>

                      {/* Description */}
                      {task.description && (
                        <p className="text-[11px] text-slate-600 line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      {/* Role-based quick status picker inside card */}
                      <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
                        <div className="relative flex-1" data-status-dropdown>
                          <button
                            type="button"
                            onClick={() => setOpenStatusDropdownId(openStatusDropdownId === task.id ? null : task.id)}
                            className={cn(
                              "w-full inline-flex items-center justify-between gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-all text-left cursor-pointer shadow-2xs",
                              openStatusDropdownId === task.id
                                ? "border-[#535C91] bg-white ring-1 ring-[#535C91]/20 text-[#070F2B]"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            )}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", getStatusConfig(task.status).dotColor)} />
                              <span className="truncate">{getStatusConfig(task.status).label}</span>
                            </div>
                            <ChevronDown
                              className={cn(
                                "w-3 h-3 text-slate-400 shrink-0 transition-transform duration-200",
                                openStatusDropdownId === task.id && "rotate-180 text-[#535C91]"
                              )}
                            />
                          </button>

                          {openStatusDropdownId === task.id && (
                            <div className="absolute z-50 bottom-full left-0 mb-1.5 w-36 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1 animate-in fade-in slide-in-from-bottom-1 duration-150">
                              {getAvailableStatusOptions(task.status).map((opt) => {
                                const isSelected = task.status === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      handleStatusChange(task.id, opt.value);
                                      setOpenStatusDropdownId(null);
                                    }}
                                    className={cn(
                                      "w-full flex items-center justify-between px-2 py-1 rounded-md text-[11px] font-semibold transition-colors text-left cursor-pointer my-0.5",
                                      isSelected
                                        ? "bg-blue-50 text-blue-700 font-bold"
                                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 pr-1">
                                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", opt.dotColor)} />
                                      <span className="truncate">{opt.label}</span>
                                    </div>
                                    {isSelected && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {task.dueDate && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            <span>{new Date(task.dueDate).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}</span>
                          </div>
                        )}
                      </div>

                      {/* Assignee Footer */}
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate text-[10px] font-medium">
                            {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'Unassigned'}
                          </span>
                        </div>
                        {task.aiGenerated && (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-extrabold bg-amber-100 text-amber-800">
                            <Sparkles className="w-2 h-2 text-amber-600" /> AI
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Create Task Modal (Owner only) */}
      {currentRole === 'OWNER' && (
        <CreateTaskModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onTaskCreated={() => {
            fetchTasks();
          }}
          initialProjectId={selectedProjectId !== 'ALL' ? selectedProjectId : undefined}
        />
      )}

      {/* AI Task Generator & Approval Wizard (Owner only) */}
      {currentRole === 'OWNER' && (
        <AiTaskGeneratorModal
          isOpen={showAiModal}
          onClose={() => setShowAiModal(false)}
          onTasksApproved={() => {
            fetchTasks();
          }}
          initialProjectId={selectedProjectId !== 'ALL' ? selectedProjectId : undefined}
        />
      )}

      {/* Edit Task Modal (Owner only) */}
      {currentRole === 'OWNER' && editingTask && (
        <EditTaskModal
          isOpen={Boolean(editingTask)}
          onClose={() => setEditingTask(null)}
          onTaskUpdated={() => {
            fetchTasks();
          }}
          task={editingTask}
          canDelete={true}
        />
      )}

      {/* Delete Confirmation Modal (Centered) */}
      {taskToDelete &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) {
                setTaskToDelete(null);
              }
            }}
          >
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col my-auto">
              {/* Header */}
              <div className="px-6 py-4 bg-[#070F2B] text-white flex items-center justify-between border-b border-[#1B1A55]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white font-heading">Delete Task</h3>
                    <p className="text-[11px] text-slate-300">Confirm task deletion</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isDeleting && setTaskToDelete(null)}
                  disabled={isDeleting}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  Are you sure you want to delete this task? This action cannot be undone and will permanently remove it from the workspace.
                </p>

                {/* Task Details Preview Box */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                  <div className="text-xs font-bold text-slate-900 line-clamp-2">
                    {taskToDelete.title}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                    {taskToDelete.project?.name && (
                      <span className="flex items-center gap-1 font-semibold text-slate-700 truncate max-w-[200px]">
                        <FolderKanban className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">{taskToDelete.project.name}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1 font-medium text-slate-600">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", getStatusConfig(taskToDelete.status).dotColor)} />
                      <span>{getStatusConfig(taskToDelete.status).label}</span>
                    </span>
                    {taskToDelete.assignee && (
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{taskToDelete.assignee.firstName} {taskToDelete.assignee.lastName}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTaskToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-bold rounded-xl text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition cursor-pointer font-heading"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-bold rounded-xl text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 transition cursor-pointer font-heading flex items-center gap-1.5"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Task</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

