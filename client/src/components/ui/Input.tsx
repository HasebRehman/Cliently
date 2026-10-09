import React from 'react';
import { cn } from '../../lib/utils.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, leftAddon, rightAddon, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-bold text-slate-800">
            {label}
            {props.required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center rounded-xl shadow-sm">
          {leftAddon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">
              {leftAddon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 rounded-xl px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-[#535C91]/20 focus:border-[#535C91] disabled:bg-slate-100 disabled:opacity-75 disabled:cursor-not-allowed',
              leftAddon && 'pl-9',
              rightAddon && 'pr-9',
              error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-500',
              className
            )}
            {...props}
          />
          {rightAddon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-sm">
              {rightAddon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
        {helperText && !error && <p className="text-xs text-slate-500 mt-1">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
