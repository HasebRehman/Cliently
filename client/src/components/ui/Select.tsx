import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
  children?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, children, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-bold text-slate-800">
            {label}
            {props.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={cn(
              'w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-3.5 py-2.5 pr-10 text-sm font-medium transition cursor-pointer appearance-none focus:outline-none focus:ring-4 focus:ring-[#535C91]/15 focus:border-[#535C91] hover:border-slate-400 disabled:bg-slate-100 disabled:opacity-75 disabled:cursor-not-allowed shadow-sm',
              error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-500',
              className
            )}
            {...props}
          >
            {options
              ? options.map((option) => (
                  <option key={option.value} value={option.value} className="py-2 text-slate-800">
                    {option.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform" />
        </div>
        {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
        {helperText && !error && <p className="text-xs text-slate-500 mt-1">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
