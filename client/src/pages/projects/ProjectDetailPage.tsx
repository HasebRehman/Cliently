import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { Project, ProjectStatus } from '../../types/project.js';
import { Invoice } from '../../types/invoice.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Button } from '../../components/ui/Button.js';
import { ProjectStatusBadge, InvoiceStatusBadge } from '../../components/ui/Badge.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.js';
import { CardSkeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { ProjectFormModal } from './ProjectFormModal.js';
import { ProjectFilesSection } from '../../components/projects/ProjectFilesSection.js';
import { ProjectTeamSection } from '../../components/projects/ProjectTeamSection.js';
import { ProjectMilestonesSection } from '../../components/projects/ProjectMilestonesSection.js';
import { ProjectTasksSection } from '../../components/projects/ProjectTasksSection.js';
import { ProjectMeetingsSection } from '../../components/projects/ProjectMeetingsSection.js';
import { formatDate, formatMoney, getFriendlyErrorMessage, cn } from '../../lib/utils.js';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Building,
  Edit2,
  Trash2,
  FileText,
  Plus,
  Zap,
  Milestone,
} from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentRole, activeOrg } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const isOwner = currentRole === 'OWNER';
  const isMember = currentRole === 'MEMBER';

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch project details
  const {
    data: project,
    isLoading,
    isError,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<Project>(`/projects/${id}`),
    enabled: Boolean(id),
  });

  // Fetch project invoices (Only for Owner and Client; Members do not see Invoices)
  const { data: invoicesData } = useQuery({
    queryKey: ['invoices', { projectId: id }],
    queryFn: () => api.get<{ data: Invoice[] }>(`/invoices?projectId=${id}&limit=50`),
    enabled: Boolean(id) && !isMember,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${id}`),
    onSuccess: () => {
      success('Project deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      navigate('/projects');
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: ProjectStatus) =>
      api.patch(`/projects/${id}`, { status: newStatus }),
    onSuccess: () => {
      success('Project status updated');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !project) {
    return <ErrorState error={fetchError} onRetry={refetch} title="Project not found" />;
  }

  const invoices = invoicesData?.data || [];
  const currency = activeOrg?.currency || 'USD';
  const isMilestone = project.billingType === 'MILESTONE_BASED';

  return (
    <div className="space-y-8">
      {/* Back and Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>

        {/* Action Toolbar: Strictly Owner Only */}
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={project.status}
              onChange={(e) => updateStatusMutation.mutate(e.target.value as ProjectStatus)}
              disabled={updateStatusMutation.isPending}
              className="bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value="ACTIVE">Status: Active</option>
              <option value="ON_HOLD">Status: On Hold</option>
              <option value="COMPLETED">Status: Completed</option>
              <option value="CANCELLED">Status: Cancelled</option>
            </select>

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Edit2 className="w-4 h-4" />}
              onClick={() => setIsEditModalOpen(true)}
            >
              Edit
            </Button>

            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* 1. Project Overview Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
              <span
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border',
                  isMilestone
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                )}
              >
                {isMilestone ? (
                  <>
                    <Milestone className="w-3.5 h-3.5 text-purple-600" />
                    Milestone-Based
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-blue-600" />
                    One-Time Project
                  </>
                )}
              </span>
            </div>

            {project.client && (
              <p className="text-sm text-slate-500 mt-1.5 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-slate-400" />
                Client:{' '}
                {isOwner ? (
                  <Link
                    to={`/clients/${project.client.id}`}
                    className="text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline font-semibold"
                  >
                    {project.client.name} {project.client.company ? `(${project.client.company})` : ''}
                  </Link>
                ) : (
                  <span className="text-slate-800 font-semibold">
                    {project.client.name} {project.client.company ? `(${project.client.company})` : ''}
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="text-xs text-slate-500">
            Created: <span className="text-slate-900 font-semibold">{formatDate(project.createdAt)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
          <div className="space-y-1">
            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">
              Project Model
            </span>
            <div className="flex items-center gap-2 text-slate-900 text-sm font-semibold">
              {isMilestone ? (
                <>
                  <Milestone className="w-4 h-4 text-purple-600" />
                  <span>Milestone Stages</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-blue-600" />
                  <span>Full One-Time Delivery</span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">
              Project Budget
            </span>
            <div className="flex items-center gap-2 text-slate-900 text-sm font-bold">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>{project.budget ? formatMoney(project.budget, currency) : 'No budget set'}</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">
              Target Deadline
            </span>
            <div className="flex items-center gap-2 text-slate-900 text-sm font-semibold">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>{formatDate(project.deadline) || 'No deadline specified'}</span>
            </div>
          </div>
        </div>

        {project.description && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-700 block mb-1">Scope & Description:</span>
            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{project.description}</p>
          </div>
        )}
      </div>

      {/* 2. Project Documents & Files (PDF & Word files up to 5) */}
      <ProjectFilesSection project={project} />

      {/* 3. Team Members assigned to this project */}
      <ProjectTeamSection project={project} />

      {/* 4. Milestones Section (Only if project is MILESTONE_BASED) */}
      {isMilestone && <ProjectMilestonesSection project={project} />}

      {/* 5. Project Tasks Section */}
      <ProjectTasksSection project={project} />

      {/* 6. Meeting Details (Past and future scheduled meetings) */}
      <ProjectMeetingsSection project={project} />

      {/* 7. Invoices Section (Shown for Owner & Client, Hidden for Member) */}
      {!isMember && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">Invoices Billed to this Project</h2>
            </div>
            {isOwner && (
              <Link to={`/invoices/new?projectId=${project.id}&clientId=${project.clientId}`}>
                <Button variant="secondary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
                  Create Invoice
                </Button>
              </Link>
            )}
          </div>

          {invoices.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No invoices issued for this project yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link
                        to={`/invoices/${inv.id}`}
                        className="font-bold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-slate-600">{formatDate(inv.dueDate)}</TableCell>
                    <TableCell className="font-bold text-slate-900">
                      {formatMoney(inv.total, inv.organization?.currency || currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Edit Modal (Owner only) */}
      {isOwner && (
        <ProjectFormModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          projectToEdit={project}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['project', id] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        />
      )}

      {/* Confirm Delete Dialog (Owner only) */}
      {isOwner && (
        <ConfirmDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={() => deleteMutation.mutate()}
          title="Delete Project?"
          message={`Are you sure you want to delete "${project.name}"? Invoices linked to this project will remain intact.`}
          confirmLabel="Delete Project"
          isDestructive={true}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
};
