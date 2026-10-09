import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../contexts/ToastContext.js';
import { api } from '../../lib/apiClient.js';
import { Video, X, FolderKanban, Sparkles, Loader2, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface ProjectOption {
  id: string;
  name: string;
}

interface StartInstantMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMeetingStarted: (meetingId: string) => void;
}

export const StartInstantMeetingModal: React.FC<StartInstantMeetingModalProps> = ({
  isOpen,
  onClose,
  onMeetingStarted,
}) => {
  const { error: toastError, success: toastSuccess } = useToast();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);

  const projectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) {
        setIsProjectOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    setTitle('');
    setProjectId('');
    setIsProjectOpen(false);

    api.get<any>('/projects?status=ACTIVE')
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        setProjects(list.map((p: any) => ({ id: p.id, name: p.name })));
        if (list.length > 0) {
          setProjectId(list[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load projects for meeting modal:', err);
      });
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload: { title?: string; projectId?: string } = {
        title: title.trim() || 'Instant Team Meeting',
      };

      if (projectId) {
        payload.projectId = projectId;
      }

      const res = await api.post<{
        meeting: { id: string; title: string; roomName: string };
      }>('/meetings/instant', payload);

      toastSuccess('Instant meeting created!');
      onClose();

      if (res?.meeting?.id) {
        onMeetingStarted(res.meeting.id);
      }
    } catch (err: any) {
      toastError(err.message || 'Failed to create instant meeting.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 animate-in zoom-in-95 duration-200">
        {/* Top Header - Matching App Modals */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 text-blue-400 border border-slate-700 flex items-center justify-center shadow-inner">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Start Instant Meeting
              </h3>
              <p className="text-xs text-slate-400">
                Launch an instant encrypted video conference
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto no-scrollbar flex-1">
            {/* Meeting Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Meeting Title <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Quick Sync, Client Review, Architecture Standup"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition font-medium"
                maxLength={200}
              />
            </div>

            {/* Custom Project Dropdown */}
            <div className="relative" ref={projectRef}>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                <span>Associate with Project</span>
              </label>

              <button
                type="button"
                onClick={() => setIsProjectOpen((prev) => !prev)}
                className="w-full flex items-center justify-between bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition shadow-xs cursor-pointer text-left"
              >
                <span className="truncate font-medium">
                  {selectedProject ? selectedProject.name : 'General Meeting (Organization-wide)'}
                </span>
                <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150', isProjectOpen && 'rotate-180 text-blue-600')} />
              </button>

              {isProjectOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl py-2 z-40 max-h-56 overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectId('');
                      setIsProjectOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-2.5 text-xs text-left transition cursor-pointer font-medium',
                      !projectId ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <span>General Meeting (Organization-wide)</span>
                    {!projectId && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                  {projects.map((p) => {
                    const isSelected = p.id === projectId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setProjectId(p.id);
                          setIsProjectOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-4 py-2.5 text-xs text-left transition cursor-pointer font-medium',
                          isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        <span className="truncate">{p.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-slate-500 mt-1">
                Project team members and clients will be invited to participate.
              </p>
            </div>

            {/* Info Box */}
            <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700 leading-relaxed">
                Upon starting, you will instantly enter the video room. A secure link will be generated to share with other attendees.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition border border-slate-200 cursor-pointer shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/25 transition cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  <span>Start Meeting Now</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
