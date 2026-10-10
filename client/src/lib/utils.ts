import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format currency strictly without float precision corruption.
 */
export function formatMoney(amount: number | string | undefined | null, currency = 'USD'): string {
  if (amount === undefined || amount === null || amount === '') {
    return `$0.00 ${currency}`;
  }

  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num)) {
    return `$0.00 ${currency}`;
  }

  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'CA$',
    AUD: 'AU$',
    JPY: '¥',
    CHF: 'CHF ',
    NZD: 'NZ$',
  };

  const symbol = symbols[currency.toUpperCase()] || `${currency} `;
  return `${symbol}${formattedNumber}`;
}

export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function formatDateTime(date: string | Date | undefined | null): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Extracts a safe, user-friendly error message from API errors.
 * Never leaks raw server traces, tokens, or unhandled internals.
 */
export function getFriendlyErrorMessage(err: unknown): string {
  if (!err) return 'An unexpected error occurred. Please try again.';

  if (typeof err === 'string') {
    return err;
  }

  const apiErr = err as {
    response?: {
      status?: number;
      data?: {
        error?: {
          code?: string;
          message?: string;
          details?: Array<{ field?: string; message: string }> | unknown;
        };
        message?: string;
      };
    };
    code?: string;
    message?: string;
    status?: number;
  };

  const status = apiErr.response?.status || apiErr.status;
  const errorCode = apiErr.response?.data?.error?.code || apiErr.code;
  const serverMsg = apiErr.response?.data?.error?.message || apiErr.response?.data?.message || apiErr.message;

  if (status === 429 || errorCode === 'RATE_LIMIT_EXCEEDED') {
    return serverMsg || 'Too many requests. Please wait a moment before trying again.';
  }

  if (status === 401 || errorCode === 'UNAUTHORIZED' || errorCode === 'INVALID_CREDENTIALS') {
    return 'Invalid email or password.';
  }

  if (status === 403 || errorCode === 'FORBIDDEN' || errorCode === 'TENANT_FORBIDDEN') {
    return 'You do not have permission to perform this action.';
  }

  if (errorCode === 'PLAN_LIMIT_REACHED') {
    return serverMsg || 'You have reached your current plan limit. Please upgrade your organization plan.';
  }

  if (errorCode === 'DUPLICATE_ENTRY') {
    return serverMsg || 'A record with these details already exists.';
  }

  if (errorCode === 'RECORD_NOT_FOUND' || status === 404) {
    return 'The requested resource was not found.';
  }

  if (errorCode === 'VALIDATION_ERROR') {
    const details = apiErr.response?.data?.error?.details;
    if (Array.isArray(details) && details.length > 0 && details[0]?.message) {
      return details[0].message;
    }
    return serverMsg || 'Invalid input data. Please check the fields and try again.';
  }

  if (serverMsg && typeof serverMsg === 'string') {
    const lower = serverMsg.toLowerCase();
    if (lower.includes("can't reach database") || lower.includes('econnrefused')) {
      return 'Unable to reach the database server. Please ensure the backend database is running.';
    }
    if (
      !lower.includes('stack') &&
      !lower.includes('error:') &&
      !lower.includes('prisma') &&
      !lower.includes('invocation') &&
      !serverMsg.includes('\n')
    ) {
      return serverMsg;
    }
  }

  return 'An unexpected error occurred while processing your request. Please try again.';
}
