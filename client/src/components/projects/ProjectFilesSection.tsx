import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Project, ProjectFile } from '../../types/project.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { api } from '../../lib/apiClient.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { DocumentViewerModal } from './DocumentViewerModal.js';
import { formatDate, getFriendlyErrorMessage, cn } from '../../lib/utils.js';
import {
  FileText,
  UploadCloud,
  Download,
  Eye,
  Trash2,
  Loader2,
  Plus,
} from 'lucide-react';

interface ProjectFilesSectionProps {
  project: Project;
}

export const ProjectFilesSection: React.FC<ProjectFilesSectionProps> = ({ project }) => {
  const { currentRole } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ProjectFile | null>(null);
  const [viewingFile, setViewingFile] = useState<ProjectFile | null>(null);

  const files = project.files || [];
  const maxFiles = 5;
  const remainingSlots = Math.max(0, maxFiles - files.length);
  const canManageFiles = currentRole === 'OWNER' || currentRole === 'MEMBER';

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Upload mutation
  const uploadFilesMutation = useMutation({
    mutationFn: async (uploadedList: Array<{ fileName: string; fileUrl: string; fileType: 'pdf' | 'word'; fileSize: number }>) => {
      return api.post(`/projects/${project.id}/files`, { files: uploadedList });
    },
    onSuccess: () => {
      success('Files uploaded successfully');
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
    onSettled: () => {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  // Delete mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return api.delete(`/projects/${project.id}/files/${fileId}`);
    },
    onSuccess: () => {
      success('File deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setFileToDelete(null);
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    if (selectedFiles.length > remainingSlots) {
      error(`You can only upload up to ${remainingSlots} more file${remainingSlots === 1 ? '' : 's'} (Max ${maxFiles} total).`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate file extensions
    const allowedExtensions = ['.pdf', '.doc', '.docx'];
    for (const file of selectedFiles) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(ext)) {
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

    setIsUploading(true);
    try {
      const uploadedPayloads: Array<{ fileName: string; fileUrl: string; fileType: 'pdf' | 'word'; fileSize: number }> = [];

      for (const file of selectedFiles) {
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
          uploadedPayloads.push({
            fileName: fileObj.fileName,
            fileUrl: fileObj.url,
            fileType: fileObj.fileType || (file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'word'),
            fileSize: fileObj.fileSize || file.size,
          });
        }
      }

      if (uploadedPayloads.length > 0) {
        uploadFilesMutation.mutate(uploadedPayloads);
      } else {
        setIsUploading(false);
      }
    } catch (err) {
      setIsUploading(false);
      error(getFriendlyErrorMessage(err));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-slate-900">Project Documents & Files</h2>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-semibold',
                  files.length >= maxFiles
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-600'
                )}
              >
                {files.length} / {maxFiles} Files
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Attach specifications, contracts, brand briefs, or deliverables in PDF or Word format (Max 5 files).
            </p>
          </div>
        </div>

        {canManageFiles && (
          <div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={
                isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )
              }
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || remainingSlots === 0}
              title={remainingSlots === 0 ? 'Maximum 5 files reached' : 'Upload PDF or Word documents'}
            >
              {isUploading ? 'Uploading...' : remainingSlots === 0 ? 'Max Limit Reached' : 'Upload Document'}
            </Button>
          </div>
        )}
      </div>

      {/* Files Grid / Empty State */}
      {files.length === 0 ? (
        <div
          onClick={() => canManageFiles && fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl text-center transition-all',
            canManageFiles
              ? 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 cursor-pointer'
              : 'border-slate-200 bg-slate-50/50'
          )}
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3 shadow-sm">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-800">No project documents uploaded yet</p>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            {canManageFiles
              ? 'Click here to upload up to 5 PDF or Word (.docx, .doc) files (up to 25MB each).'
              : 'No documents have been attached to this project.'}
          </p>
          {canManageFiles && (
            <div className="mt-4">
              <Button variant="secondary" size="sm" leftIcon={<UploadCloud className="w-4 h-4" />}>
                Browse Files
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file) => {
            const isPdf = file.fileType === 'pdf' || file.fileName.toLowerCase().endsWith('.pdf');
            return (
              <div
                key={file.id}
                className="group relative flex flex-col justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all duration-200"
              >
                <div
                  onClick={() => setViewingFile(file)}
                  className="flex items-start gap-3 cursor-pointer"
                  title="Click to view document"
                >
                  {/* File Type Badge / Icon */}
                  <div
                    className={cn(
                      'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-xs shadow-xs transition-transform group-hover:scale-105',
                      isPdf
                        ? 'bg-rose-50 border border-rose-100 text-rose-600'
                        : 'bg-blue-50 border border-blue-100 text-blue-600'
                    )}
                  >
                    {isPdf ? 'PDF' : 'DOC'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors"
                      title={file.fileName}
                    >
                      {file.fileName}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                      <span>{formatFileSize(file.fileSize)}</span>
                      <span>•</span>
                      <span>{formatDate(file.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setViewingFile(file)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                      title="View document in modal"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    <a
                      href={file.fileUrl}
                      download={file.fileName}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                      title="Download file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>

                  {canManageFiles && (
                    <button
                      type="button"
                      onClick={() => setFileToDelete(file)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        isOpen={Boolean(viewingFile)}
        onClose={() => setViewingFile(null)}
        file={viewingFile}
      />

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <ConfirmDialog
          isOpen={Boolean(fileToDelete)}
          onClose={() => setFileToDelete(null)}
          onConfirm={() => deleteFileMutation.mutate(fileToDelete.id)}
          title="Delete Project Document?"
          message={`Are you sure you want to delete "${fileToDelete.fileName}"? This action cannot be undone.`}
          confirmLabel="Delete Document"
          isDestructive={true}
          isLoading={deleteFileMutation.isPending}
        />
      )}
    </div>
  );
};
