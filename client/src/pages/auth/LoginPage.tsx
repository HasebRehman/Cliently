import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Input } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { validateRedirectUrl } from '../../lib/security.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';
import { LogIn, Lock, Mail, AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CRITICAL SECURITY REQUIREMENT: Validate ?redirect= against Open Redirects
  const redirectParam = searchParams.get('redirect');
  const safeRedirectUrl = validateRedirectUrl(redirectParam, '/dashboard');
  const isRevoked = searchParams.get('revoked') === 'true';
  const revocationReason = searchParams.get('reason');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setFormError(null);
      setIsSubmitting(true);
      await login(data.email, data.password);
      success('Logged in successfully');
      navigate(safeRedirectUrl, { replace: true });
    } catch (err: any) {
      const msg = getFriendlyErrorMessage(err);
      setFormError(msg);
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
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Sign in to Cliently</h2>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Or{' '}
          <Link to="/register" className="font-bold text-blue-600 hover:text-blue-700 transition">
            create a new organization account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 py-8 px-6 shadow-xl rounded-3xl sm:px-10">
          {isRevoked && (
            <div className="mb-6 p-3.5 bg-orange-50 border border-orange-200 rounded-2xl flex items-start gap-3 text-orange-800 text-xs font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-orange-600 mt-0.5" />
              <span>{revocationReason || 'Your session has ended or access was removed by the organization owner.'}</span>
            </div>
          )}

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

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 transition"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                leftAddon={<Lock className="w-4 h-4" />}
                error={errors.password?.message}
                {...register('password')}
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                size="md"
                isLoading={isSubmitting}
                leftIcon={<LogIn className="w-4 h-4" />}
              >
                Sign In
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 font-medium">
              Protected by enterprise OAuth 2.0 & secure httpOnly session cookies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
