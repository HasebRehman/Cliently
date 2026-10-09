import React, { useState, useEffect } from 'react';
import { api } from '../../lib/apiClient.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Task, TaskPriority, TaskStatus } from '../../types/task.js';
import { X, CheckSquare, Calendar, Clock, User, Loader2, Trash2 } from 'lucide-react';
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

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated: () => void;
  task: Task | null;
  canDelete?: boolean;
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({
  isOpen,
  onClose,
  onTaskUpdated,
  task,
  canDelete = true,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  useEffect(() => {
    if (isOpen && task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'MEDIUM');
      setStatus(task.status || 'TODO');
      setDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
      setEstimatedHours(task.estimatedHours ? String(task.estimatedHours) : '');
      setAssigneeId(task.assigneeId || '');

      api.get<TeamMember[]>('/members')
        .then((res) => {
          const mems = Array.isArray(res) ? res : (res as any)?.data || [];
          setMembers(mems);
        })
        .catch((err) => {
          console.error('Failed to load members:', err);
        });
    }
  }, [isOpen, task]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toastError('Task title is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.patch(`/tasks/${task.id}`, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        assigneeId: assigneeId || null,
      });

      toastSuccess('Task updated successfully!');
      onTaskUpdated();
      onClose();
    } catch (err: any) {
      toastError(err?.message || 'Failed to update task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this task?')) {
      return;
    }

    setIsDeleting(true);
    try {
      await api.delete(`/tasks/${task.id}`);
      toastSuccess('Task deleted successfully!');
      onTaskUpdated();
      onClose();
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete task');
    } finally {
      setIsDeleting(false);
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
              <h2 className="text-base font-bold text-white tracking-tight font-heading">Edit Task</h2>
              <p className="text-[11px] text-[#9290C3]">
                Project: <strong className="text-white">{task.project?.name || 'General Project'}</strong>
              </p>
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
          {/* Task Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
              Task Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task details and acceptance criteria..."
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

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            {canDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition flex items-center gap-1.5 cursor-pointer font-heading"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete Task</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer font-heading"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isDeleting}
                className={cn(
                  'px-5 py-2.5 rounded-xl bg-[#070F2B] hover:bg-[#1B1A55] text-white text-xs font-bold shadow-sm transition flex items-center gap-2 cursor-pointer font-heading',
                  isSubmitting && 'opacity-60 cursor-not-allowed'
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
