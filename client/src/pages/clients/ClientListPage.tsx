import React, { useState, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { Client } from '../../types/client.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Button } from '../../components/ui/Button.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { Pagination } from '../../components/ui/Pagination.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { ClientFormModal } from './ClientFormModal.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';
import {
  Users,
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  Mail,
  MailCheck,
  Building2,
  FolderKanban,
  UserCheck,
  Clock,
  Loader2,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';

export const ClientListPage: React.FC = () => {
  const { currentRole } = useAuth();

  if (currentRole !== 'OWNER') {
    return <Navigate to="/dashboard" replace />;
  }

  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [invitingClientId, setInvitingClientId] = useState<string | null>(null);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(deferredSearch ? { search: deferredSearch } : {}),
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
  });

  const { data, isLoading, isFetching, isError, error: fetchError, refetch } = useQuery({
    queryKey: ['clients', { page, limit, search: deferredSearch, statusFilter }],
    queryFn: () => api.get<{ data: Client[]; pagination: any }>(`/clients?${queryParams.toString()}`),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (clientId: string) => api.delete<{ success: boolean; action: string; message: string }>(`/clients/${clientId}`),
    onSuccess: (res: any) => {
      if (res?.action === 'ARCHIVED') {
        success('Client archived successfully and moved to Archived list');
      } else {
        success('Client permanently deleted');
      }
      setClientToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const portalInviteMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string; email: string }) =>
      api.post(`/clients/${id}/portal-invite`),
    onMutate: (variables) => {
      setInvitingClientId(variables.id);
    },
    onSuccess: (_, variables) => {
      success(`Portal invite sent exclusively to ${variables.name} (${variables.email})`);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
    onSettled: () => {
      setInvitingClientId(null);
    },
  });

  const handleOpenCreate = () => {
    setClientToEdit(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setClientToEdit(client);
    setIsFormModalOpen(true);
  };

  const clients: Client[] = Array.isArray(data) ? data : (data?.data || []);
  const pagination = (data as any)?.pagination || { total: clients.length, totalPages: 1, page: 1 };

  return (
    <div className="space-y-6 pb-10">
      {/* 1. Header Banner - Brand Theme */}
      <div className="rounded-2xl bg-[#070F2B] border border-[#1B1A55] p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
              Clients
            </h1>
            <p className="text-xs sm:text-sm text-[#9290C3] leading-relaxed">
              View, manage, and organize all your clients and their portal accounts in one place.
            </p>
          </div>

          {currentRole === 'OWNER' && (
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={handleOpenCreate}
                leftIcon={<Plus className="w-4 h-4" />}
                className="bg-[#535C91] hover:bg-[#434b7a] text-white font-bold shadow-md shadow-[#070F2B]/60 px-5 py-2.5 rounded-xl border border-[#535C91]/60 font-heading cursor-pointer"
              >
                Add Client
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-9 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition-all font-medium"
          />
          {isFetching && !isLoading && (
            <Loader2 className="w-3.5 h-3.5 text-[#535C91] absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin" />
          )}
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {[
            { key: 'ALL', label: 'All Clients' },
            { key: 'ACTIVE', label: 'Active' },
            { key: 'ARCHIVED', label: 'Archived' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer font-heading ${
                statusFilter === tab.key
                  ? 'bg-[#070F2B] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Clients Table - Clean White Surface */}
      {isError ? (
        <ErrorState error={fetchError} onRetry={refetch} />
      ) : (
        <div key={statusFilter} className="tab-transition space-y-4">
          <div className="w-full rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-md shadow-slate-200/80 min-h-[380px]">
            <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar max-h-[500px]">
              <table className="w-full min-w-[850px] table-fixed text-left border-collapse">
                <thead className="bg-[#070F2B] border-b border-[#1B1A55] sticky top-0 z-10 shadow-xs">
                  <tr className="text-[11px] font-bold text-slate-100 uppercase tracking-wider font-heading">
                    <th className="w-[28%] px-5 py-4">Client</th>
                    <th className="w-[18%] px-4 py-4">Company</th>
                    <th className="w-[12%] px-4 py-4">Status</th>
                    <th className="w-[14%] px-4 py-4">Portal Access</th>
                    <th className="w-[13%] px-4 py-4">Projects</th>
                    <th className="w-[15%] px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {isLoading && !data ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-200 shrink-0" />
                            <div className="space-y-1.5 flex-1">
                              <div className="h-3.5 bg-slate-200 rounded w-28" />
                              <div className="h-2.5 bg-slate-100 rounded w-36" />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-3.5 bg-slate-200 rounded w-24" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-5 bg-slate-100 rounded-full w-16" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-5 bg-slate-100 rounded-full w-20" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-3.5 bg-slate-200 rounded w-16" />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="h-7 bg-slate-100 rounded-lg w-20 ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : clients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                            <Users className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800">
                              {statusFilter === 'ARCHIVED'
                                ? 'No archived clients'
                                : statusFilter === 'ACTIVE'
                                ? 'No active clients'
                                : 'No clients found'}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {search
                                ? `No clients matched "${search}". Try checking for spelling errors or adjusting filters.`
                                : statusFilter === 'ARCHIVED'
                                ? 'Clients that you archive will be stored here.'
                                : 'Add your first client to start creating projects, billing, and collaborating.'}
                            </p>
                          </div>
                          {statusFilter !== 'ARCHIVED' && currentRole === 'OWNER' && !search && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleOpenCreate}
                              leftIcon={<Plus className="w-4 h-4 text-blue-600" />}
                              className="mt-2 font-bold cursor-pointer"
                            >
                              Add Client
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    clients.map((client) => {
                    const isJoined = Boolean(
                      client.userId || client.hasPortalAccess || client.portalStatus === 'ACTIVE'
                    );
                    const isInvited = client.portalStatus === 'INVITED';
                    const projectsCount =
                      (client._count?.projects ?? (client as any).projectsCount) || 0;

                    const initials = client.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();

                    return (
                      <tr
                        key={client.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        {/* Client Name + Avatar */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <Link
                                to={`/clients/${client.id}`}
                                className="font-bold text-slate-900 hover:text-blue-600 transition-colors block truncate max-w-[200px]"
                              >
                                {client.name}
                              </Link>
                              <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                                {client.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Company */}
                        <td className="px-4 py-4 text-slate-600">
                          {client.company ? (
                            <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[160px]">{client.company}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          {client.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                              ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              ARCHIVED
                            </span>
                          )}
                        </td>

                        {/* Portal Access */}
                        <td className="px-4 py-4">
                          {isJoined ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <UserCheck className="w-3 h-3 text-blue-600" />
                              JOINED
                            </span>
                          ) : isInvited ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                              <Clock className="w-3 h-3 text-orange-600" />
                              INVITED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                              NO ACCESS
                            </span>
                          )}
                        </td>

                        {/* Linked Projects */}
                        <td className="px-4 py-4 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <FolderKanban className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-800">
                              {projectsCount} {projectsCount === 1 ? 'project' : 'projects'}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* View Details */}
                            <Link to={`/clients/${client.id}`}>
                              <button
                                type="button"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View client details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </Link>

                            {currentRole === 'OWNER' && (
                              <>
                                {/* Portal Invite Button */}
                                {isJoined ? (
                                  <button
                                    type="button"
                                    disabled
                                    title={`Portal Active: ${client.name} has already joined the portal`}
                                    className="p-1.5 rounded-lg text-emerald-600 bg-emerald-50/60 cursor-not-allowed border border-emerald-200/50 transition-colors"
                                  >
                                    <MailCheck className="w-4 h-4 text-emerald-600" />
                                  </button>
                                ) : (
                                  (() => {
                                    const canSend =
                                      client.canSendInvite !== false &&
                                      (!client.lastInviteSentAt ||
                                        Date.now() - new Date(client.lastInviteSentAt).getTime() >=
                                          24 * 60 * 60 * 1000);

                                    return (
                                      <button
                                        type="button"
                                        disabled={
                                          !canSend ||
                                          (invitingClientId !== null && invitingClientId !== client.id)
                                        }
                                        onClick={() => {
                                          if (canSend) {
                                            portalInviteMutation.mutate({
                                              id: client.id,
                                              name: client.name,
                                              email: client.email,
                                            });
                                          }
                                        }}
                                        title={
                                          !canSend
                                            ? `Invitation already sent today to ${client.email} (Limit: 1 invitation per day)`
                                            : isInvited
                                            ? `Resend portal invitation to ${client.email}`
                                            : `Send portal invitation to ${client.email}`
                                        }
                                        className={`p-1.5 rounded-lg transition-colors ${
                                          !canSend
                                            ? 'text-blue-300 bg-blue-50/30 cursor-not-allowed opacity-60'
                                            : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                                        }`}
                                      >
                                        {invitingClientId === client.id ? (
                                          <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" />
                                        ) : (
                                          <Mail className="w-4 h-4" />
                                        )}
                                      </button>
                                    );
                                  })()
                                )}

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(client)}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                                  title="Edit client"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>

                                {/* Delete / Archive Button - Distinct Red Color */}
                                <button
                                  type="button"
                                  onClick={() => setClientToDelete(client)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title={
                                    client.status === 'ARCHIVED'
                                      ? 'Permanently delete client'
                                      : 'Archive client (moves to Archived)'
                                  }
                                >
                                  <Trash2 className="w-4 h-4 text-rose-500" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Component */}
          {pagination.totalPages > 1 && (
            <div className="pt-2 flex justify-end">
              <Pagination
                currentPage={page}
                totalPages={pagination.totalPages}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </div>
      )}

      {/* Form Modal (Create / Edit) */}
      <ClientFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setClientToEdit(null);
        }}
        onSuccess={() => {
          setIsFormModalOpen(false);
          setClientToEdit(null);
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        }}
        clientToEdit={clientToEdit}
      />

      {/* Delete / Archive Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(clientToDelete)}
        onClose={() => setClientToDelete(null)}
        onConfirm={() => clientToDelete && deleteMutation.mutate(clientToDelete.id)}
        title={
          clientToDelete?.status === 'ARCHIVED'
            ? 'Permanently Delete Client'
            : 'Archive Client'
        }
        description={
          clientToDelete?.status === 'ARCHIVED'
            ? 'Warning: This action is permanent and irreversible.'
            : 'Move client to the Archived clients list.'
        }
        message={
          clientToDelete?.status === 'ARCHIVED'
            ? `Are you sure you want to permanently delete "${clientToDelete?.name}"? This action cannot be undone and will completely remove the client from the database.`
            : `Are you sure you want to archive "${clientToDelete?.name}"? This client will be moved from the Active list to the Archived list.`
        }
        confirmLabel={
          clientToDelete?.status === 'ARCHIVED'
            ? 'Delete Permanently'
            : 'Archive Client'
        }
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
