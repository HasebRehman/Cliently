import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { Input } from '../../components/ui/Input.js';
import { Button } from '../../components/ui/Button.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';
import { MailCheck, Lock, User, AlertCircle, Building2, ArrowRight } from 'lucide-react';

const acceptInviteSchema = z
  .object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one digit')
      .optional()
      .or(z.literal('')),
    confirmPassword: z.string().optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      if (data.password && data.password.length > 0) {
        return data.password === data.confirmPassword;
      }
      return true;
    },
    {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }
  );

type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>;

interface InviteDetails {
  email: string;
  role: string;
  organizationName: string;
  organizationLogo?: string | null;
  expiresAt: string;
  hasAccount: boolean;
}

export const AcceptInvitePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { isAuthenticated, refreshUserData } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch and validate invite token details
  const {
    data: inviteData,
    isLoading,
    error: inviteError,
  } = useQuery<InviteDetails>({
    queryKey: ['invite-details', token],
    queryFn: async () => {
      if (!token) throw new Error('Invite token is missing from the URL.');
      const data = await api.get<InviteDetails>(`/invites/details?token=${encodeURIComponent(token)}`, {
        skipOrgHeader: true,
      });
      return data;
    },
    enabled: !!token,
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
  });

  const onAccept = async (data: AcceptInviteFormData) => {
    if (!token) {
      setFormError('Invite token is missing from the URL.');
      return;
    }

    try {
      setFormError(null);
      setIsSubmitting(true);

      const payload: Record<string, any> = { token };
      if (!isAuthenticated && !inviteData?.hasAccount) {
        if (!data.password) {
          setFormError('Please choose a password to complete registration.');
          setIsSubmitting(false);
          return;
        }
        payload.password = data.password;
        payload.firstName = data.firstName;
        payload.lastName = data.lastName;
      }

      await api.post('/invites/accept', payload, { skipOrgHeader: true });

      success('Invitation accepted successfully!');
      if (isAuthenticated) {
        await refreshUserData();
        navigate('/dashboard');
      } else {
        navigate(`/login?email=${encodeURIComponent(inviteData?.email || '')}`);
      }
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
          <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid Invite Link</h2>
          <p className="text-xs text-slate-500 font-medium mb-6">This invitation link is missing a valid token parameter.</p>
          <Link to="/login">
            <Button variant="primary" className="w-full">
              Go to Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-12 px-4">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-slate-500 font-medium">Verifying invitation link...</p>
      </div>
    );
  }

  if (inviteError) {
    const errorMsg = getFriendlyErrorMessage(inviteError);
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center bg-white border border-slate-200 p-8 rounded-3xl shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-4 text-rose-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Invitation Inactive or Expired</h2>
          <p className="text-xs text-slate-600 font-medium leading-relaxed mb-6">
            {errorMsg.includes('inactive') || errorMsg.includes('invalid')
              ? 'This invite link is no longer active. If multiple invitations were sent, please check your inbox and click the link in the most recent email.'
              : errorMsg}
          </p>
          <div className="space-y-3">
            <Link to="/login">
              <Button variant="primary" className="w-full">
                Sign In to Account
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
          <MailCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Join {inviteData?.organizationName || 'Organization'}</h2>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Invitation for <span className="text-blue-600 font-bold">{inviteData?.email}</span>
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

          <div className="mb-6 p-4 bg-blue-50/60 border border-blue-100 rounded-2xl flex items-center gap-3">
            <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="text-xs text-slate-700">
              <div className="font-bold text-slate-900">{inviteData?.organizationName}</div>
              <div className="text-slate-500 text-[11px] font-medium">Role: {inviteData?.role}</div>
            </div>
          </div>

          {isAuthenticated ? (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                You are currently signed in. Click below to accept the invitation and add this organization to your account.
              </p>
              <Button
                variant="primary"
                className="w-full"
                size="md"
                onClick={handleSubmit(onAccept)}
                isLoading={isSubmitting}
              >
                Accept & Join Organization
              </Button>
            </div>
          ) : inviteData?.hasAccount ? (
            <div className="space-y-4 text-center">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 font-medium">
                An account with <strong className="text-slate-900">{inviteData?.email}</strong> already exists. Sign in with your password to accept this invitation.
              </div>
              <Link to={`/login?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`}>
                <Button variant="primary" className="w-full inline-flex items-center justify-center gap-2">
                  <span>Sign In to Accept</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onAccept)} className="space-y-4">
              <div className="text-xs text-slate-500 font-medium mb-2">
                Choose a password to set up your account and join the portal.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  placeholder="Jane"
                  leftAddon={<User className="w-4 h-4" />}
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label="Last Name"
                  placeholder="Doe"
                  leftAddon={<User className="w-4 h-4" />}
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

              <Input
                type="password"
                label="Set Password"
                placeholder="••••••••"
                leftAddon={<Lock className="w-4 h-4" />}
                helperText="Min 8 chars, uppercase, lowercase, digit"
                error={errors.password?.message}
                {...register('password')}
              />

              <Input
                type="password"
                label="Confirm Password"
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
                  Accept & Create Account
                </Button>
              </div>

              <div className="text-center pt-2 text-xs text-slate-500 font-medium">
                Already have an account?{' '}
                <Link
                  to={`/login?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
                  className="text-blue-600 hover:text-blue-700 font-bold underline"
                >
                  Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
