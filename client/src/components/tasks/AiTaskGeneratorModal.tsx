import React, { useState, useEffect } from 'react';
import { api } from '../../lib/apiClient.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Project } from '../../types/project.js';
import { SuggestedAiTask, TaskPriority } from '../../types/task.js';
import {
  X,
  Sparkles,
  FolderKanban,
  FileText,
  Upload,
  CheckCircle2,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  FileUp,
  Bot,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface TeamMember {
  id: string;
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string | null;
  };
}

interface AiTaskGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTasksApproved: () => void;
  initialProjectId?: string;
}

export const AiTaskGeneratorModal: React.FC<AiTaskGeneratorModalProps> = ({
  isOpen,
  onClose,
  onTasksApproved,
  initialProjectId,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [step, setStep] = useState<'SELECT_FILES' | 'REVIEW_APPROVAL'>('SELECT_FILES');
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Phase 1 State
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || '');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Phase 2 Review State
  const [suggestedTasks, setSuggestedTasks] = useState<
    (SuggestedAiTask & { isSelected: boolean })[]
  >([]);
  const [isApproving, setIsApproving] = useState(false);

  // Load Projects & Members on Open
  useEffect(() => {
    if (isOpen) {
      setStep('SELECT_FILES');
      setIsLoadingMetadata(true);
      Promise.all([
        api.get<Project[]>('/projects'),
        api.get<TeamMember[]>('/members'),
      ])
        .then(([projectsRes, membersRes]) => {
          const projs = Array.isArray(projectsRes) ? projectsRes : (projectsRes as any)?.data || [];
          const mems = Array.isArray(membersRes) ? membersRes : (membersRes as any)?.data || [];
          setProjects(projs);
          setMembers(mems);

          const defaultProjId = initialProjectId || (projs.length > 0 ? projs[0].id : '');
          setSelectedProjectId(defaultProjId);
        })
        .catch((err) => {
          console.error('Failed to load metadata:', err);
        })
        .finally(() => {
          setIsLoadingMetadata(false);
        });
    }
  }, [isOpen, initialProjectId]);

  // When selected project changes, fetch full project detail including existing files
  useEffect(() => {
    if (selectedProjectId) {
      api.get<Project>(`/projects/${selectedProjectId}`)
        .then((res) => {
          const proj = (res as any)?.data || res;
          setSelectedProject(proj);
          const existingFiles = proj?.files || [];
          // Pre-select all existing files
          setSelectedFileIds(existingFiles.map((f: any) => f.id));
        })
        .catch((err) => {
          console.error('Failed to fetch project detail:', err);
        });
    } else {
      setSelectedProject(null);
      setSelectedFileIds([]);
    }
  }, [selectedProjectId]);

  if (!isOpen) return null;

  const handleToggleFileId = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setUploadedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleRemoveUploadedFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!selectedProjectId) {
      toastError('Please select a project first.');
      return;
    }

    const existingFilesCount = selectedFileIds.length;
    const newFilesCount = uploadedFiles.length;

    if (existingFilesCount === 0 && newFilesCount === 0 && (!selectedProject?.description || selectedProject.description.length < 20)) {
      toastError('Please select or upload at least one requirement document (PDF, Word, TXT) for AI analysis.');
      return;
    }

    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append('projectId', selectedProjectId);
      if (customInstructions.trim()) {
        formData.append('customInstructions', customInstructions.trim());
      }
      if (selectedFileIds.length > 0) {
        formData.append('fileIds', JSON.stringify(selectedFileIds));
      }
      uploadedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const res = await api.post<any>('/tasks/generate-ai', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = res?.data || res;
      const tasks: SuggestedAiTask[] = data?.suggestedTasks || [];

      if (tasks.length === 0) {
        toastError('AI could not generate tasks from the provided files. Please check file content and try again.');
        return;
      }

      setSuggestedTasks(
        tasks.map((t) => ({
          ...t,
          isSelected: true,
        }))
      );
      setStep('REVIEW_APPROVAL');
      toastSuccess(`AI generated ${tasks.length} tasks successfully! Please review before approving.`);
    } catch (err: any) {
      console.error('AI Task generation error:', err);
      toastError(err?.message || 'Failed to generate tasks with AI. Please check the files.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Review stage helpers
  const handleToggleTaskSelection = (index: number) => {
    setSuggestedTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, isSelected: !t.isSelected } : t))
    );
  };

  const handleSelectAllTasks = (select: boolean) => {
    setSuggestedTasks((prev) => prev.map((t) => ({ ...t, isSelected: select })));
  };

  const handleUpdateSuggestedTask = (
    index: number,
    field: keyof SuggestedAiTask,
    value: any
  ) => {
    setSuggestedTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const handleDeleteSuggestedTask = (index: number) => {
    setSuggestedTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddCustomTask = () => {
    const today = new Date();
    today.setDate(today.getDate() + 7);
    const newTask: SuggestedAiTask & { isSelected: boolean } = {
      id: `custom-task-${Date.now()}`,
      title: 'New Custom Task',
      description: 'Add specific deliverables or instructions here...',
      priority: 'MEDIUM',
      estimatedHours: 8,
      dueDate: today.toISOString().split('T')[0],
      status: 'TODO',
      projectId: selectedProjectId,
      projectName: selectedProject?.name || 'Project',
      isSelected: true,
    };
    setSuggestedTasks((prev) => [...prev, newTask]);
  };

  const handleApproveTasks = async () => {
    const selectedTasks = suggestedTasks.filter((t) => t.isSelected);
    if (selectedTasks.length === 0) {
      toastError('Please select at least one task to approve.');
      return;
    }

    setIsApproving(true);
    try {
      await api.post('/tasks/approve-ai', {
        projectId: selectedProjectId,
        tasks: selectedTasks.map((t) => ({
          title: t.title.trim(),
          description: t.description?.trim() || null,
          priority: t.priority || 'MEDIUM',
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          estimatedHours: t.estimatedHours || null,
          assigneeId: t.assigneeId || null,
        })),
      });

      toastSuccess(`Successfully approved and created ${selectedTasks.length} tasks!`);
      onTasksApproved();
      onClose();
    } catch (err: any) {
      toastError(err?.message || 'Failed to approve and create tasks');
    } finally {
      setIsApproving(false);
    }
  };

  const existingProjectFiles = selectedProject?.files || [];
  const selectedCount = suggestedTasks.filter((t) => t.isSelected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={cn(
          'relative w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] transition-all duration-200',
          step === 'REVIEW_APPROVAL' ? 'max-w-4xl' : 'max-w-2xl'
        )}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#070F2B] via-[#1B1A55] to-[#535C91] text-white border-b border-[#1B1A55]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300 shadow-inner">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight font-heading">
                  AI Task Breakdown & Generator
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 uppercase tracking-wide">
                  Gemini AI
                </span>
              </div>
              <p className="text-[11px] text-slate-200">
                {step === 'SELECT_FILES'
                  ? 'Analyze requirement documents & auto-generate structured tasks'
                  : 'Review, edit, and approve tasks before adding to your project'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading Metadata State */}
        {isLoadingMetadata ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-7 h-7 animate-spin text-[#535C91]" />
            <span className="text-xs font-semibold text-slate-600 font-heading">Loading workspace data...</span>
          </div>
        ) : step === 'SELECT_FILES' ? (
          /* ================= PHASE 1: PROJECT & FILE SELECTION ================= */
          <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar">
            {/* 1. Project Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                Select Project <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <FolderKanban className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
                >
                  <option value="" disabled>Select target project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.billingType === 'MILESTONE_BASED' ? 'Milestone' : 'One-Time'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. Requirement Files Section */}
            {selectedProject && (
              <div className="space-y-4">
                {/* Existing Files */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                      Project Requirement Documents
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {existingProjectFiles.length} file{existingProjectFiles.length === 1 ? '' : 's'} linked
                    </span>
                  </div>

                  {existingProjectFiles.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {existingProjectFiles.map((file) => {
                        const isChecked = selectedFileIds.includes(file.id);
                        return (
                          <label
                            key={file.id}
                            className={cn(
                              'flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none',
                              isChecked
                                ? 'bg-blue-50/70 border-[#535C91]/40 shadow-2xs'
                                : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleFileId(file.id)}
                                className="w-4 h-4 rounded text-[#535C91] focus:ring-[#535C91] border-slate-300"
                              />
                              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-600 shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{file.fileName}</p>
                                <p className="text-[10px] text-slate-400 uppercase">
                                  {file.fileType} • {(file.fileSize / 1024).toFixed(0)} KB
                                </p>
                              </div>
                            </div>
                            <span className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-md',
                              isChecked ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                            )}>
                              {isChecked ? 'Included' : 'Skip'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    /* Prompt when NO requirement files exist */
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 flex items-start gap-3 text-amber-900">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold">No requirement files found for this project</h4>
                        <p className="text-[11px] text-amber-700/90 mt-0.5">
                          Please upload your project specification (PDF, Word, or TXT) below so Gemini AI can extract deliverables and build the tasks.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Upload New / Additional Requirement Files */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                    Upload Additional Requirements (.pdf, .docx, .txt)
                  </label>
                  <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 hover:border-[#535C91] rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer group">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-[#535C91] group-hover:border-[#535C91]/40 shadow-xs mb-2 transition">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700 font-heading">
                      Click to browse or drop requirement documents
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Supports PDF, DOCX, DOC, TXT (up to 25MB each)
                    </p>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.txt,.md"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {/* List of newly attached files */}
                  {uploadedFiles.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {uploadedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileUp className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-semibold text-slate-800 truncate">{file.name}</span>
                            <span className="text-[10px] text-slate-400">
                              ({(file.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveUploadedFile(idx)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Custom AI Instructions */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                    Custom AI Prompt Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Focus on backend APIs first, break down into 2-week sprints, prioritize Stripe integration"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition"
                  />
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer font-heading"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !selectedProjectId}
                className={cn(
                  'px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#1B1A55] to-[#535C91] hover:from-[#070F2B] hover:to-[#434a78] text-white text-xs font-bold shadow-md shadow-[#535C91]/30 transition flex items-center gap-2 cursor-pointer font-heading',
                  (isGenerating || !selectedProjectId) && 'opacity-60 cursor-not-allowed'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI Analyzing Documents...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Generate Tasks with AI</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ================= PHASE 2: REVIEW & APPROVAL STAGE ================= */
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {/* Header info bar */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 font-heading">
                    AI Task Review & Approval Stage
                  </h3>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Generated for <strong className="text-blue-950">{selectedProject?.name}</strong>. Edit details, remove unwanted items, or add new tasks before final approval.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAddCustomTask}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-bold shadow-2xs transition cursor-pointer font-heading"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectAllTasks(selectedCount !== suggestedTasks.length)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-2xs transition cursor-pointer font-heading"
                >
                  {selectedCount === suggestedTasks.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>

            {/* Suggested Tasks List */}
            <div className="space-y-3">
              {suggestedTasks.map((task, index) => (
                <div
                  key={task.id || index}
                  className={cn(
                    'p-4 rounded-2xl border transition-all duration-150 flex flex-col gap-3',
                    task.isSelected
                      ? 'bg-white border-blue-300 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 opacity-60'
                  )}
                >
                  {/* Task Top Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={task.isSelected}
                        onChange={() => handleToggleTaskSelection(index)}
                        className="w-4 h-4 rounded text-[#535C91] focus:ring-[#535C91] border-slate-300 mt-1 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => handleUpdateSuggestedTask(index, 'title', e.target.value)}
                          placeholder="Task title..."
                          className="w-full text-xs sm:text-sm font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#535C91] focus:outline-none py-0.5 transition"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                        AI Generated
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSuggestedTask(index)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Remove task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Task Description */}
                  <div className="pl-7">
                    <textarea
                      rows={2}
                      value={task.description || ''}
                      onChange={(e) => handleUpdateSuggestedTask(index, 'description', e.target.value)}
                      placeholder="Task description & deliverables..."
                      className="w-full text-xs text-slate-600 bg-slate-50/60 border border-slate-200 rounded-xl p-2.5 focus:bg-white focus:outline-none focus:border-[#535C91] focus:ring-1 focus:ring-[#535C91]/20 transition resize-none"
                    />
                  </div>

                  {/* Task Metadata Row: Priority, Due Date, Est. Hours, Assignee */}
                  <div className="pl-7 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    {/* Priority */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Priority</label>
                      <select
                        value={task.priority}
                        onChange={(e) => handleUpdateSuggestedTask(index, 'priority', e.target.value as TaskPriority)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#535C91]"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent ⚡</option>
                      </select>
                    </div>

                    {/* Due Date */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={task.dueDate || ''}
                        onChange={(e) => handleUpdateSuggestedTask(index, 'dueDate', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#535C91]"
                      />
                    </div>

                    {/* Est. Hours */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Est. Hours</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={task.estimatedHours || ''}
                        onChange={(e) => handleUpdateSuggestedTask(index, 'estimatedHours', parseFloat(e.target.value) || 0)}
                        placeholder="Hours"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#535C91]"
                      />
                    </div>

                    {/* Assignee */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Assignee</label>
                      <select
                        value={task.assigneeId || ''}
                        onChange={(e) => handleUpdateSuggestedTask(index, 'assigneeId', e.target.value || null)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#535C91]"
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.userId || m.id} value={m.userId || m.id}>
                            {m.user?.firstName} {m.user?.lastName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Approval Footer */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0 bg-white/95 backdrop-blur-xs py-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <span className="w-6 h-6 rounded-full bg-[#535C91] text-white flex items-center justify-center text-xs">
                  {selectedCount}
                </span>
                <span>of {suggestedTasks.length} tasks selected for creation</span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStep('SELECT_FILES')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition cursor-pointer font-heading flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Back to Files</span>
                </button>

                <button
                  type="button"
                  onClick={handleApproveTasks}
                  disabled={isApproving || selectedCount === 0}
                  className={cn(
                    'px-6 py-2.5 rounded-xl bg-[#070F2B] hover:bg-[#1B1A55] text-white text-xs font-bold shadow-md shadow-[#070F2B]/20 transition flex items-center gap-2 cursor-pointer font-heading',
                    (isApproving || selectedCount === 0) && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Approving & Saving Tasks...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Approve & Create Tasks ({selectedCount})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
