import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal.js';
import { Input } from '../../components/ui/Input.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { Button } from '../../components/ui/Button.js';
import { DatePicker } from '../../components/ui/DatePicker.js';
import { Project, ProjectInput, ProjectStatus, MilestoneStatus } from '../../types/project.js';
import { Client } from '../../types/client.js';
import { api } from '../../lib/apiClient.js';
import { useToast } from '../../contexts/ToastContext.js';
import { getFriendlyErrorMessage, cn } from '../../lib/utils.js';
import {
  Building2,
  ChevronDown,
  Check,
  Trash2,
  Loader2,
  Paperclip,
  Zap,
  Milestone,
  ArrowRight,
  ArrowLeft,
  Plus,
  Layers,
  Lock,
} from 'lucide-react';

const projectFormSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(150, 'Name too long').trim(),
  clientId: z.string().min(1, 'Client is required'),
  description: z.string().max(2000, 'Description too long').trim().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
  billingType: z.enum(['ONE_TIME', 'MILESTONE_BASED']),
  budget: z.coerce.number().min(0, 'Budget cannot be negative').optional().nullable(),
  deadline: z.string().min(1, 'Target deadline is required'),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

export interface MilestoneDraft {
  id: string;
  title: string;
  description: string;
  budget: string;
  deadline: string;
  status?: MilestoneStatus;
  isExisting?: boolean;
}

export interface ProjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (project: Project) => void;
  projectToEdit?: Project | null;
  defaultClientId?: string;
}

export const ProjectFormModal: React.FC<ProjectFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projectToEdit,
  defaultClientId,
}) => {
  const isEditing = Boolean(projectToEdit);
  const { success, error } = useToast();

  const [step, setStep] = useState<1 | 2>(1);

  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const [isBillingTypeDropdownOpen, setIsBillingTypeDropdownOpen] = useState(false);
  const billingTypeDropdownRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<
    Array<{ fileName: string; fileUrl: string; fileType: 'pdf' | 'word'; fileSize: number }>
  >([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  // Milestones draft state for Step 2
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    {
      id: 'ms-1',
      title: 'Phase 1: Initial Discovery & Planning',
      description: '',
      budget: '',
      deadline: '',
      status: 'PENDING',
      isExisting: false,
    },
  ]);

  // Fetch full project data if editing to ensure latest milestones are present
  const { data: fullProjectData } = useQuery({
    queryKey: ['project', projectToEdit?.id],
    queryFn: () => api.get<Project>(`/projects/${projectToEdit!.id}`),
    enabled: Boolean(isOpen && projectToEdit?.id),
  });

  // Fetch active clients for dropdown
  const { data: clientsData } = useQuery({
    queryKey: ['clients', { status: 'ACTIVE', limit: 100 }],
    queryFn: () => api.get<{ data: Client[] }>('/clients?status=ACTIVE&limit=100'),
    enabled: isOpen,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: '',
      clientId: defaultClientId || '',
      description: '',
      status: 'ACTIVE',
      billingType: 'ONE_TIME',
      budget: null,
      deadline: '',
    },
  });

  const selectedClientId = watch('clientId');
  const selectedStatus = watch('status');
  const selectedBillingType = watch('billingType') || 'ONE_TIME';
  const selectedDeadline = watch('deadline');

  const isMilestoneBased = selectedBillingType === 'MILESTONE_BASED';

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const remainingSlots = Math.max(0, 5 - attachedFiles.length);
    if (selected.length > remainingSlots) {
      error(`You can attach up to ${remainingSlots} more file${remainingSlots === 1 ? '' : 's'} (Max 5 total).`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const allowed = ['.pdf', '.doc', '.docx'];
    for (const file of selected) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowed.includes(ext)) {
        error(`"${file.name}" is not supported. Please upload only PDF or Word documents.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        error(`"${file.name}" exceeds the 25MB maximum file size limit.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setIsUploadingFiles(true);
    try {
      const newUploads: Array<{ fileName: string; fileUrl: string; fileType: 'pdf' | 'word'; fileSize: number }> = [];

      for (const file of selected) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await api.post<{
          url: string;
          relativePath: string;
          fileName: string;
          fileType: 'pdf' | 'word';
          fileSize: number;
        }>('/projects/upload', formData);

        const fileObj = (res as any)?.data || res;
        if (fileObj?.url && fileObj?.fileName) {
          newUploads.push({
            fileName: fileObj.fileName,
            fileUrl: fileObj.url,
            fileType: fileObj.fileType || (file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'word'),
            fileSize: fileObj.fileSize || file.size,
          });
        }
      }

      setAttachedFiles((prev) => [...prev, ...newUploads].slice(0, 5));
    } catch (err) {
      error(getFriendlyErrorMessage(err));
    } finally {
      setIsUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Milestone management helpers for Step 2
  const handleAddMilestone = () => {
    const newIdx = milestones.length + 1;
    setMilestones((prev) => [
      ...prev,
      {
        id: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: `Phase ${newIdx}: Milestone Deliverable`,
        description: '',
        budget: '',
        deadline: '',
        status: 'PENDING',
        isExisting: false,
      },
    ]);
  };

  const handleRemoveMilestone = (index: number) => {
    if (milestones.length <= 1) {
      error('A milestone-based project must have at least one milestone.');
      return;
    }
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateMilestone = (index: number, field: keyof MilestoneDraft, value: string) => {
    setMilestones((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Calculate total milestone budget
  const totalMilestoneBudget = milestones.reduce((sum, m) => {
    const num = parseFloat(m.budget);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  // Click outside listener for custom dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setIsClientDropdownOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (billingTypeDropdownRef.current && !billingTypeDropdownRef.current.contains(e.target as Node)) {
        setIsBillingTypeDropdownOpen(false);
      }
    };
    if (isClientDropdownOpen || isStatusDropdownOpen || isBillingTypeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isClientDropdownOpen, isStatusDropdownOpen, isBillingTypeDropdownOpen]);

  useEffect(() => {
    if (projectToEdit) {
      const resolvedClientId = projectToEdit.clientId || projectToEdit.client?.id || '';
      reset({
        name: projectToEdit.name,
        clientId: resolvedClientId,
        description: projectToEdit.description || '',
        status: projectToEdit.status,
        billingType: projectToEdit.billingType || 'ONE_TIME',
        budget: projectToEdit.budget ? Number(projectToEdit.budget) : null,
        deadline: projectToEdit.deadline ? projectToEdit.deadline.split('T')[0] : '',
      });
      setAttachedFiles([]);

      const sourceMilestones =
        projectToEdit.milestones && projectToEdit.milestones.length > 0
          ? projectToEdit.milestones
          : fullProjectData?.milestones;

      if (sourceMilestones && sourceMilestones.length > 0) {
        setMilestones(
          sourceMilestones.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description || '',
            budget: m.budget !== null && m.budget !== undefined ? String(m.budget) : '',
            deadline: m.deadline ? m.deadline.split('T')[0] : '',
            status: m.status,
            isExisting: true,
          }))
        );
      } else {
        setMilestones([
          {
            id: 'ms-1',
            title: 'Phase 1: Initial Discovery & Planning',
            description: '',
            budget: '',
            deadline: '',
            status: 'PENDING',
            isExisting: false,
          },
        ]);
      }
      setStep(1);
    } else {
      reset({
        name: '',
        clientId: defaultClientId || '',
        description: '',
        status: 'ACTIVE',
        billingType: 'ONE_TIME',
        budget: null,
        deadline: '',
      });
      setAttachedFiles([]);
      setMilestones([
        {
          id: 'ms-1',
          title: 'Phase 1: Initial Discovery & Planning',
          description: '',
          budget: '',
          deadline: '',
          status: 'PENDING',
          isExisting: false,
        },
      ]);
      setStep(1);
    }
  }, [projectToEdit, fullProjectData, defaultClientId, reset, isOpen]);

  const handleNextStep = async () => {
    const isValid = await trigger(['name', 'clientId', 'billingType', 'status', 'deadline']);
    if (isValid) {
      setStep(2);
    }
  };

  const onSubmit = async (data: ProjectFormData) => {
    try {
      let result: Project;
      if (isEditing && projectToEdit) {
        if (data.billingType === 'MILESTONE_BASED') {
          for (let i = 0; i < milestones.length; i++) {
            if (!milestones[i].title.trim()) {
              error(`Please provide a title for Milestone #${i + 1}`);
              return;
            }
          }
        }

        result = await api.patch<Project>(`/projects/${projectToEdit.id}`, {
          status: data.status as ProjectStatus,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
          milestones:
            data.billingType === 'MILESTONE_BASED'
              ? milestones.map((m) => ({
                  id: m.id.startsWith('ms-') ? undefined : m.id,
                  title: m.title.trim(),
                  description: m.description.trim() || null,
                  budget: m.budget && !isNaN(Number(m.budget)) ? Number(m.budget) : null,
                  deadline: m.deadline ? new Date(m.deadline).toISOString() : null,
                  status: (m.status as MilestoneStatus) || 'PENDING',
                }))
              : undefined,
        });
        success('Project updated successfully');
      } else {
        // If Milestone-based, validate milestones
        if (data.billingType === 'MILESTONE_BASED') {
          for (let i = 0; i < milestones.length; i++) {
            if (!milestones[i].title.trim()) {
              error(`Please provide a title for Milestone #${i + 1}`);
              return;
            }
          }
        }

        const payload: ProjectInput = {
          name: data.name,
          clientId: data.clientId,
          description: data.description || null,
          status: data.status as ProjectStatus,
          billingType: data.billingType,
          budget:
            data.billingType === 'ONE_TIME'
              ? data.budget !== null && data.budget !== undefined && !isNaN(Number(data.budget))
                ? Number(data.budget)
                : null
              : totalMilestoneBudget > 0
              ? totalMilestoneBudget
              : null,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
          files: attachedFiles,
          milestones:
            data.billingType === 'MILESTONE_BASED'
              ? milestones.map((m) => ({
                  title: m.title.trim(),
                  description: m.description.trim() || null,
                  budget: m.budget && !isNaN(Number(m.budget)) ? Number(m.budget) : null,
                  deadline: m.deadline ? new Date(m.deadline).toISOString() : null,
                  status: 'PENDING',
                }))
              : undefined,
        };

        result = await api.post<Project>('/projects', payload);
        success('Project created successfully');
      }

      onSuccess(result);
      onClose();
    } catch (err) {
      error(getFriendlyErrorMessage(err));
    }
  };

  const rawOptions = (clientsData?.data || []).map((c) => ({
    value: c.id,
    label: `${c.name}${c.company ? ` (${c.company})` : ''}`,
  }));

  // Ensure current project's client is always present in options even if not in first page of active clients
  const clientOptions = [...rawOptions];
  if (projectToEdit?.client && !clientOptions.some((opt) => opt.value === projectToEdit.client!.id)) {
    clientOptions.unshift({
      value: projectToEdit.client.id,
      label: `${projectToEdit.client.name}${projectToEdit.client.company ? ` (${projectToEdit.client.company})` : ''}`,
    });
  }

  const selectedClientOption = clientOptions.find((opt) => opt.value === selectedClientId);

  const statusOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditing
          ? step === 2
            ? 'Manage Project Milestones'
            : 'Edit Project'
          : step === 2
          ? 'Define Project Milestones'
          : 'Create New Project'
      }
      description={
        isEditing
          ? step === 2
            ? 'Update deliverables, target deadlines, and statuses for this project.'
            : isMilestoneBased
            ? 'Update project status and target deadline. Next, you can manage milestones.'
            : 'Update project status and target deadline.'
          : step === 2
          ? 'Set milestone deliverables, deadlines, and budget allocations.'
          : isMilestoneBased
          ? 'Enter project details. Next, you will define the project milestones.'
          : 'Define project scope, client, target deadline, and budget.'
      }
      size={step === 2 ? 'xl' : 'lg'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* STEP 1: Basic Details */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Project Name */}
            <div>
              <Input
                label="Project Name"
                required={!isEditing}
                disabled={isEditing}
                placeholder="Website Redesign / Brand Guidelines"
                error={errors.name?.message}
                {...register('name')}
              />
              {isEditing && (
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Project name cannot be modified after creation.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Custom Client Dropdown */}
              <div className="space-y-1.5" ref={clientDropdownRef}>
                <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                  Client {!isEditing && <span className="text-rose-500">*</span>}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    disabled={isEditing}
                    onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium transition-all text-left",
                      isEditing ? "bg-slate-50 text-slate-500 cursor-not-allowed border-slate-200" : "cursor-pointer hover:border-slate-400",
                      isClientDropdownOpen ? "border-blue-600 ring-4 ring-blue-500/15" : "border-slate-300",
                      errors.clientId && "border-rose-500 ring-4 ring-rose-500/10"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className={cn("truncate text-sm", selectedClientId ? "text-slate-900 font-semibold" : "text-slate-400 font-normal")}>
                        {selectedClientOption ? selectedClientOption.label : "Select a client..."}
                      </span>
                    </div>
                    {!isEditing && (
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                          isClientDropdownOpen && "rotate-180 text-blue-600"
                        )}
                      />
                    )}
                  </button>

                  {isClientDropdownOpen && !isEditing && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                      {clientOptions.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs text-slate-400">
                          No active clients found
                        </div>
                      ) : (
                        clientOptions.map((opt) => {
                          const isSelected = selectedClientId === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setValue('clientId', opt.value, { shouldValidate: true });
                                setIsClientDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                                isSelected
                                  ? "bg-blue-50 text-blue-700 font-semibold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="truncate">{opt.label}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {errors.clientId && (
                  <p className="text-xs text-rose-500 font-medium">{errors.clientId.message}</p>
                )}
              </div>

              {/* Custom Status Dropdown */}
              <div className="space-y-1.5" ref={statusDropdownRef}>
                <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                  Project Status <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium transition-all text-left cursor-pointer",
                      "focus:outline-none focus:ring-4 focus:ring-blue-500/15",
                      isStatusDropdownOpen
                        ? "border-blue-600 ring-4 ring-blue-500/15"
                        : "border-slate-300 hover:border-slate-400"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span
                        className={cn(
                          "w-2.5 h-2.5 rounded-full shrink-0",
                          selectedStatus === 'ACTIVE'
                            ? "bg-emerald-500 ring-2 ring-emerald-200"
                            : selectedStatus === 'ON_HOLD'
                            ? "bg-amber-500 ring-2 ring-amber-200"
                            : selectedStatus === 'COMPLETED'
                            ? "bg-blue-500 ring-2 ring-blue-200"
                            : "bg-slate-400 ring-2 ring-slate-200"
                        )}
                      />
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {statusOptions.find((s) => s.value === selectedStatus)?.label || "Active"}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                        isStatusDropdownOpen && "rotate-180 text-blue-600"
                      )}
                    />
                  </button>

                  {isStatusDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      {statusOptions.map((s) => {
                        const isSelected = selectedStatus === s.value;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => {
                              setValue('status', s.value as any, { shouldValidate: true });
                              setIsStatusDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                              isSelected
                                  ? "bg-blue-50 text-blue-700 font-semibold"
                                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <span
                                className={cn(
                                  "w-2 h-2 rounded-full shrink-0",
                                  s.value === 'ACTIVE'
                                    ? "bg-emerald-500"
                                    : s.value === 'ON_HOLD'
                                    ? "bg-amber-500"
                                    : s.value === 'COMPLETED'
                                    ? "bg-blue-500"
                                    : "bg-slate-400"
                                )}
                              />
                              <span>{s.label}</span>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Project Billing Type & Conditional Fields */}
            {isEditing ? (
              /* Edit Mode: Billing Type and Budget are locked; Target Deadline is editable */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                    Billing Type (Locked)
                  </label>
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700">
                    <span className="flex items-center gap-2">
                      {selectedBillingType === 'MILESTONE_BASED' ? (
                        <>
                          <Milestone className="w-4 h-4 text-purple-600" />
                          Milestone-Based
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 text-blue-600" />
                          One-Time Project
                        </>
                      )}
                    </span>
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>

                {/* Target Deadline */}
                <div>
                  <DatePicker
                    label="Target Deadline *"
                    required
                    value={selectedDeadline}
                    onChange={(val) => setValue('deadline', val, { shouldValidate: true })}
                    error={errors.deadline?.message}
                    placeholder="Select target deadline..."
                  />
                </div>
              </div>
            ) : isMilestoneBased ? (
              /* Create Milestone-based: Show Billing Type and Target Deadline side-by-side (NO BUDGET FIELD) */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5" ref={billingTypeDropdownRef}>
                  <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                    Project Billing Type <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsBillingTypeDropdownOpen(!isBillingTypeDropdownOpen)}
                      className={cn(
                        "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium transition-all text-left cursor-pointer",
                        "focus:outline-none focus:ring-4 focus:ring-blue-500/15",
                        isBillingTypeDropdownOpen
                          ? "border-blue-600 ring-4 ring-blue-500/15"
                          : "border-slate-300 hover:border-slate-400"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border bg-purple-50 border-purple-200 text-purple-600">
                          <Milestone className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="truncate text-sm font-semibold text-slate-900 block leading-tight">
                            Milestone-Based
                          </span>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                          isBillingTypeDropdownOpen && "rotate-180 text-blue-600"
                        )}
                      />
                    </button>

                    {isBillingTypeDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                        <button
                          type="button"
                          onClick={() => {
                            setValue('billingType', 'ONE_TIME', { shouldValidate: true });
                            setIsBillingTypeDropdownOpen(false);
                          }}
                          className="w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition-colors text-left cursor-pointer text-slate-700 hover:bg-slate-50"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 pr-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-100/80 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                              <Zap className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-xs text-slate-900 leading-tight">One-Time Project</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">Full single project with total budget</p>
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setValue('billingType', 'MILESTONE_BASED', { shouldValidate: true });
                            setIsBillingTypeDropdownOpen(false);
                          }}
                          className="w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition-colors text-left cursor-pointer mt-1 bg-purple-50 text-purple-900"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 pr-2">
                            <div className="w-7 h-7 rounded-lg bg-purple-100/80 border border-purple-200 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                              <Milestone className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-xs text-slate-900 leading-tight">Milestone-Based</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">Phased deliverables & milestone budgets</p>
                            </div>
                          </div>
                          <Check className="w-4 h-4 text-purple-600 shrink-0" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Target Deadline */}
                <div>
                  <DatePicker
                    label="Target Deadline *"
                    required
                    value={selectedDeadline}
                    onChange={(val) => setValue('deadline', val, { shouldValidate: true })}
                    error={errors.deadline?.message}
                    placeholder="Select target deadline..."
                  />
                </div>
              </div>
            ) : (
              /* Create One-Time Project: Show Billing Type and Budget side-by-side, then Target Deadline */
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5" ref={billingTypeDropdownRef}>
                    <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                      Project Billing Type <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsBillingTypeDropdownOpen(!isBillingTypeDropdownOpen)}
                        className={cn(
                          "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium transition-all text-left cursor-pointer",
                          "focus:outline-none focus:ring-4 focus:ring-blue-500/15",
                          isBillingTypeDropdownOpen
                            ? "border-blue-600 ring-4 ring-blue-500/15"
                            : "border-slate-300 hover:border-slate-400"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border bg-blue-50 border-blue-200 text-blue-600">
                            <Zap className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="truncate text-sm font-semibold text-slate-900 block leading-tight">
                              One-Time Project
                            </span>
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                            isBillingTypeDropdownOpen && "rotate-180 text-blue-600"
                          )}
                        />
                      </button>

                      {isBillingTypeDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                          <button
                            type="button"
                            onClick={() => {
                              setValue('billingType', 'ONE_TIME', { shouldValidate: true });
                              setIsBillingTypeDropdownOpen(false);
                            }}
                            className="w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition-colors text-left cursor-pointer bg-blue-50 text-blue-900"
                          >
                            <div className="flex items-start gap-2.5 min-w-0 pr-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-100/80 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                                <Zap className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-bold text-xs text-slate-900 leading-tight">One-Time Project</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">Full single project (no milestones)</p>
                              </div>
                            </div>
                            <Check className="w-4 h-4 text-blue-600 shrink-0" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setValue('billingType', 'MILESTONE_BASED', { shouldValidate: true });
                              setIsBillingTypeDropdownOpen(false);
                            }}
                            className="w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition-colors text-left cursor-pointer mt-1 text-slate-700 hover:bg-slate-50"
                          >
                            <div className="flex items-start gap-2.5 min-w-0 pr-2">
                              <div className="w-7 h-7 rounded-lg bg-purple-100/80 border border-purple-200 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                                <Milestone className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-bold text-xs text-slate-900 leading-tight">Milestone-Based</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">Phased deliverables & milestone billing</p>
                              </div>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Budget Field for One-Time Project */}
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    label="Budget ($)"
                    placeholder="5000.00"
                    error={errors.budget?.message}
                    {...register('budget')}
                  />
                </div>

                <div>
                  <DatePicker
                    label="Target Deadline *"
                    required
                    value={selectedDeadline}
                    onChange={(val) => setValue('deadline', val, { shouldValidate: true })}
                    error={errors.deadline?.message}
                    placeholder="Select target deadline..."
                  />
                </div>
              </>
            )}

            {!isEditing && (
              <Textarea
                label="Project Scope & Description"
                placeholder="Key deliverables, scope overview, or external repository links..."
                rows={3}
                error={errors.description?.message}
                {...register('description')}
              />
            )}

            {/* Project Document Attachments (PDF & Word, Max 5 files) - Shown when creating project */}
            {!isEditing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                    Attach Documents (PDF / Word)
                  </label>
                  <span
                    className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-md',
                      attachedFiles.length >= 5
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {attachedFiles.length} / 5 files
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                />

                {/* Drop / Browse Area */}
                {attachedFiles.length < 5 && (
                  <div
                    onClick={() => !isUploadingFiles && fileInputRef.current?.click()}
                    className={cn(
                      'flex items-center justify-center gap-3 p-3.5 border-2 border-dashed rounded-xl transition-all cursor-pointer text-center',
                      isUploadingFiles
                        ? 'border-blue-400 bg-blue-50/30 cursor-wait'
                        : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 bg-slate-50/50'
                    )}
                  >
                    {isUploadingFiles ? (
                      <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Uploading document(s)...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                          <Paperclip className="w-3.5 h-3.5" />
                        </div>
                        <span>
                          <span className="font-semibold text-blue-600 hover:underline">Click to browse</span> or drop PDF & Word files (.pdf, .doc, .docx)
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Attached Files List */}
                {attachedFiles.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {attachedFiles.map((file, idx) => {
                      const isPdf = file.fileType === 'pdf' || file.fileName.toLowerCase().endsWith('.pdf');
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 shadow-2xs',
                                isPdf
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : 'bg-blue-100 text-blue-700 border border-blue-200'
                              )}
                            >
                              {isPdf ? 'PDF' : 'DOC'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate max-w-xs">{file.fileName}</p>
                              <p className="text-[11px] text-slate-500">{formatFileSize(file.fileSize)}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                            title="Remove file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 1 Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting || isUploadingFiles}>
                Cancel
              </Button>

              {isMilestoneBased ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleNextStep}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Next
                </Button>
              ) : isEditing ? (
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                  Save Changes
                </Button>
              ) : (
                <Button type="submit" variant="primary" isLoading={isSubmitting || isUploadingFiles}>
                  Create Project
                </Button>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Milestone Definition (For Creating or Editing Milestone-based project) */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Header Summary Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-blue-50 border border-purple-200/80 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-purple-600/30">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    {isEditing ? 'Manage Project Milestones' : 'Project Milestone Phases'}
                  </h4>
                  <p className="text-xs text-slate-600">
                    {isEditing
                      ? 'Update deliverables, target deadlines, and statuses.'
                      : 'Add deliverables, due dates, and individual budget allocations.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-3.5 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-purple-900 shadow-2xs">
                  <span className="text-purple-600 font-medium mr-1">Total Budget:</span>
                  ${totalMilestoneBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="px-2.5 py-1.5 bg-purple-100/70 border border-purple-200 text-purple-800 rounded-xl text-xs font-bold">
                  {milestones.length} Phase{milestones.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {/* Milestones Cards List */}
            <div className="space-y-3.5 pb-1 max-h-[50vh] overflow-y-auto pr-1">
              {milestones.map((m, idx) => (
                <div
                  key={m.id}
                  className="p-4 bg-white border border-slate-200/90 hover:border-purple-300 rounded-2xl shadow-xs transition-all space-y-3 relative group"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-black text-[11px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Milestone Phase #{idx + 1}
                      </span>
                    </div>

                    {milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMilestone(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove milestone"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <Input
                        label="Milestone Title"
                        required
                        value={m.title}
                        onChange={(e) => handleUpdateMilestone(idx, 'title', e.target.value)}
                        placeholder="e.g. Phase 1: UX Wireframes & Information Architecture"
                      />
                    </div>
                    <div>
                      {m.isExisting ? (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase mb-1.5">
                            Budget (Locked)
                          </label>
                          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
                            <span>
                              {m.budget ? `$${Number(m.budget).toFixed(2)}` : 'No budget'}
                            </span>
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        </div>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          label="Milestone Budget ($)"
                          value={m.budget}
                          onChange={(e) => handleUpdateMilestone(idx, 'budget', e.target.value)}
                          placeholder="1500.00"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <DatePicker
                        label="Milestone Deadline"
                        value={m.deadline}
                        onChange={(val) => handleUpdateMilestone(idx, 'deadline', val)}
                        placeholder="Select phase deadline..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase mb-1.5">
                        Status
                      </label>
                      <select
                        value={m.status || 'PENDING'}
                        onChange={(e) => handleUpdateMilestone(idx, 'status', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-4 focus:ring-purple-500/15 focus:border-purple-600 cursor-pointer"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <Input
                        label="Deliverables / Key Notes"
                        value={m.description}
                        onChange={(e) => handleUpdateMilestone(idx, 'description', e.target.value)}
                        placeholder="e.g. Complete Figma designs and client sign-off"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Milestone Button */}
            <button
              type="button"
              onClick={handleAddMilestone}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-50 hover:bg-purple-50/50 text-purple-700 hover:text-purple-800 border-2 border-dashed border-purple-300/80 hover:border-purple-400 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4 text-purple-600" />
              Add Another Milestone Phase
            </button>

            {/* Step 2 Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(1)}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                disabled={isSubmitting}
              >
                Back to Details
              </Button>

              <div className="flex items-center gap-2.5">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                  {isEditing ? 'Save Changes' : 'Create Project'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};
