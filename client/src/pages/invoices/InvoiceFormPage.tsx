import React, { useEffect, useMemo } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Input } from '../../components/ui/Input.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { Select } from '../../components/ui/Select.js';
import { Button } from '../../components/ui/Button.js';
import { Invoice } from '../../types/invoice.js';
import { Client } from '../../types/client.js';
import { Project } from '../../types/project.js';
import { OrgSettings } from '../../types/member.js';
import { calculateLiveInvoiceTotals } from '../../lib/invoiceCalculator.js';
import { formatMoney, getFriendlyErrorMessage } from '../../lib/utils.js';
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Calculator,
} from 'lucide-react';

const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Item description is required').max(255).trim(),
  qty: z.coerce.number().positive('Qty must be > 0').max(1000000),
  rate: z.coerce.number().min(0, 'Rate cannot be negative').max(1000000000),
});

const invoiceFormSchema = z
  .object({
    clientId: z.string().min(1, 'Client is required'),
    projectId: z.string().optional().nullable(),
    issueDate: z.string().min(1, 'Issue date is required'),
    dueDate: z.string().min(1, 'Due date is required'),
    items: z.array(invoiceItemSchema).min(1, 'At least one line item is required').max(100),
    discount: z.coerce.number().min(0, 'Discount cannot be negative').default(0).optional().nullable(),
    notes: z.string().max(2000).trim().optional().nullable(),
    terms: z.string().max(2000).trim().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.issueDate && data.dueDate) {
        return new Date(data.dueDate) >= new Date(data.issueDate);
      }
      return true;
    },
    {
      message: 'Due date must be on or after issue date',
      path: ['dueDate'],
    }
  );

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

export const InvoiceFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrg } = useAuth();
  const { success, error } = useToast();

  const defaultClientId = searchParams.get('clientId') || '';
  const defaultProjectId = searchParams.get('projectId') || '';

  // Fetch current org for tax rate & currency
  const { data: orgSettings } = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: () => api.get<OrgSettings>('/organizations/current'),
  });

  // Fetch invoice details if editing
  const { data: existingInvoice, isLoading: isLoadingInvoice } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<Invoice>(`/invoices/${id}`),
    enabled: isEditing,
  });

  // Fetch clients for selector
  const { data: clientsData } = useQuery({
    queryKey: ['clients', { limit: 100 }],
    queryFn: () => api.get<{ data: Client[] }>('/clients?limit=100'),
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const due30Str = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      clientId: defaultClientId,
      projectId: defaultProjectId || null,
      issueDate: todayStr,
      dueDate: due30Str,
      items: [{ description: '', qty: 1, rate: 0 }],
      discount: 0,
      notes: '',
      terms: 'Payment due within 30 days of issue date.',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedClientId = watch('clientId');

  // Fetch projects filtered by selected client
  const { data: clientProjectsData } = useQuery({
    queryKey: ['projects', { clientId: watchedClientId }],
    queryFn: () => api.get<{ data: Project[] }>(`/projects?clientId=${watchedClientId}&limit=100`),
    enabled: Boolean(watchedClientId),
  });

  useEffect(() => {
    if (existingInvoice) {
      reset({
        clientId: existingInvoice.clientId,
        projectId: existingInvoice.projectId || null,
        issueDate: existingInvoice.issueDate ? existingInvoice.issueDate.split('T')[0] : todayStr,
        dueDate: existingInvoice.dueDate ? existingInvoice.dueDate.split('T')[0] : due30Str,
        items: existingInvoice.items.map((it) => ({
          description: it.description,
          qty: Number(it.qty),
          rate: Number(it.rate),
        })),
        discount: existingInvoice.discount ? Number(existingInvoice.discount) : 0,
        notes: existingInvoice.notes || '',
        terms: existingInvoice.terms || '',
      });
    }
  }, [existingInvoice, reset, todayStr, due30Str]);

  // Live Decimal.js Estimation calculation
  const watchedItems = useWatch({ control, name: 'items' }) || [];
  const watchedDiscount = useWatch({ control, name: 'discount' });
  const taxRate = orgSettings?.defaultTaxRate !== undefined ? orgSettings.defaultTaxRate : (activeOrg ? 0 : 0);

  const liveTotals = useMemo(() => {
    return calculateLiveInvoiceTotals({
      items: watchedItems,
      discount: watchedDiscount,
      taxRate: taxRate,
    });
  }, [watchedItems, watchedDiscount, taxRate]);

  const currency = orgSettings?.currency || activeOrg?.currency || 'USD';

  const mutation = useMutation({
    mutationFn: (data: InvoiceFormData) => {
      const payload = {
        ...data,
        issueDate: new Date(data.issueDate).toISOString(),
        dueDate: new Date(data.dueDate).toISOString(),
        projectId: data.projectId || null,
      };

      if (isEditing && id) {
        return api.patch<Invoice>(`/invoices/${id}`, payload);
      }
      return api.post<Invoice>('/invoices', payload);
    },
    onSuccess: (savedInvoice) => {
      success(isEditing ? 'Invoice updated successfully' : 'Invoice created successfully');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
      navigate(`/invoices/${savedInvoice.id}`);
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const onSubmit = (data: InvoiceFormData) => {
    mutation.mutate(data);
  };

  if (isEditing && isLoadingInvoice) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading invoice details...</div>;
  }

  const clientOptions = (clientsData?.data || []).map((c) => ({
    value: c.id,
    label: `${c.name}${c.company ? ` (${c.company})` : ''}`,
  }));

  const projectOptions = (clientProjectsData?.data || []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          to={isEditing ? `/invoices/${id}` : '/invoices'}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEditing ? 'Cancel Edit' : 'Back to Invoices'}
        </Link>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          {isEditing ? `Edit Invoice (${existingInvoice?.number || ''})` : 'Create New Invoice'}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Invoice Metadata Box */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            General Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Select Client"
              required
              error={errors.clientId?.message}
              {...register('clientId')}
            >
              <option value="">Choose a client...</option>
              {clientOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-white text-slate-900">
                  {opt.label}
                </option>
              ))}
            </Select>

            <Select
              label="Linked Project (Optional)"
              error={errors.projectId?.message}
              {...register('projectId')}
              disabled={!watchedClientId}
            >
              <option value="">None / Standalone</option>
              {projectOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-white text-slate-900">
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="date"
              label="Issue Date"
              required
              error={errors.issueDate?.message}
              {...register('issueDate')}
            />

            <Input
              type="date"
              label="Due Date"
              required
              error={errors.dueDate?.message}
              {...register('dueDate')}
            />
          </div>
        </div>

        {/* Dynamic Line Items Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Line Items</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => append({ description: '', qty: 1, rate: 0 })}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Item
            </Button>
          </div>

          {errors.items?.message && (
            <p className="text-xs text-rose-500 font-medium">{errors.items.message}</p>
          )}

          <div className="space-y-3">
            {fields.map((field, index) => {
              const itemTotal = liveTotals.items[index]?.amountFormatted || '0.00';

              return (
                <div
                  key={field.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200"
                >
                  <div className="flex-1 w-full">
                    <Input
                      placeholder="Service / Deliverable description..."
                      error={errors.items?.[index]?.description?.message}
                      {...register(`items.${index}.description`)}
                    />
                  </div>

                  <div className="w-full sm:w-28">
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="Qty"
                      error={errors.items?.[index]?.qty?.message}
                      {...register(`items.${index}.qty`)}
                    />
                  </div>

                  <div className="w-full sm:w-32">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Rate ($)"
                      error={errors.items?.[index]?.rate?.message}
                      {...register(`items.${index}.rate`)}
                    />
                  </div>

                  <div className="w-full sm:w-28 text-right font-bold text-sm text-slate-900 self-center">
                    ${itemTotal}
                  </div>

                  <div className="shrink-0 self-center">
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => {
                        if (fields.length > 1) remove(index);
                      }}
                      disabled={fields.length <= 1}
                      className="p-2 text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Financial Calculation & Live Estimate Box */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notes & Terms */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <Textarea
              label="Notes to Client"
              placeholder="Thank you for your business..."
              rows={3}
              error={errors.notes?.message}
              {...register('notes')}
            />

            <Textarea
              label="Terms & Conditions"
              placeholder="Payment terms, bank details, wire instructions..."
              rows={3}
              error={errors.terms?.message}
              {...register('terms')}
            />
          </div>

          {/* Live Preview / Estimate Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Live Calculation Preview</h3>
                </div>
                <span className="text-[11px] text-orange-700 font-bold px-2.5 py-0.5 rounded-full bg-orange-50 border border-orange-200">
                  Estimate (Server Authoritative)
                </span>
              </div>

              <div className="space-y-3 py-4 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-bold text-slate-800">{formatMoney(liveTotals.subtotal, currency)}</span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">Discount:</span>
                  <div className="w-32">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      error={errors.discount?.message}
                      {...register('discount')}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Tax Rate:</span>
                  <span className="text-slate-500 font-medium">{taxRate}% (Org Default)</span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Tax Amount:</span>
                  <span className="font-bold text-slate-800">{formatMoney(liveTotals.tax, currency)}</span>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-sm font-bold text-slate-900">
                  <span>Estimated Total:</span>
                  <span className="text-lg text-blue-600 font-black">{formatMoney(liveTotals.total, currency)}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <Link to="/invoices">
                <Button variant="secondary" disabled={isSubmitting}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                {isEditing ? 'Save Invoice Changes' : 'Create Invoice'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
