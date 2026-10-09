import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />
);

export const CardSkeleton: React.FC = () => (
  <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
    <div className="flex items-center justify-between">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>
    <Skeleton className="h-10 w-24" />
    <Skeleton className="h-4 w-48" />
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 4,
}) => (
  <div className="w-full rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-md shadow-slate-200/80">
    <div className="w-full overflow-x-auto no-scrollbar">
      <table className="w-full min-w-[850px] table-fixed text-left border-collapse">
        <thead className="bg-[#070F2B] border-b border-[#1B1A55]">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-5 py-4">
                <div className="h-3.5 bg-white/20 rounded-md w-24 animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="animate-pulse">
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} className="px-5 py-4">
                  <div className="h-4 bg-slate-200/80 rounded-md w-3/4" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
