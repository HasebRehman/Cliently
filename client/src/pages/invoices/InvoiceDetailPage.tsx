import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { Invoice } from '../../types/invoice.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Modal } from '../../components/ui/Modal.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { InvoiceStatusBadge } from '../../components/ui/Badge.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.js';
import { CardSkeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { formatDate, formatMoney, getFriendlyErrorMessage } from '../../lib/utils.js';
import {
  ArrowLeft,
  Download,
  Send,
  Copy,
  Edit2,
  Trash2,
  XCircle,
  Building,
  Mail,
  AlertCircle,
} from 'lucide-react';

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentRole, activeOrg } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch invoice details
  const {
    data: invoice,
    isLoading,
    isError,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<Invoice>(`/invoices/${id}`),
    enabled: Boolean(id),
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/send`),
    onSuccess: () => {
      success('Invoice sent to client successfully!');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/resend`),
    onSuccess: () => {
      success('Invoice resent to client email!');
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/invoices/${id}/cancel`, { reason }),
    onSuccess: () => {
      success('Invoice has been cancelled');
      setIsCancelModalOpen(false);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.post<Invoice>(`/invoices/${id}/duplicate`),
    onSuccess: (newInvoice) => {
      success(`Duplicated as new draft ${newInvoice.number}`);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate(`/invoices/${newInvoice.id}`);
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/invoices/${id}`),
    onSuccess: () => {
      success('Draft invoice deleted');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/invoices');
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    try {
      setIsDownloading(true);
      await api.downloadPdf(`/invoices/${invoice.id}/pdf`, `invoice-${invoice.number}.pdf`);
      success(`Downloaded invoice ${invoice.number}`);
    } catch (err) {
      error(getFriendlyErrorMessage(err));
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !invoice) {
    return <ErrorState error={fetchError} onRetry={refetch} title="Invoice not found" />;
  }

  const currency = invoice.organization?.currency || activeOrg?.currency || 'USD';
  const isDraft = invoice.status === 'DRAFT';
  const canSend = isDraft && currentRole !== 'CLIENT';
  const canResend = (invoice.status === 'SENT' || invoice.status === 'VIEWED' || invoice.status === 'OVERDUE') && currentRole !== 'CLIENT';
  const canCancel = (invoice.status === 'SENT' || invoice.status === 'VIEWED' || invoice.status === 'OVERDUE') && currentRole === 'OWNER';
  const canEdit = isDraft && currentRole !== 'CLIENT';
  const canDelete = isDraft && currentRole === 'OWNER';
  const canDuplicate = currentRole !== 'CLIENT';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Action Toolbar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          to="/invoices"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Invoices
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={handleDownloadPdf}
            isLoading={isDownloading}
          >
            Download PDF
          </Button>

          {canDuplicate && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Copy className="w-4 h-4" />}
              onClick={() => duplicateMutation.mutate()}
              isLoading={duplicateMutation.isPending}
            >
              Duplicate
            </Button>
          )}

          {canEdit && (
            <Link to={`/invoices/${invoice.id}/edit`}>
              <Button variant="secondary" size="sm" leftIcon={<Edit2 className="w-4 h-4" />}>
                Edit Draft
              </Button>
            </Link>
          )}

          {canSend && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Send className="w-4 h-4" />}
              onClick={() => sendMutation.mutate()}
              isLoading={sendMutation.isPending}
            >
              Send Invoice
            </Button>
          )}

          {canResend && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Send className="w-4 h-4" />}
              onClick={() => resendMutation.mutate()}
              isLoading={resendMutation.isPending}
            >
              Resend Email
            </Button>
          )}

          {canCancel && (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<XCircle className="w-4 h-4" />}
              onClick={() => setIsCancelModalOpen(true)}
            >
              Cancel Invoice
            </Button>
          )}

          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              Delete Draft
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Document Canvas */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm space-y-8">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-8 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                {invoice.number}
              </h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="text-xs text-slate-500">
              Organization: <strong className="text-slate-800 font-bold">{invoice.organization?.name || activeOrg?.name}</strong>
            </p>
          </div>

          <div className="sm:text-right space-y-1 text-xs text-slate-500">
            <div>
              <span className="text-slate-400">Issue Date:</span>{' '}
              <strong className="text-slate-800 font-semibold">{formatDate(invoice.issueDate)}</strong>
            </div>
            <div>
              <span className="text-slate-400">Payment Due:</span>{' '}
              <strong className="text-slate-800 font-semibold">{formatDate(invoice.dueDate)}</strong>
            </div>
            {invoice.paidAt && (
              <div className="text-emerald-600 font-bold">
                Paid on: {formatDate(invoice.paidAt)}
              </div>
            )}
            {invoice.cancelledAt && (
              <div className="text-rose-600 font-bold">
                Cancelled on: {formatDate(invoice.cancelledAt)}
              </div>
            )}
          </div>
        </div>

        {/* Bill To & Project Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs">
          <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-slate-500 font-bold uppercase tracking-wider block">Billed To</span>
            {invoice.client ? (
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">{invoice.client.name}</p>
                {invoice.client.company && (
                  <p className="text-slate-700 flex items-center gap-1.5 font-medium">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    {invoice.client.company}
                  </p>
                )}
                <p className="text-slate-500 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {invoice.client.email}
                </p>
                {invoice.client.address && (
                  <p className="text-slate-600 mt-1 whitespace-pre-wrap">{invoice.client.address}</p>
                )}
              </div>
            ) : (
              <p className="text-slate-500">Client details not available</p>
            )}
          </div>

          {invoice.project && (
            <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-slate-500 font-bold uppercase tracking-wider block">Project Reference</span>
              <p className="text-sm font-bold text-slate-900">{invoice.project.name}</p>
              <Link
                to={`/projects/${invoice.project.id}`}
                className="text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline inline-block mt-1 font-semibold"
              >
                View Project Details &rarr;
              </Link>
            </div>
          )}
        </div>

        {/* Line Items Table */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">Invoice Items</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item, idx) => (
                <TableRow key={item.id || idx}>
                  <TableCell className="font-semibold text-slate-800">{item.description}</TableCell>
                  <TableCell className="text-center text-slate-600">{Number(item.qty)}</TableCell>
                  <TableCell className="text-right text-slate-600">{formatMoney(item.rate, currency)}</TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    {formatMoney(item.amount, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals Breakdown */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-8 pt-4">
          <div className="space-y-4 flex-1 text-xs">
            {invoice.notes && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-700 block">Notes:</span>
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            {invoice.terms && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-700 block">Terms & Payment Instructions:</span>
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{invoice.terms}</p>
              </div>
            )}

            {invoice.cancelReason && (
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-1 text-rose-800">
                <span className="font-bold text-rose-700 block flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Cancellation Reason:
                </span>
                <p className="leading-relaxed whitespace-pre-wrap">{invoice.cancelReason}</p>
              </div>
            )}
          </div>

          <div className="w-full sm:w-72 bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-bold text-slate-800">{formatMoney(invoice.subtotal, currency)}</span>
            </div>

            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Discount:</span>
                <span>-{formatMoney(invoice.discount, currency)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>Tax ({Number(invoice.taxRate)}%):</span>
              <span className="font-bold text-slate-800">{formatMoney(invoice.tax, currency)}</span>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
              <span>Grand Total:</span>
              <span className="text-lg text-blue-600 font-black">{formatMoney(invoice.total, currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Invoice Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Invoice"
        description="Provide a mandatory reason for cancelling this issued invoice."
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Reason for Cancellation"
            required
            placeholder="e.g. Scope revised, replaced by invoice INV-0002"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              variant="secondary"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={cancelMutation.isPending}
            >
              Dismiss
            </Button>
            <Button
              variant="danger"
              onClick={() => cancelMutation.mutate(cancelReason)}
              disabled={!cancelReason.trim()}
              isLoading={cancelMutation.isPending}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Draft Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Draft Invoice?"
        message={`Are you sure you want to permanently delete draft ${invoice.number}?`}
        confirmLabel="Delete Invoice"
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
