import React, { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '../../components/ui/Modal.js';
import { Input } from '../../components/ui/Input.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { Button } from '../../components/ui/Button.js';
import { Client, ClientInput } from '../../types/client.js';
import { api } from '../../lib/apiClient.js';
import { useToast } from '../../contexts/ToastContext.js';
import { getFriendlyErrorMessage, cn } from '../../lib/utils.js';
import { Sparkles, ChevronDown, Check, ShieldCheck, Archive } from 'lucide-react';

const clientFormSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(150, 'Name too long').trim(),
  email: z.string().min(1, 'Email is required').email('Invalid email format').toLowerCase().trim(),
  company: z.string().max(150, 'Company name too long').trim().optional().or(z.literal('')),
  phone: z.string().max(50, 'Phone too long').trim().optional().or(z.literal('')),
  address: z.string().max(300, 'Address too long').trim().optional().or(z.literal('')),
  notes: z.string().max(2000, 'Notes too long').trim().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE').optional(),
});

type ClientFormData = z.infer<typeof clientFormSchema>;

export interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (client: Client) => void;
  clientToEdit?: Client | null;
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  clientToEdit,
}) => {
  const isEditing = Boolean(clientToEdit);
  const { success, error } = useToast();
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: '',
      email: '',
      company: '',
      phone: '',
      address: '',
      notes: '',
      status: 'ACTIVE',
    },
  });

  const currentStatus = watch('status') || 'ACTIVE';

  useEffect(() => {
    if (clientToEdit) {
      reset({
        name: clientToEdit.name,
        email: clientToEdit.email,
        company: clientToEdit.company || '',
        phone: clientToEdit.phone || '',
        address: clientToEdit.address || '',
        notes: clientToEdit.notes || '',
        status: clientToEdit.status || 'ACTIVE',
      });
    } else {
      reset({
        name: '',
        email: '',
        company: '',
        phone: '',
        address: '',
        notes: '',
        status: 'ACTIVE',
      });
    }
    setIsStatusDropdownOpen(false);
  }, [clientToEdit, reset, isOpen]);

  // Click outside listener for status dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };
    if (isStatusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStatusDropdownOpen]);

  const onSubmit = async (data: ClientFormData) => {
    try {
      let result: Client;
      if (isEditing && clientToEdit) {
        result = await api.patch<Client>(`/clients/${clientToEdit.id}`, {
          status: data.status,
        });
        success('Client status updated successfully');
      } else {
        const payload: ClientInput = {
          name: data.name,
          email: data.email,
          company: data.company || null,
          phone: data.phone || null,
          address: data.address || null,
          notes: data.notes || null,
        };
        result = await api.post<Client>('/clients', payload);
        success('Client created successfully');
      }

      onSuccess(result);
      onClose();
    } catch (err) {
      error(getFriendlyErrorMessage(err));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Client Profile' : 'Add New Client'}
      description={
        isEditing
          ? 'Review customer details and update active status.'
          : 'Create a customer billing contact and optional portal invite.'
      }
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Info Tip Banner */}
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-orange-50/80 border border-orange-200 text-xs text-orange-900 shadow-sm">
          <Sparkles className="w-4 h-4 text-orange-600 shrink-0" />
          <span className="font-medium leading-relaxed">
            {isEditing
              ? 'To protect financial invoices, name & email are immutable.'
              : 'Clients can be assigned to projects and invited to view real-time project progress.'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Client / Contact Name"
            required={!isEditing}
            disabled={isEditing}
            placeholder="Acme Corp / John Smith"
            error={errors.name?.message}
            {...register('name')}
          />
          <Input
            type="email"
            label="Email Address"
            required={!isEditing}
            disabled={isEditing}
            placeholder="billing@acme.com"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Company Name"
            disabled={isEditing}
            placeholder="Acme Corporation"
            error={errors.company?.message}
            {...register('company')}
          />
          <Input
            label="Phone Number"
            disabled={isEditing}
            placeholder="+1 (555) 000-0000"
            error={errors.phone?.message}
            {...register('phone')}
          />
        </div>

        <Input
          label="Billing Address"
          disabled={isEditing}
          placeholder="123 Business Way, Suite 100, City, ST 12345"
          error={errors.address?.message}
          {...register('address')}
        />

        {isEditing && (
          <div className="space-y-1.5" ref={statusDropdownRef}>
            <label className="block text-xs font-bold text-slate-800">
              Client Status
            </label>
            
            {/* Custom Interactive Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsStatusDropdownOpen((prev) => !prev)}
                className={cn(
                  'w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium transition cursor-pointer shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15',
                  isStatusDropdownOpen
                    ? 'border-blue-600 ring-4 ring-blue-500/15'
                    : 'border-slate-300 hover:border-slate-400'
                )}
              >
                <div className="flex items-center gap-2.5">
                  {currentStatus === 'ACTIVE' ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />
                      <span className="font-semibold text-slate-900">Active</span>
                      <span className="text-xs text-slate-400 font-normal">— Operational & ready for invoices</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 ring-4 ring-slate-100 shrink-0" />
                      <span className="font-semibold text-slate-700">Archived</span>
                      <span className="text-xs text-slate-400 font-normal">— Hidden from active workflows</span>
                    </>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-slate-500 transition-transform duration-200 shrink-0',
                    isStatusDropdownOpen && 'rotate-180 text-blue-600'
                  )}
                />
              </button>

              {/* Dropdown Menu */}
              {isStatusDropdownOpen && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setValue('status', 'ACTIVE', { shouldValidate: true, shouldDirty: true });
                      setIsStatusDropdownOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-lg text-left cursor-pointer transition text-sm',
                      currentStatus === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-900 font-semibold'
                        : 'hover:bg-slate-50 text-slate-700 font-medium'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">Active</span>
                        </div>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          Client can receive invoices, project assignments, and portal updates.
                        </p>
                      </div>
                    </div>
                    {currentStatus === 'ACTIVE' && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setValue('status', 'ARCHIVED', { shouldValidate: true, shouldDirty: true });
                      setIsStatusDropdownOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-lg text-left cursor-pointer transition text-sm mt-1',
                      currentStatus === 'ARCHIVED'
                        ? 'bg-slate-100 text-slate-900 font-semibold'
                        : 'hover:bg-slate-50 text-slate-700 font-medium'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                        <Archive className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span>Archived</span>
                        </div>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          Inactive client. Hidden from dropdowns while preserving history.
                        </p>
                      </div>
                    </div>
                    {currentStatus === 'ARCHIVED' && (
                      <Check className="w-4 h-4 text-slate-900 shrink-0 ml-2" />
                    )}
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Change client status to Active or Archived.</p>
          </div>
        )}

        <Textarea
          label="Internal Notes"
          disabled={isEditing}
          placeholder="Specific client payment terms, preferences, or internal notes..."
          rows={3}
          error={errors.notes?.message}
          {...register('notes')}
        />

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/25 text-white font-bold cursor-pointer"
          >
            {isEditing ? 'Save Changes' : 'Create Client'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ClientFormModal;
