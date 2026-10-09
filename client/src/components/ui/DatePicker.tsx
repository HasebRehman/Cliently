import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

export interface DatePickerProps {
  label?: string;
  value?: string; // 'YYYY-MM-DD'
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  align?: 'left' | 'right';
  position?: 'auto' | 'top' | 'bottom';
}

export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  error,
  required,
  disabled,
  placeholder = 'Select target deadline...',
  align = 'left',
  position = 'auto',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const parsedValue = value ? new Date(value + 'T00:00:00') : null;
  const today = new Date();

  const [currentYear, setCurrentYear] = useState(parsedValue ? parsedValue.getFullYear() : today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(parsedValue ? parsedValue.getMonth() : today.getMonth());

  // Sync viewing month/year with value
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setCurrentYear(d.getFullYear());
        setCurrentMonth(d.getMonth());
      }
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      if (position === 'top') {
        setOpenUpward(true);
      } else if (position === 'bottom') {
        setOpenUpward(false);
      } else if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        // Popover height is ~330px
        if (spaceBelow < 340 && rect.top > 320) {
          setOpenUpward(true);
        } else {
          setOpenUpward(false);
        }
      }
    }
    setIsOpen(!isOpen);
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const selectDate = (year: number, month: number, day: number) => {
    const yStr = String(year);
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const fullStr = `${yStr}-${mStr}-${dStr}`;
    onChange(fullStr);
    setIsOpen(false);
  };

  const isToday = (year: number, month: number, day: number) => {
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  const isSelected = (year: number, month: number, day: number) => {
    if (!parsedValue) return false;
    return (
      parsedValue.getFullYear() === year &&
      parsedValue.getMonth() === month &&
      parsedValue.getDate() === day
    );
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={handleToggleOpen}
          className={cn(
            'w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium transition-all text-left',
            disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200' : 'cursor-pointer hover:border-slate-400',
            isOpen ? 'border-blue-600 ring-4 ring-blue-500/15' : 'border-slate-300',
            error && 'border-rose-500 ring-4 ring-rose-500/10'
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <span className={cn('truncate text-sm', value ? 'text-slate-900 font-semibold' : 'text-slate-400 font-normal')}>
              {value ? formatDisplayDate(value) : placeholder}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {value && !disabled && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Clear date"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown
              className={cn(
                'w-4 h-4 text-slate-400 transition-transform duration-200',
                isOpen && 'rotate-180 text-blue-600'
              )}
            />
          </div>
        </button>

        {/* Custom Calendar Popover */}
        {isOpen && (
          <div
            className={cn(
              'absolute z-[100] w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 animate-in fade-in duration-150 select-none',
              align === 'right' ? 'right-0' : 'left-0',
              openUpward ? 'bottom-full mb-2 slide-in-from-bottom-1' : 'top-full mt-1.5 slide-in-from-top-1'
            )}
          >
            {/* Calendar Navigation */}
            <div className="flex items-center justify-between mb-3.5">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="text-xs font-bold text-slate-900">
                {monthNames[currentMonth]} {currentYear}
              </div>

              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Weekdays Row */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {dayNames.map((d) => (
                <div key={d} className="text-[11px] font-bold text-slate-400 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {/* Previous month filler days */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => {
                const prevDay = daysInPrevMonth - firstDayOfMonth + i + 1;
                return (
                  <button
                    key={`prev-${i}`}
                    type="button"
                    onClick={() => {
                      if (currentMonth === 0) {
                        selectDate(currentYear - 1, 11, prevDay);
                      } else {
                        selectDate(currentYear, currentMonth - 1, prevDay);
                      }
                    }}
                    className="h-8 rounded-lg text-xs text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {prevDay}
                  </button>
                );
              })}

              {/* Current month days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const active = isSelected(currentYear, currentMonth, day);
                const currentDay = isToday(currentYear, currentMonth, day);

                return (
                  <button
                    key={`curr-${day}`}
                    type="button"
                    onClick={() => selectDate(currentYear, currentMonth, day)}
                    className={cn(
                      'h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center relative',
                      active
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                        : currentDay
                        ? 'text-blue-600 bg-blue-50 font-bold hover:bg-blue-100'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    )}
                  >
                    {day}
                    {currentDay && !active && (
                      <span className="absolute bottom-1 w-1 h-1 bg-blue-600 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Actions Footer */}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  selectDate(now.getFullYear(), now.getMonth(), now.getDate());
                }}
                className="font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
              >
                Today
              </button>

              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className="text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
    </div>
  );
};
