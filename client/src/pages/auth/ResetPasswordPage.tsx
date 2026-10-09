import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../../lib/apiClient.js';
import { Input } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react';

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one digit'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      setFormError('Reset token is missing or invalid.');
      return;
    }

    try {
      setFormError(null);
      setIsSubmitting(true);
      await api.post('/auth/reset-password', {
        token,
        newPassword: data.newPassword,
      }, { skipAuth: true, skipOrgHeader: true });

      setIsSuccess(true);
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center bg-white border border-slate-200 p-8 rounded-3xl shadow-xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid Reset Link</h2>
          <p className="text-xs text-slate-500 font-medium mb-6">This password reset link is missing a valid token.</p>
          <Link to="/forgot-password">
            <Button variant="primary" className="w-full">
              Request New Reset Link
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-12 h-12 rounded-2xl bg-blue-600 items-center justify-center font-black text-2xl text-white shadow-lg shadow-blue-600/20 mb-4">
          C
        </div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Create new password</h2>
        <p className="mt-1 text-xs text-slate-500 font-medium">Please enter and confirm your new password below.</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 py-8 px-6 shadow-xl rounded-3xl sm:px-10">
          {isSuccess ? (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Password Reset Successful!</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Your password has been changed. You can now sign in with your new password.
              </p>
              <div className="pt-2">
                <Link to="/login">
                  <Button variant="primary" className="w-full">
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {formError && (
                <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700 text-xs font-medium animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  type="password"
                  label="New Password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  leftAddon={<Lock className="w-4 h-4" />}
                  helperText="Min 8 characters with upper, lower, & digit"
                  error={errors.newPassword?.message}
                  {...register('newPassword')}
                />

                <Input
                  type="password"
                  label="Confirm New Password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  leftAddon={<Lock className="w-4 h-4" />}
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    size="md"
                    isLoading={isSubmitting}
                  >
                    Reset Password
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
