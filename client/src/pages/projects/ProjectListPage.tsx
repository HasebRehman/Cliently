import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { Project } from '../../types/project.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Button } from '../../components/ui/Button.js';
import { ProjectStatusBadge } from '../../components/ui/Badge.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { Pagination } from '../../components/ui/Pagination.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { ProjectFormModal } from './ProjectFormModal.js';
import { formatDate, formatMoney, getFriendlyErrorMessage } from '../../lib/utils.js';
import { FolderKanban, Plus, Search, Eye, Edit2, Trash2, Zap, Milestone } from 'lucide-react';
import { Link } from 'react-router-dom';

export const ProjectListPage: React.FC = () => {
  const { currentRole, activeOrg } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(search ? { search } : {}),
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
  });

  const { data, isLoading, isError, error: fetchError, refetch } = useQuery({
    queryKey: ['projects', { page, limit, search, statusFilter }],
    queryFn: () => api.get<{ data: Project[]; pagination: any }>(`/projects?${queryParams.toString()}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => api.delete(`/projects/${projectId}`),
    onSuccess: () => {
      success('Project removed successfully');
      setProjectToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const handleOpenCreate = () => {
    setProjectToEdit(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (project: Project) => {
    setProjectToEdit(project);
    setIsFormModalOpen(true);
  };

  const projects: Project[] = Array.isArray(data) ? data : (data?.data || []);
  const pagination = (data as any)?.pagination || { total: projects.length, totalPages: 1, page: 1 };
  const currency = activeOrg?.currency || 'USD';
  const isOwner = currentRole === 'OWNER';

  const statusTabs = ['ALL', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

  return (
    <div className="space-y-6">
      {/* 1. Header Banner - Brand Theme */}
      <div className="rounded-2xl bg-[#070F2B] border border-[#1B1A55] p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
              Projects
            </h1>
            <p className="text-xs sm:text-sm text-[#9290C3] font-normal leading-relaxed">
              Track customer projects, milestones, budgets, and deadlines.
            </p>
          </div>

          {isOwner && (
            <Button
              variant="primary"
              size="md"
              onClick={handleOpenCreate}
              leftIcon={<Plus className="w-4 h-4" />}
              className="bg-[#535C91] hover:bg-[#434b7a] text-white font-bold shadow-md shadow-[#070F2B]/60 shrink-0 cursor-pointer font-heading border border-[#535C91]/60"
            >
              Create Project
            </Button>
          )}
        </div>
      </div>

      {/* 2. Search and Status Tabs Toolbar (OWNER only) */}
      {isOwner && (
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-2 bg-slate-50 border border-slate-200/80 rounded-2xl">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search projects by name or client..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#535C91]/20 focus:border-[#535C91] transition-all shadow-sm"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 bg-slate-200/50 rounded-xl">
            {statusTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setStatusFilter(tab);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer font-heading ${
                  statusFilter === tab
                    ? 'bg-[#070F2B] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                {tab === 'ALL' ? 'All Projects' : tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Main Projects Table */}
      {isError ? (
        <ErrorState error={fetchError} onRetry={refetch} />
      ) : (
        <div key={statusFilter} className="tab-transition space-y-4">
          <div className="w-full rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-md shadow-slate-200/80 min-h-[380px]">
            <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar max-h-[500px]">
              <table className="w-full min-w-[900px] table-fixed text-left border-collapse">
                <thead className="bg-[#070F2B] border-b border-[#1B1A55] sticky top-0 z-10 shadow-xs">
                  <tr className="text-[11px] font-bold text-slate-100 uppercase tracking-wider font-heading">
                    <th className="w-[26%] px-5 py-4">Project Name</th>
                    <th className="w-[18%] px-4 py-4">Client</th>
                    <th className="w-[13%] px-4 py-4">Status</th>
                    <th className="w-[14%] px-4 py-4">Billing Type</th>
                    <th className="w-[11%] px-4 py-4">Budget</th>
                    <th className="w-[10%] px-4 py-4">Deadline</th>
                    <th className="w-[8%] px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={`proj-skel-${idx}`} className="animate-pulse">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-200 shrink-0" />
                            <div className="h-4 bg-slate-200 rounded w-32" />
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-3.5 bg-slate-200 rounded w-24" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-5 bg-slate-100 rounded-full w-20" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-5 bg-slate-100 rounded-md w-24" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-3.5 bg-slate-200 rounded w-16" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-3.5 bg-slate-200 rounded w-20" />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="h-7 bg-slate-100 rounded-lg w-10 ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : projects.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                            <FolderKanban className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800">
                              No projects found
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {search || statusFilter !== 'ALL'
                                ? 'No projects matched your active filters.'
                                : 'No projects have been assigned yet.'}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    projects.map((proj) => (
                      <tr key={proj.id} className="hover:bg-slate-50/80 transition-colors group">
                        {/* Project Name */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 font-bold flex items-center justify-center shrink-0 shadow-sm">
                              <FolderKanban className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="min-w-0">
                              <Link
                                to={`/projects/${proj.id}`}
                                className="font-bold text-slate-900 hover:text-blue-600 transition-colors block truncate max-w-[210px]"
                              >
                                {proj.name}
                              </Link>
                              {proj.description && (
                                <p className="text-[11px] text-slate-400 truncate max-w-[210px]">
                                  {proj.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Client */}
                        <td className="px-4 py-4 text-slate-600">
                          {proj.client ? (
                            isOwner ? (
                              <Link
                                to={`/clients/${proj.client.id}`}
                                className="font-semibold text-slate-700 hover:text-blue-600 transition-colors truncate block max-w-[150px]"
                              >
                                {proj.client.name}
                              </Link>
                            ) : (
                              <span className="font-semibold text-slate-700 truncate block max-w-[150px]">
                                {proj.client.name}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <ProjectStatusBadge status={proj.status} />
                        </td>

                        {/* Billing Type */}
                        <td className="px-4 py-4">
                          {proj.billingType === 'MILESTONE_BASED' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                              <Milestone className="w-3 h-3 text-purple-600" />
                              Milestone-Based
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              <Zap className="w-3 h-3 text-blue-600" />
                              One-Time
                            </span>
                          )}
                        </td>

                        {/* Budget */}
                        <td className="px-4 py-4 font-bold text-slate-800">
                          {proj.budget ? formatMoney(proj.budget, currency) : '—'}
                        </td>

                        {/* Deadline */}
                        <td className="px-4 py-4 text-slate-600">
                          {formatDate(proj.deadline)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link to={`/projects/${proj.id}`}>
                              <button
                                type="button"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="View project details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </Link>

                            {/* Edit and Delete visible to OWNER only */}
                            {isOwner && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(proj)}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Edit project"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setProjectToDelete(proj)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete project"
                                >
                                  <Trash2 className="w-4 h-4 text-rose-500" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            currentPage={page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Form Modal */}
      <ProjectFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        projectToEdit={projectToEdit}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          queryClient.invalidateQueries({ queryKey: ['project'] });
          queryClient.invalidateQueries({ queryKey: ['clients'] });
          queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
        }}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(projectToDelete)}
        onClose={() => setProjectToDelete(null)}
        onConfirm={() => projectToDelete && deleteMutation.mutate(projectToDelete.id)}
        title="Delete Project?"
        message={`Are you sure you want to permanently delete "${projectToDelete?.name}"?`}
        confirmLabel="Delete Project"
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
