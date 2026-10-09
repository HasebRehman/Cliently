import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      leftIcon,
      rightIcon,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.97] cursor-pointer font-heading';

    const variants = {
      primary:
        'bg-gradient-to-r from-[#1B1A55] to-[#535C91] hover:from-[#141344] hover:to-[#434b7a] text-white shadow-md hover:shadow-lg shadow-[#1B1A55]/25 focus:ring-[#535C91] focus:ring-offset-white border border-[#535C91]/60',
      secondary:
        'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm focus:ring-[#535C91] focus:ring-offset-white',
      outline:
        'bg-transparent hover:bg-slate-100 text-slate-700 border border-slate-300 hover:border-[#535C91] focus:ring-[#535C91] focus:ring-offset-white',
      danger:
        'bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow-md shadow-rose-600/20 focus:ring-rose-500 focus:ring-offset-white',
      ghost:
        'bg-transparent hover:bg-slate-100 text-slate-700 hover:text-slate-900 focus:ring-slate-300 focus:ring-offset-white',
      link:
        'bg-transparent text-[#535C91] hover:text-[#1B1A55] underline-offset-4 hover:underline p-0 focus:ring-0',
    };

    const sizes = {
      sm: 'text-xs px-3 py-1.5 gap-1.5',
      md: 'text-sm px-4 py-2 gap-2',
      lg: 'text-base px-5 py-2.5 gap-2.5',
    };

    const isLink = variant === 'link';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          variants[variant],
          !isLink && sizes[size],
          isLoading && 'cursor-wait',
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>{children}</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
