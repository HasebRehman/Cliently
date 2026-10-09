import React from 'react';
import { cn } from '../../lib/utils.js';

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, ...props }) => (
  <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar max-h-[520px] rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/80">
    <table className={cn('w-full min-w-full text-left text-sm text-slate-700', className)} {...props} />
  </div>
);

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...props }) => (
  <thead className={cn('bg-[#070F2B] text-white text-[11px] uppercase font-bold tracking-wider font-heading sticky top-0 z-10 shadow-xs', className)} {...props} />
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, ...props }) => (
  <tbody className={cn('divide-y divide-slate-100', className)} {...props} />
);

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className, ...props }) => (
  <tr className={cn('[tbody_&]:hover:bg-slate-50/80 transition-colors', className)} {...props} />
);

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...props }) => (
  <th className={cn('px-5 py-3.5 whitespace-nowrap text-slate-100 font-bold', className)} {...props} />
);

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...props }) => (
  <td className={cn('px-5 py-3.5 whitespace-nowrap text-sm', className)} {...props} />
);
