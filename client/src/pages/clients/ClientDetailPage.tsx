import React, { useState } from 'react';
import { useParams, Link, useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { Client } from '../../types/client.js';
import { Project } from '../../types/project.js';
import { Invoice } from '../../types/invoice.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Button } from '../../components/ui/Button.js';
import { InvoiceStatusBadge, ProjectStatusBadge } from '../../components/ui/Badge.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.js';
import { CardSkeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { ClientFormModal } from './ClientFormModal.js';
import { formatDate, formatMoney, getFriendlyErrorMessage } from '../../lib/utils.js';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building,
  Edit2,
  Trash2,
  MailCheck,
  FolderKanban,
  FileText,
  Plus,
  StickyNote,
  Send,
} from 'lucide-react';

export const ClientDetailPage: React.FC = () => {
  const { currentRole, activeOrg } = useAuth();

  if (currentRole !== 'OWNER') {
    return <Navigate to="/dashboard" replace />;
  }

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch client details
  const {
    data: client,
    isLoading,
    isError,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<Client>(`/clients/${id}`),
    enabled: Boolean(id),
  });

  // Fetch client projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects', { clientId: id }],
    queryFn: () => api.get<{ data: Project[] }>(`/projects?clientId=${id}&limit=50`),
    enabled: Boolean(id),
  });

  // Fetch client invoices
  const { data: invoicesData } = useQuery({
    queryKey: ['invoices', { clientId: id }],
    queryFn: () => api.get<{ data: Invoice[] }>(`/invoices?clientId=${id}&limit=50`),
    enabled: Boolean(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/clients/${id}`),
    onSuccess: () => {
      success('Client archived / removed successfully');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      navigate('/clients');
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const portalInviteMutation = useMutation({
    mutationFn: () => api.post(`/clients/${id}/portal-invite`),
    onSuccess: () => {
      success(`Client portal invitation sent to ${client?.name || 'client'} (${client?.email || ''})`);
      queryClient.invalidateQueries({ queryKey: ['client', id] });
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

  if (isError || !client) {
    return <ErrorState error={fetchError} onRetry={refetch} title="Client not found" />;
  }

  const projects = projectsData?.data || client.projects || [];
  const invoices = invoicesData?.data || [];
  const currency = activeOrg?.currency || 'USD';
  const isJoined = Boolean(
    client.userId || client.hasPortalAccess || client.portalUser || client.portalStatus === 'ACTIVE'
  );

  const totalBilled = invoices.reduce((acc, inv) => acc + (Number(inv.total) || 0), 0);

  const initials = client.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Top Navigation & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          to="/clients"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600" />
          <span>Back to Clients</span>
        </Link>

        {currentRole === 'OWNER' && (
          <div className="flex flex-wrap items-center gap-2.5">
            {isJoined ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                <MailCheck className="w-4 h-4 text-emerald-600" />
                <span>Portal Active</span>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Send className="w-4 h-4 text-blue-600" />}
                onClick={() => portalInviteMutation.mutate()}
                isLoading={portalInviteMutation.isPending}
                className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 font-bold cursor-pointer"
              >
                Invite to Portal
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Edit2 className="w-4 h-4 text-blue-600" />}
              onClick={() => setIsEditModalOpen(true)}
              className="cursor-pointer font-bold"
            >
              Edit Status
            </Button>

            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setIsDeleteDialogOpen(true)}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20 cursor-pointer"
            >
              {client.status === 'ARCHIVED' ? 'Delete Permanently' : 'Archive Client'}
            </Button>
          </div>
        )}
      </div>

      {/* 2. Client Profile Hero Banner (Brand Theme) */}
      <div className="rounded-2xl bg-[#070F2B] border border-[#1B1A55] text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#535C91]/15 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-[#1B1A55]/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Client Identity */}
          <div className="flex items-start sm:items-center gap-5">
            <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-br from-[#1B1A55] to-[#535C91] text-white font-black text-2xl sm:text-3xl flex items-center justify-center shrink-0 shadow-lg shadow-[#070F2B]/60 border border-[#535C91]/50 font-heading">
              {initials}
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
                {client.name}
              </h1>

              {client.company ? (
                <p className="text-sm text-[#9290C3] flex items-center gap-2 font-medium">
                  <Building className="w-4 h-4 text-[#9290C3] shrink-0" />
                  <span>{client.company}</span>
                </p>
              ) : (
                <p className="text-xs text-[#9290C3]">Individual Billing Account</p>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 bg-[#1B1A55]/70 border border-[#535C91]/40 rounded-xl p-3.5 sm:p-4 backdrop-blur-sm shadow-inner">
            <div className="text-center px-2 sm:px-4 border-r border-[#535C91]/40">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#9290C3] block font-heading">
                Projects
              </span>
              <span className="text-lg sm:text-xl font-black text-white mt-0.5 block font-heading">
                {projects.length}
              </span>
            </div>
            <div className="text-center px-2 sm:px-4 border-r border-slate-700/60">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Invoices
              </span>
              <span className="text-lg sm:text-xl font-black text-white mt-0.5 block">
                {invoices.length}
              </span>
            </div>
            <div className="text-center px-2 sm:px-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Total Billed
              </span>
              <span className="text-lg sm:text-xl font-black text-orange-400 mt-0.5 block">
                {formatMoney(totalBilled, currency)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Contact & Billing Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Email Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-md shadow-slate-200/80 hover:shadow-lg hover:shadow-slate-300/70 hover:border-slate-300 transition-all duration-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Contact Email
              </span>
              <a
                href={`mailto:${client.email}`}
                className="text-sm font-bold text-slate-900 hover:text-blue-600 transition truncate block max-w-[200px]"
                title={client.email}
              >
                {client.email}
              </a>
            </div>
          </div>
        </div>

        {/* Phone Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-md shadow-slate-200/80 hover:shadow-lg hover:shadow-slate-300/70 hover:border-slate-300 transition-all duration-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Phone Number
              </span>
              <span className="text-sm font-bold text-slate-900 block">
                {client.phone || 'Not provided'}
              </span>
            </div>
          </div>
        </div>

        {/* Address Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-md shadow-slate-200/80 hover:shadow-lg hover:shadow-slate-300/70 hover:border-slate-300 transition-all duration-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Billing Address
              </span>
              <span className="text-sm font-bold text-slate-900 block truncate max-w-[200px]" title={client.address || ''}>
                {client.address || 'Not provided'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Internal Notes (if any) */}
      {client.notes && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-md shadow-slate-200/80 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <StickyNote className="w-4 h-4 text-orange-600" />
            <span>Internal Client Notes</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-4 whitespace-pre-wrap">
            {client.notes}
          </p>
        </div>
      )}

      {/* 4. Associated Projects Section */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-md shadow-slate-200/80 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Associated Projects</h2>
              <p className="text-xs text-slate-500">Projects linked directly to {client.name}</p>
            </div>
          </div>
          <Link to="/projects">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4 text-blue-600" />}
              className="cursor-pointer font-bold shadow-sm"
            >
              Add Project
            </Button>
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <FolderKanban className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No projects associated yet</p>
            <p className="text-xs text-slate-400">Create a new project and assign it to this client.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Created Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((proj: any) => (
                <TableRow key={proj.id}>
                  <TableCell>
                    <Link
                      to={`/projects/${proj.id}`}
                      className="font-bold text-slate-900 hover:text-blue-600 transition flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      <span>{proj.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={proj.status} />
                  </TableCell>
                  <TableCell className="font-bold text-slate-800">
                    {proj.budget ? formatMoney(proj.budget, currency) : '—'}
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs">{formatDate(proj.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 5. Associated Invoices Section */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-md shadow-slate-200/80 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Billing & Invoices</h2>
              <p className="text-xs text-slate-500">Invoices issued to {client.name}</p>
            </div>
          </div>
          <Link to="/invoices/new">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4 text-orange-600" />}
              className="cursor-pointer font-bold shadow-sm"
            >
              Create Invoice
            </Button>
          </Link>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No invoices issued yet</p>
            <p className="text-xs text-slate-400">Issue an invoice to request payments from this client.</p>
          </div>
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
                      className="font-bold text-slate-900 hover:text-blue-600 transition flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                      <span>{inv.number}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs">{formatDate(inv.dueDate)}</TableCell>
                  <TableCell className="font-black text-slate-900">
                    {formatMoney(inv.total, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Edit Modal */}
      <ClientFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        clientToEdit={client}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['client', id] });
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        }}
      />

      {/* Confirm Archive / Delete Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title={
          client.status === 'ARCHIVED'
            ? 'Permanently Delete Client'
            : 'Archive Client'
        }
        description={
          client.status === 'ARCHIVED'
            ? 'Warning: This action is permanent and irreversible.'
            : 'Move client to the Archived clients list.'
        }
        message={
          client.status === 'ARCHIVED'
            ? `Are you sure you want to permanently delete "${client.name}"? This action cannot be undone and will completely remove the client record.`
            : `Are you sure you want to archive "${client.name}"? This client will be moved to the Archived list.`
        }
        confirmLabel={
          client.status === 'ARCHIVED'
            ? 'Delete Permanently'
            : 'Archive Client'
        }
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default ClientDetailPage;
