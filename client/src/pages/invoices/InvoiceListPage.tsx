import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { Invoice } from '../../types/invoice.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { InvoiceStatusBadge } from '../../components/ui/Badge.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.js';
import { TableSkeleton } from '../../components/ui/Skeleton.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { Pagination } from '../../components/ui/Pagination.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { formatDate, formatMoney, getFriendlyErrorMessage } from '../../lib/utils.js';
import {
  FileText,
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  Download,
  Send,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const InvoiceListPage: React.FC = () => {
  const { currentRole, activeOrg } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(search ? { search } : {}),
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
  });

  const { data, isLoading, isError, error: fetchError, refetch } = useQuery({
    queryKey: ['invoices', { page, limit, search, statusFilter }],
    queryFn: () => api.get<{ data: Invoice[]; pagination: any }>(`/invoices?${queryParams.toString()}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (invoiceId: string) => api.delete(`/invoices/${invoiceId}`),
    onSuccess: () => {
      success('Draft invoice deleted successfully');
      setInvoiceToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const sendMutation = useMutation({
    mutationFn: (invoiceId: string) => api.post(`/invoices/${invoiceId}/send`),
    onSuccess: () => {
      success('Invoice sent to client successfully!');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const handleDownloadPdf = async (invoice: Invoice) => {
    try {
      setDownloadingId(invoice.id);
      await api.downloadPdf(`/invoices/${invoice.id}/pdf`, `invoice-${invoice.number}.pdf`);
      success(`Downloaded invoice ${invoice.number}`);
    } catch (err) {
      error(getFriendlyErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const invoices: Invoice[] = Array.isArray(data) ? data : (data?.data || []);
  const pagination = (data as any)?.pagination || { total: invoices.length, totalPages: 1, page: 1 };
  const currency = activeOrg?.currency || 'USD';

  const statusTabs = currentRole === 'CLIENT'
    ? ['ALL', 'SENT', 'VIEWED', 'PAID', 'OVERDUE']
    : ['ALL', 'DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED'];

  return (
    <div className="space-y-6 pb-10">
      {/* 1. Header Banner - Brand Theme */}
      <div className="rounded-2xl bg-[#070F2B] border border-[#1B1A55] p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
              Invoices
            </h1>
            <p className="text-xs sm:text-sm text-[#9290C3] leading-relaxed">
              Create, send, track status, and export PDF billing documents.
            </p>
          </div>

          {currentRole !== 'CLIENT' && (
            <Link to="/invoices/new">
              <Button
                variant="primary"
                size="md"
                leftIcon={<Plus className="w-4 h-4" />}
                className="bg-[#535C91] hover:bg-[#434b7a] text-white font-bold shadow-md shadow-[#070F2B]/60 px-5 py-2.5 rounded-xl border border-[#535C91]/60 font-heading cursor-pointer"
              >
                Create Invoice
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search by invoice number or client..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            leftAddon={<Search className="w-4 h-4 text-slate-400" />}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
          {statusTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setStatusFilter(tab);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer font-heading ${
                statusFilter === tab
                  ? 'bg-[#070F2B] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab === 'ALL' ? 'All' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div key={statusFilter} className="tab-transition min-h-[380px]">
        {isLoading ? (
          <TableSkeleton rows={5} columns={7} />
        ) : isError ? (
          <ErrorState error={fetchError} onRetry={refetch} />
        ) : invoices.length === 0 ? (
          <div className="w-full rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-md shadow-slate-200/80 p-8 min-h-[360px] flex items-center justify-center">
            <EmptyState
              icon={FileText}
              title="No invoices found"
              description={
                search || statusFilter !== 'ALL'
                  ? 'No invoices matched your filter criteria.'
                  : 'Create your first invoice to bill clients with dynamic line items and automated PDF generation.'
              }
              actionLabel={currentRole !== 'CLIENT' ? 'Create Invoice' : undefined}
              onAction={currentRole !== 'CLIENT' ? () => {} : undefined}
              actionIcon={<Plus className="w-4 h-4" />}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="font-bold text-blue-600 hover:text-blue-700 hover:underline transition"
                    >
                      {inv.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {inv.client ? (
                      <div>
                        {currentRole !== 'CLIENT' ? (
                          <Link
                            to={`/clients/${inv.client.id}`}
                            className="text-xs font-semibold text-slate-800 hover:text-blue-600 underline-offset-2 hover:underline"
                          >
                            {inv.client.name}
                          </Link>
                        ) : (
                          <span className="text-xs font-semibold text-slate-800">{inv.client.name}</span>
                        )}
                        {inv.client.company && (
                          <div className="text-[11px] text-slate-400">{inv.client.company}</div>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell className="text-slate-600">{formatDate(inv.issueDate)}</TableCell>
                  <TableCell className="text-slate-600">{formatDate(inv.dueDate)}</TableCell>
                  <TableCell className="font-bold text-slate-900">
                    {formatMoney(inv.total, currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link to={`/invoices/${inv.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="View invoice"
                          className="p-1.5"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>

                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Download PDF"
                        title="Download PDF"
                        onClick={() => handleDownloadPdf(inv)}
                        isLoading={downloadingId === inv.id}
                        className="p-1.5 text-slate-500 hover:text-slate-900"
                      >
                        <Download className="w-4 h-4" />
                      </Button>

                      {currentRole !== 'CLIENT' && inv.status === 'DRAFT' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Send invoice"
                            title="Send Invoice"
                            onClick={() => sendMutation.mutate(inv.id)}
                            isLoading={sendMutation.isPending}
                            className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Send className="w-4 h-4" />
                          </Button>

                          <Link to={`/invoices/${inv.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Edit draft invoice"
                              className="p-1.5"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          </Link>

                          {currentRole === 'OWNER' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Delete draft invoice"
                              onClick={() => setInvoiceToDelete(inv)}
                              className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            currentPage={page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        </div>
      )}
      </div>

      {/* Confirm Delete Draft Dialog */}
      <ConfirmDialog
        isOpen={Boolean(invoiceToDelete)}
        onClose={() => setInvoiceToDelete(null)}
        onConfirm={() => invoiceToDelete && deleteMutation.mutate(invoiceToDelete.id)}
        title="Delete Draft Invoice?"
        message={`Are you sure you want to permanently delete draft invoice ${invoiceToDelete?.number}?`}
        confirmLabel="Delete Invoice"
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
