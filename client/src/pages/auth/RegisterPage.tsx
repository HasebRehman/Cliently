import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient.js';
import { Input } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';
import { Mail, Lock, User, Building, AlertCircle, CheckCircle } from 'lucide-react';

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').trim(),
    lastName: z.string().min(1, 'Last name is required').trim(),
    email: z.string().min(1, 'Email is required').email('Invalid email address').toLowerCase().trim(),
    orgName: z.string().min(2, 'Organization name must be at least 2 characters').trim(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one digit'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export const RegisterPage: React.FC = () => {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setFormError(null);
      setIsSubmitting(true);
      await api.post('/auth/register', {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        orgName: data.orgName,
        password: data.password,
      }, { skipAuth: true, skipOrgHeader: true });

      setIsSuccess(true);
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Account Created!</h2>
          <p className="mt-2 text-xs text-slate-600 font-medium leading-relaxed">
            We have sent a verification link to your email address. Please check your inbox and verify your account to get started.
          </p>
          <div className="mt-6">
            <Link to="/login">
              <Button variant="primary" className="w-full">
                Return to Sign In
              </Button>
            </Link>
          </div>
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
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Create your Cliently Account</h2>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-blue-600 hover:text-blue-700 transition">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 py-8 px-6 shadow-xl rounded-3xl sm:px-10">
          {formError && (
            <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700 text-xs font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="First Name"
                required
                autoComplete="given-name"
                placeholder="Jane"
                leftAddon={<User className="w-4 h-4" />}
                error={errors.firstName?.message}
                {...register('firstName')}
              />
              <Input
                label="Last Name"
                required
                autoComplete="family-name"
                placeholder="Doe"
                leftAddon={<User className="w-4 h-4" />}
                error={errors.lastName?.message}
                {...register('lastName')}
              />
            </div>

            <Input
              type="email"
              label="Email Address"
              required
              autoComplete="email"
              placeholder="jane@agency.com"
              leftAddon={<Mail className="w-4 h-4" />}
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Organization Name"
              required
              placeholder="Acme Studio"
              leftAddon={<Building className="w-4 h-4" />}
              error={errors.orgName?.message}
              {...register('orgName')}
            />

            <Input
              type="password"
              label="Password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              leftAddon={<Lock className="w-4 h-4" />}
              helperText="Min 8 characters with upper, lower, & digit"
              error={errors.password?.message}
              {...register('password')}
            />

            <Input
              type="password"
              label="Confirm Password"
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
                Create Account & Organization
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
