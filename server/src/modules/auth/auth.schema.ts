import { z } from 'zod';
import { validatePasswordStrength } from '../../utils/passwordPolicy.js';

const passwordSchema = z.string().superRefine((val, ctx) => {
  const check = validatePasswordStrength(val);
  if (!check.isValid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: check.message || 'Invalid password',
    });
  }
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: passwordSchema,
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().min(1, 'Last name is required').trim(),
  orgName: z.string().min(2, 'Organization name must be at least 2 characters').trim(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required').trim(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required').trim(),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').trim().optional(),
  lastName: z.string().trim().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
