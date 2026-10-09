import React, { useState, useEffect } from 'react';
import { api } from '../../lib/apiClient.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Project } from '../../types/project.js';
import { TaskPriority, TaskStatus } from '../../types/task.js';
import { X, CheckSquare, Calendar, Clock, User, Loader2, FolderKanban } from 'lucide-react';
import { cn } from '../../lib/utils.js';

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
    } catch (err: any) {
      toastError(err?.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
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

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {isLoadingMetadata ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#535C91]" />
              <span className="text-xs font-semibold text-slate-500 font-heading">Loading project data...</span>
            </div>
          ) : (
            <>
              {/* Project Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                  Project <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <FolderKanban className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
                  >
                    <option value="" disabled>Select a project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition resize-none"
                />
              </div>

              {/* Priority & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent ⚡</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Complete</option>
                    <option value="REVIEW">In Review</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
              </div>

              {/* Due Date & Estimated Hours */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                    Due Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                    Est. Hours
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="500"
                      placeholder="e.g. 8"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                  Assign To Team Member
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.userId || m.id} value={m.userId || m.id}>
                        {m.user?.firstName} {m.user?.lastName} ({m.user?.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer font-heading"
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
};
