import { z } from 'zod';

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD'] as const;

export const updateOrgSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim().optional(),
  logoUrl: z
    .string()
    .url('Must be a valid URL')
    .refine((url) => url.startsWith('https://'), {
      message: 'logoUrl must use HTTPS protocol only',
    })
    .nullable()
    .optional(),
  currency: z
    .enum(SUPPORTED_CURRENCIES, {
      errorMap: () => ({
        message: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
      }),
    })
    .optional(),
  defaultTaxRate: z
    .number()
    .min(0, 'Tax rate must be at least 0%')
    .max(100, 'Tax rate cannot exceed 100%')
    .optional(),
  invoicePrefix: z
    .string()
    .min(1, 'Invoice prefix must be at least 1 character')
    .max(10, 'Invoice prefix cannot exceed 10 characters')
    .regex(
      /^[A-Za-z0-9\-_]+$/,
      'Invoice prefix must contain only alphanumeric characters, dashes, or underscores'
    )
    .trim()
    .optional(),
});

export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
