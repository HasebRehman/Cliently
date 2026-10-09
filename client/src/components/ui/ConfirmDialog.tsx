import React from 'react';
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { Info, ShieldAlert } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  isLoading = false,
}) => {
  const headerDescription =
    description ||
    (isDestructive
      ? 'Please review the details below before proceeding.'
      : 'Action confirmation required.');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={title}
      description={headerDescription}
      showCloseButton={!isLoading}
    >
      <div className="space-y-5">
        {/* Warning / Notice Banner */}
        <div
          className={`flex items-start gap-3.5 p-4 rounded-xl border ${
            isDestructive
              ? 'bg-rose-50/70 border-rose-200 text-rose-950'
              : 'bg-blue-50/70 border-blue-200 text-blue-950'
          }`}
        >
          <div
            className={`p-2 rounded-lg shrink-0 mt-0.5 ${
              isDestructive
                ? 'bg-rose-100 text-rose-600'
                : 'bg-blue-100 text-blue-600'
            }`}
          >
            {isDestructive ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <Info className="w-5 h-5" />
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {isDestructive ? 'Warning: Irreversible / Archived Action' : 'Action Details'}
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed font-normal">
              {message}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            className="cursor-pointer font-medium"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
            className={`font-bold cursor-pointer ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20'
            }`}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
