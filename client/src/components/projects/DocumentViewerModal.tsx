import React, { useState, useEffect, useRef } from 'react';
import { renderAsync } from 'docx-preview';
import { ProjectFile } from '../../types/project.js';
import { formatDate, cn } from '../../lib/utils.js';
import {
  X,
  Download,
  ExternalLink,
  Loader2,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: ProjectFile | null;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  file,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const isPdf = Boolean(
    file && (file.fileType === 'pdf' || file.fileName.toLowerCase().endsWith('.pdf'))
  );
  const isDocx = Boolean(
    file && (file.fileType === 'word' || file.fileName.toLowerCase().endsWith('.docx') || file.fileName.toLowerCase().endsWith('.doc'))
  );

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  useEffect(() => {
    if (!isOpen || !file) {
      setIsLoading(true);
      setErrorMsg(null);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setErrorMsg(null);

    const loadDocument = async () => {
      try {
        const response = await fetch(file.fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to load document (HTTP ${response.status})`);
        }
        const blob = await response.blob();

        if (isCancelled) return;

        if (isPdf) {
          // Create PDF blob URL for reliable browser rendering
          const pdfBlob = new Blob([blob], { type: 'application/pdf' });
          const url = URL.createObjectURL(pdfBlob);
          setBlobUrl(url);
          setIsLoading(false);
        } else if (isDocx) {
          // Render DOCX into container
          if (docxContainerRef.current && !isCancelled) {
            docxContainerRef.current.innerHTML = '';
            await renderAsync(blob, docxContainerRef.current, undefined, {
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              className: 'docx-rendered-wrapper',
            });
          }
          if (!isCancelled) {
            setIsLoading(false);
          }
        } else {
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Document preview error:', err);
          setIsLoading(false);
          setErrorMsg(
            file.fileName.toLowerCase().endsWith('.doc')
              ? 'Older .doc format is best viewed with Microsoft Word or Google Docs.'
              : 'Could not render in-browser preview. Please download the document to view it.'
          );
        }
      }
    };

    loadDocument();

    return () => {
      isCancelled = true;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [isOpen, file?.id, file?.fileUrl]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !file) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'relative flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 transition-all duration-300 w-full',
          isFullscreen
            ? 'h-full max-w-none rounded-none'
            : 'max-w-5xl h-[90vh] max-h-[920px]'
        )}
      >
        {/* Modal Top Navigation / Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-900 text-white border-b border-slate-800 shrink-0 select-none">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-sm',
                isPdf
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              )}
            >
              {isPdf ? 'PDF' : 'DOC'}
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate max-w-md sm:max-w-xl" title={file.fileName}>
                {file.fileName}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{formatFileSize(file.fileSize)}</span>
                <span>•</span>
                <span>Uploaded {formatDate(file.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Action buttons + Prominent Cross Button */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={blobUrl || file.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-xl border border-slate-700 transition"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Open in Tab</span>
            </a>

            <a
              href={file.fileUrl}
              download={file.fileName}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition shadow-xs"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Prominent Cross Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-rose-600/80 rounded-xl transition bg-slate-800 border border-slate-700 ml-1 cursor-pointer"
              title="Close viewer (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Viewer Body */}
        <div className="relative flex-1 bg-slate-100 overflow-hidden flex flex-col items-center justify-center min-h-0">
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-xs">
              <Loader2 className="w-9 h-9 text-blue-600 animate-spin mb-3" />
              <p className="text-sm font-semibold text-slate-700">Loading document preview...</p>
              <p className="text-xs text-slate-400 mt-1">{file.fileName}</p>
            </div>
          )}

          {/* Error / Fallback State */}
          {errorMsg && (
            <div className="my-auto flex flex-col items-center text-center p-8 bg-white border border-slate-200 rounded-2xl max-w-md shadow-sm m-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">{file.fileName}</h4>
              <p className="text-xs text-slate-500 mb-4">{errorMsg}</p>
              <div className="flex items-center gap-2">
                <a
                  href={file.fileUrl}
                  download={file.fileName}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  Download Document
                </a>
              </div>
            </div>
          )}

          {/* PDF Viewer using Blob URL */}
          {isPdf && !errorMsg && blobUrl && (
            <iframe
              src={`${blobUrl}#toolbar=1&navpanes=0`}
              title={file.fileName}
              className="w-full h-full border-0 bg-white"
            />
          )}

          {/* Word Viewer Container */}
          {isDocx && !errorMsg && (
            <div className="w-full h-full overflow-y-auto p-4 sm:p-8 flex justify-center">
              <div
                ref={docxContainerRef}
                className="docx-viewer-container bg-white shadow-md rounded-xl p-6 sm:p-12 max-w-4xl w-full min-h-full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
