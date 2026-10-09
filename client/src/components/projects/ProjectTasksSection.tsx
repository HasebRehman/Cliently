import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { Project } from '../../types/project.js';
import { Task, TaskPriority, TaskStatus } from '../../types/task.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { CreateTaskModal } from '../tasks/CreateTaskModal.js';
import { EditTaskModal } from '../tasks/EditTaskModal.js';
import { AiTaskGeneratorModal } from '../tasks/AiTaskGeneratorModal.js';
import {
  CheckSquare,
  Sparkles,
  Plus,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Circle,
  Loader2,
  Edit2,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

export interface ProjectTasksSectionProps {
  project: Project;
}

export const ProjectTasksSection: React.FC<ProjectTasksSectionProps> = ({ project }) => {
  const { currentRole } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const isOwner = currentRole === 'OWNER';
  const isMember = currentRole === 'MEMBER';
  const isClient = currentRole === 'CLIENT';

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Fetch tasks for this specific project
  const {
    data: tasksData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['tasks', { projectId: project.id }],
    queryFn: async () => {
      const res = await api.get<{ data: Task[] }>(`/tasks?projectId=${project.id}&limit=100`);
      return Array.isArray(res) ? res : (res as any)?.data || [];
    },
    enabled: Boolean(project.id),
  });

  const tasks: Task[] = tasksData || [];

  // Status Change Mutation
  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      api.patch(`/tasks/${taskId}`, { status }),
    onSuccess: (_data, variables) => {
      toastSuccess(`Task moved to ${variables.status.replace('_', ' ')}`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      refetch();
    },
    onError: (err: any) => {
      toastError(err?.message || 'Failed to update task status');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      toastSuccess('Task deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      refetch();
    },
    onError: (err: any) => {
      toastError(err?.message || 'Failed to delete task');
    },
  });

  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    statusMutation.mutate({ taskId, status: newStatus });
  };

  const handleDeleteTask = (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    deleteMutation.mutate(taskId);
  };

  // Stats calculation
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'DONE').length;
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

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

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
            <CheckSquare className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 font-heading">
                Project Tasks & Deliverables
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {totalTasks} {totalTasks === 1 ? 'Task' : 'Tasks'}
              </span>
              {totalTasks > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {doneTasks}/{totalTasks} Done ({progressPercent}%)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Actionable tasks, assignments, and deliverables created for this project.
            </p>
          </div>
        </div>

        {/* Action Buttons (Owner only) */}
        {isOwner && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#1B1A55] to-[#535C91] text-white font-bold text-xs shadow-sm hover:from-[#070F2B] hover:to-[#1B1A55] transition cursor-pointer font-heading"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Create with AI</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#535C91] text-white font-bold text-xs shadow-sm hover:bg-[#434a78] transition cursor-pointer font-heading"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {totalTasks > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Overall Completion</span>
            <span className="font-bold text-slate-800">{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
            {totalTasks > 0 && (
              <div
                className="h-full bg-amber-400 transition-all duration-500"
                style={{ width: `${Math.round((completedTasks / totalTasks) * 100)}%` }}
              />
            )}
            {totalTasks > 0 && (
              <div
                className="h-full bg-blue-400 transition-all duration-500"
                style={{ width: `${Math.round((inProgressTasks / totalTasks) * 100)}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Task List / State */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#535C91]" />
          <span className="text-xs font-medium">Loading project tasks...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center space-y-2">
          <CheckSquare className="w-7 h-7 text-slate-400" />
          <p className="text-xs font-semibold text-slate-700">No tasks created for this project yet</p>
          <p className="text-[11px] text-slate-400 max-w-sm">
            {isOwner
              ? 'Add tasks manually or use AI to analyze uploaded requirement files and generate structured tasks.'
              : 'Tasks will appear here once assigned to this project.'}
          </p>
          {isOwner && (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#1B1A55] text-white text-xs font-bold hover:bg-[#070F2B] transition cursor-pointer font-heading flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Create with AI</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#535C91] text-white text-xs font-bold hover:bg-[#434a78] transition cursor-pointer font-heading flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" />
                <span>Add Task</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {tasks.map((task) => {
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
                  'px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors',
                  getTaskRowStyle(task.status)
                )}
              >
                {/* Left: Check toggle + Title + Description */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {!isClient && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isMember) {
                          handleStatusChange(task.id, isCompleted ? 'TODO' : 'COMPLETED');
                        } else {
                          handleStatusChange(task.id, isDone ? 'TODO' : 'DONE');
                        }
                      }}
                      className="mt-0.5 text-slate-400 hover:text-emerald-600 transition cursor-pointer shrink-0"
                      title={
                        isMember
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
                          className={cn('w-4 h-4', isDone ? 'text-emerald-600' : 'text-amber-600')}
                        />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 hover:text-emerald-500" />
                      )}
                    </button>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={cn(
                          'text-xs sm:text-sm font-bold text-slate-900 truncate',
                          isDone && 'line-through text-slate-500'
                        )}
                      >
                        {task.title}
                      </p>
                      {task.aiGenerated && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[8px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                          <Sparkles className="w-2.5 h-2.5 text-amber-500" /> AI
                        </span>
                      )}
                      {getPriorityBadge(task.priority)}
                    </div>
                    {task.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Assignee, Due Date, Status, Actions */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto flex-wrap">
                  {/* Assignee */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate max-w-[110px]">
                      {task.assignee ? `${task.assignee.firstName}` : 'Unassigned'}
                    </span>
                  </div>

                  {/* Due date & Estimated Hours */}
                  {formattedDueDate && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{formattedDueDate}</span>
                      {task.estimatedHours && (
                        <span className="flex items-center gap-0.5 text-slate-400">
                          <Clock className="w-2.5 h-2.5 ml-0.5" />
                          {task.estimatedHours}h
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status Dropdown / Badge */}
                  {isClient ? (
                    getTaskStatusBadge(task.status)
                  ) : (
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                      className="text-[11px] font-bold rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-slate-700 focus:outline-none focus:border-[#535C91] cursor-pointer shadow-2xs"
                    >
                      {isMember ? (
                        <>
                          <option value="TODO">To Do</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Complete</option>
                          {task.status === 'REVIEW' && <option value="REVIEW" disabled>In Review</option>}
                          {task.status === 'DONE' && <option value="DONE" disabled>Done</option>}
                        </>
                      ) : (
                        <>
                          <option value="TODO">To Do</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Complete</option>
                          <option value="REVIEW">In Review</option>
                          <option value="DONE">Done</option>
                        </>
                      )}
                    </select>
                  )}

                  {/* Edit / Delete Buttons for Owner */}
                  {isOwner && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingTask(task)}
                        className="p-1 rounded-lg text-slate-400 hover:text-[#535C91] hover:bg-white/80 transition cursor-pointer"
                        title="Edit task"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Create Task Modal */}
      {isOwner && (
        <CreateTaskModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onTaskCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            refetch();
          }}
          initialProjectId={project.id}
        />
      )}

      {/* AI Task Generator Modal */}
      {isOwner && (
        <AiTaskGeneratorModal
          isOpen={showAiModal}
          onClose={() => setShowAiModal(false)}
          onTasksApproved={() => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            refetch();
          }}
          initialProjectId={project.id}
        />
      )}

      {/* Edit Task Modal */}
      {isOwner && editingTask && (
        <EditTaskModal
          isOpen={Boolean(editingTask)}
          onClose={() => setEditingTask(null)}
          onTaskUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            refetch();
          }}
          task={editingTask}
          canDelete={true}
        />
      )}
    </div>
  );
};
