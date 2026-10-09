import React from 'react';
import { Button } from './Button.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  isLoading = false,
}) => {
  if (totalPages <= 1 && !totalItems) return null;

  return (
    <div className="flex items-center justify-between px-2 py-3">
      <div className="text-xs text-slate-500">
        {totalItems !== undefined ? (
          <span>
            Total results: <strong className="text-slate-800 font-semibold">{totalItems}</strong>
          </span>
        ) : (
          <span>Page {currentPage} of {totalPages}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
        >
          Previous
        </Button>

        <span className="text-xs font-semibold px-2 text-slate-700">
          {currentPage} / {totalPages || 1}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
