import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient.js';
import { Input } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address').toLowerCase().trim(),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const ForgotPasswordPage: React.FC = () => {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      setFormError(null);
      setIsSubmitting(true);
      await api.post('/auth/forgot-password', { email: data.email }, { skipAuth: true, skipOrgHeader: true });
      setIsSuccess(true);
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-12 h-12 rounded-2xl bg-blue-600 items-center justify-center font-black text-2xl text-white shadow-lg shadow-blue-600/20 mb-4">
          C
        </div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Reset your password</h2>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Enter your email address and we'll send you a password reset link.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 py-8 px-6 shadow-xl rounded-3xl sm:px-10">
          {isSuccess ? (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Check your email</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                If an account exists with that email, a password reset link has been dispatched.
              </p>
              <div className="pt-2">
                <Link to="/login">
                  <Button variant="secondary" className="w-full">
                    Return to Sign In
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
                  type="email"
                  label="Email Address"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  leftAddon={<Mail className="w-4 h-4" />}
                  error={errors.email?.message}
                  {...register('email')}
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    size="md"
                    isLoading={isSubmitting}
                  >
                    Send Reset Link
                  </Button>
                </div>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
