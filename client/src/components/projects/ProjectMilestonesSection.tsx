import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Project, Milestone, MilestoneStatus } from '../../types/project.js';
import { api } from '../../lib/apiClient.js';
import { useToast } from '../../contexts/ToastContext.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { Input } from '../ui/Input.js';
import { Textarea } from '../ui/Textarea.js';
import { DatePicker } from '../ui/DatePicker.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { formatDate, formatMoney, getFriendlyErrorMessage, cn } from '../../lib/utils.js';
import {
  Milestone as MilestoneIcon,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  DollarSign,
  Calendar,
  Layers,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MessageSquareWarning,
  Lock,
} from 'lucide-react';

export interface ProjectMilestonesSectionProps {
  project: Project;
}

export const ProjectMilestonesSection: React.FC<ProjectMilestonesSectionProps> = ({ project }) => {
  const { currentRole, activeOrg } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const isOwner = currentRole === 'OWNER';
  const isClient = currentRole === 'CLIENT';
  const isMember = currentRole === 'MEMBER';
  const currency = activeOrg?.currency || 'USD';

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [milestoneToEdit, setMilestoneToEdit] = useState<Milestone | null>(null);
  const [milestoneToDelete, setMilestoneToDelete] = useState<Milestone | null>(null);

  // Client Revision Modal State
  const [revisionMilestone, setRevisionMilestone] = useState<Milestone | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');

  // Expandable revision notes tracker: { [milestoneId]: boolean }
  const [expandedRevisions, setExpandedRevisions] = useState<Record<string, boolean>>({});

  // Add form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<MilestoneStatus>('PENDING');

  // Edit form state (Budget cannot be changed as per requirements)
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editStatus, setEditStatus] = useState<MilestoneStatus>('PENDING');

  const toggleRevisionExpand = (milestoneId: string) => {
    setExpandedRevisions((prev) => ({
      ...prev,
      [milestoneId]: !prev[milestoneId],
    }));
  };

  const openAddModal = () => {
    setTitle('');
    setDescription('');
    setBudget('');
    setDeadline('');
    setStatus('PENDING');
    setIsAddModalOpen(true);
  };

  const openEditModal = (m: Milestone) => {
    setMilestoneToEdit(m);
    setEditTitle(m.title);
    setEditDescription(m.description || '');
    setEditDeadline(m.deadline ? m.deadline.split('T')[0] : '');
    setEditStatus(m.status);
  };

  const openRevisionModal = (m: Milestone) => {
    setRevisionMilestone(m);
    setRevisionNotes('');
  };

  // Add Mutation (Owner only)
  const addMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/projects/${project.id}/milestones`, payload),
    onSuccess: () => {
      success('Milestone added successfully');
      setIsAddModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  // Update Mutation (Owner only - budget immutable)
  const updateMutation = useMutation({
    mutationFn: ({ milestoneId, payload }: { milestoneId: string; payload: any }) =>
      api.patch(`/projects/${project.id}/milestones/${milestoneId}`, payload),
    onSuccess: () => {
      success('Milestone updated successfully');
      setMilestoneToEdit(null);
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  // Delete Mutation (Owner only)
  const deleteMutation = useMutation({
    mutationFn: (milestoneId: string) =>
      api.delete(`/projects/${project.id}/milestones/${milestoneId}`),
    onSuccess: () => {
      success('Milestone removed successfully');
      setMilestoneToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  // Approve Milestone Mutation (Client or Owner)
  const approveMutation = useMutation({
    mutationFn: (milestoneId: string) =>
      api.post(`/projects/${project.id}/milestones/${milestoneId}/approve`, {}),
    onSuccess: () => {
      success('Milestone approved successfully! Notification sent to the team.');
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  // Request Revision Mutation (Client or Owner)
  const revisionMutation = useMutation({
    mutationFn: ({ milestoneId, notes }: { milestoneId: string; notes: string }) =>
      api.post(`/projects/${project.id}/milestones/${milestoneId}/revision`, {
        revisionNotes: notes,
      }),
    onSuccess: () => {
      success('Revision requested successfully! Notification sent to the owner.');
      setRevisionMilestone(null);
      setRevisionNotes('');
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      error('Milestone title is required');
      return;
    }

    addMutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      budget: budget !== '' && !isNaN(Number(budget)) ? Number(budget) : null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      status,
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!milestoneToEdit) return;
    if (!editTitle.trim()) {
      error('Milestone title is required');
      return;
    }

    updateMutation.mutate({
      milestoneId: milestoneToEdit.id,
      payload: {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        deadline: editDeadline ? new Date(editDeadline).toISOString() : null,
        status: editStatus,
      },
    });
  };

  const handleQuickStatusChange = (m: Milestone, newStatus: MilestoneStatus) => {
    if (!isOwner) return;
    updateMutation.mutate({
      milestoneId: m.id,
      payload: { status: newStatus },
    });
  };

  const handleSubmitRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionMilestone) return;
    if (!revisionNotes.trim()) {
      error('Please explain what revisions are required.');
      return;
    }

    revisionMutation.mutate({
      milestoneId: revisionMilestone.id,
      notes: revisionNotes.trim(),
    });
  };

  const milestones = project.milestones || [];
  const completedCount = milestones.filter((m) => m.status === 'COMPLETED').length;
  const approvedCount = milestones.filter((m) => m.approvalStatus === 'APPROVED').length;
  const totalMilestonesBudget = milestones.reduce((sum, m) => sum + (m.budget ? Number(m.budget) : 0), 0);
  const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  const getStatusBadge = (st: MilestoneStatus) => {
    switch (st) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Completed
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            In Progress
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0 shadow-2xs">
            <MilestoneIcon className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-slate-900 font-heading">
                Project Milestones
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                {completedCount} / {milestones.length} Completed ({progressPercent}%)
              </span>
              {approvedCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {approvedCount} Approved
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Phased deliverables, deadlines, client reviews, revisions, and milestone approvals.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isMember && (
            <div className="text-right hidden sm:block">
              <span className="text-[11px] text-slate-400 font-medium block">Total Milestone Value</span>
              <span className="text-sm font-black text-slate-900 font-heading">
                {formatMoney(totalMilestonesBudget, currency)}
              </span>
            </div>
          )}

          {isOwner && (
            <Button
              variant="primary"
              size="sm"
              onClick={openAddModal}
              leftIcon={<Plus className="w-4 h-4" />}
              className="bg-[#535C91] hover:bg-[#434b7a] text-white font-bold shadow-xs cursor-pointer shrink-0"
            >
              Add Milestone
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {milestones.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Milestone Progress</span>
            <span className="font-bold text-slate-800">{progressPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Milestones Cards List */}
      {milestones.length === 0 ? (
        <div className="py-12 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 mx-auto mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No milestones defined yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Break this project into structured phases, deliverables, and budgets.
          </p>
          {isOwner && (
            <Button
              variant="secondary"
              size="sm"
              onClick={openAddModal}
              leftIcon={<Plus className="w-4 h-4" />}
              className="mt-4"
            >
              Create First Milestone
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {milestones.map((m, idx) => {
            const isApproved = m.approvalStatus === 'APPROVED';
            const isRevisionRequested = m.approvalStatus === 'REVISION_REQUESTED';
            const isCompleted = m.status === 'COMPLETED';
            const isExpanded = Boolean(expandedRevisions[m.id]);

            return (
              <div
                key={m.id}
                className={cn(
                  'p-4.5 bg-white border rounded-2xl transition-all shadow-xs space-y-3 relative group',
                  isApproved
                    ? 'border-emerald-200/90 bg-emerald-50/10'
                    : isRevisionRequested
                    ? 'border-amber-200/90 bg-amber-50/10'
                    : 'border-slate-200 hover:border-purple-300'
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={cn(
                        'w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-2xs',
                        isApproved
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : isRevisionRequested
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-purple-100 text-purple-800 border border-purple-200'
                      )}
                    >
                      {idx + 1}
                    </span>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 tracking-tight leading-snug">
                          {m.title}
                        </h4>

                        {/* Approved Badge */}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            Approved
                          </span>
                        )}

                        {/* Revision Requested Badge */}
                        {isRevisionRequested && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                            <RefreshCw className="w-3 h-3 text-amber-700 animate-spin-reverse" />
                            Revision Requested
                          </span>
                        )}
                      </div>

                      {m.description && (
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {m.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-center shrink-0">
                    {/* Status Dropdown (Owner only) or Status Badge (Client & Member) */}
                    {isOwner ? (
                      <select
                        value={m.status}
                        onChange={(e) => handleQuickStatusChange(m, e.target.value as MilestoneStatus)}
                        disabled={updateMutation.isPending}
                        className={cn(
                          'text-xs font-bold rounded-xl px-3 py-1.5 border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/20 shadow-2xs',
                          m.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : m.status === 'IN_PROGRESS'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : m.status === 'CANCELLED'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        )}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    ) : (
                      getStatusBadge(m.status)
                    )}

                    {/* Client Actions: Approve / Request Revision when Owner marks COMPLETED */}
                    {isClient && isCompleted && !isApproved && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => approveMutation.mutate(m.id)}
                          isLoading={approveMutation.isPending}
                          leftIcon={<Check className="w-3.5 h-3.5" />}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-1 px-2.5 rounded-lg shadow-xs"
                        >
                          Approve
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openRevisionModal(m)}
                          leftIcon={<RefreshCw className="w-3.5 h-3.5 text-amber-600" />}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 font-bold text-xs py-1 px-2.5 rounded-lg shadow-xs"
                        >
                          Request Revision
                        </Button>
                      </div>
                    )}

                    {/* Owner Actions (Edit & Delete) */}
                    {isOwner && (
                      <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(m)}
                          className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                          title="Edit milestone"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setMilestoneToDelete(m)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete milestone"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Milestone Details Footer (Budget & Deadline) */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2.5 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-4">
                    {!isMember && (
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-medium text-slate-500">Budget:</span>
                        <span className="font-bold text-slate-900">
                          {m.budget !== null && m.budget !== undefined ? formatMoney(m.budget, currency) : '—'}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-medium text-slate-500">Due Date:</span>
                      <span className="font-semibold text-slate-800">
                        {formatDate(m.deadline) || 'No date set'}
                      </span>
                    </div>
                  </div>

                  {/* Revision Expand Toggle Button (if revision notes exist) */}
                  {m.revisionNotes && (
                    <button
                      type="button"
                      onClick={() => toggleRevisionExpand(m.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 transition-colors cursor-pointer bg-amber-50 hover:bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-200"
                    >
                      <MessageSquareWarning className="w-3.5 h-3.5 text-amber-600" />
                      <span>{isExpanded ? 'Hide Client Feedback' : 'View Client Feedback'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>

                {/* Expandable Revision Notes Box */}
                {m.revisionNotes && isExpanded && (
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200/90 rounded-xl space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                        <MessageSquareWarning className="w-4 h-4 text-amber-600" />
                        <span>Client Revision Feedback:</span>
                      </div>
                      {m.revisionCount && m.revisionCount > 1 && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-200/70 text-amber-900">
                          Round #{m.revisionCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-amber-900 whitespace-pre-wrap leading-relaxed font-medium bg-white/70 p-2.5 rounded-lg border border-amber-200/50">
                      {m.revisionNotes}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Milestone Modal (Owner only) */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Project Milestone"
        description="Define a new deliverable phase, deadline, and allocated budget."
        size="md"
      >
        <form onSubmit={handleSaveAdd} className="space-y-4">
          <Input
            label="Milestone Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Phase 2: Frontend Implementation & Integration"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="number"
              step="0.01"
              min="0"
              label="Milestone Budget ($)"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="2500.00"
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-purple-500/15 focus:border-purple-600"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div>
            <DatePicker
              label="Target Deadline"
              value={deadline}
              onChange={(val) => setDeadline(val)}
              placeholder="Select target deadline..."
            />
          </div>

          <Textarea
            label="Deliverables & Scope"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Key deliverables, milestone sign-off criteria, or requirements..."
            rows={3}
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddModalOpen(false)}
              disabled={addMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={addMutation.isPending}>
              Add Milestone
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Milestone Modal (Owner only - Budget cannot be edited) */}
      <Modal
        isOpen={Boolean(milestoneToEdit)}
        onClose={() => setMilestoneToEdit(null)}
        title="Edit Project Milestone"
        description="Update deliverable details, target deadline, and completion status. (Budget cannot be altered)"
        size="md"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input
            label="Milestone Title"
            required
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="e.g. Phase 2: Frontend Implementation & Integration"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Locked Budget Display */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase mb-1.5">
                Milestone Budget (Locked)
              </label>
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
                <span>
                  {milestoneToEdit?.budget !== null && milestoneToEdit?.budget !== undefined
                    ? formatMoney(milestoneToEdit.budget, currency)
                    : 'No budget set'}
                </span>
                <Lock className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase mb-1.5">
                Status
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as MilestoneStatus)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-purple-500/15 focus:border-purple-600"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div>
            <DatePicker
              label="Target Deadline"
              value={editDeadline}
              onChange={(val) => setEditDeadline(val)}
              placeholder="Select target deadline..."
            />
          </div>

          <Textarea
            label="Deliverables & Scope"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Key deliverables, milestone sign-off criteria, or requirements..."
            rows={3}
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMilestoneToEdit(null)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={updateMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Client Request Revision Modal */}
      <Modal
        isOpen={Boolean(revisionMilestone)}
        onClose={() => setRevisionMilestone(null)}
        title="Request Milestone Revision"
        description="Provide detailed feedback on what changes are needed before approving this milestone."
        size="md"
      >
        <form onSubmit={handleSubmitRevision} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase mb-1.5">
              Milestone Deliverable
            </label>
            <div className="px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-800">
              {revisionMilestone?.title}
            </div>
          </div>

          <div>
            <Textarea
              label="Revision Details & Feedback *"
              required
              rows={4}
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Explain the changes, adjustments, or additions required..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRevisionMilestone(null)}
              disabled={revisionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              isLoading={revisionMutation.isPending}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Send Revision Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Milestone Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(milestoneToDelete)}
        onClose={() => setMilestoneToDelete(null)}
        onConfirm={() => milestoneToDelete && deleteMutation.mutate(milestoneToDelete.id)}
        title="Delete Milestone?"
        message={`Are you sure you want to delete "${milestoneToDelete?.title}"?`}
        confirmLabel="Delete Milestone"
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
