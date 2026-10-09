import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../../lib/apiClient.js';
import { Button } from '../../components/ui/Button.js';
import { getFriendlyErrorMessage } from '../../lib/utils.js';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function verify() {
      if (!token) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage('Verification token is missing from the link.');
        }
        return;
      }

      try {
        await api.post('/auth/verify-email', { token }, { skipAuth: true, skipOrgHeader: true });
        if (isMounted) {
          setStatus('success');
        }
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage(getFriendlyErrorMessage(err));
        }
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="bg-white border border-slate-200 py-10 px-6 shadow-xl rounded-3xl sm:px-10">
          {status === 'verifying' && (
            <div className="space-y-4">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
              <h2 className="text-xl font-bold text-slate-900">Verifying your email...</h2>
              <p className="text-xs text-slate-500 font-medium">Please wait while we confirm your email address.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-black text-slate-900">Email Verified!</h2>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Your email address has been successfully verified. You can now sign in to your Cliently account.
              </p>
              <div className="pt-4">
                <Link to="/login">
                  <Button variant="primary" className="w-full">
                    Continue to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-black text-slate-900">Verification Failed</h2>
              <p className="text-xs text-rose-600 font-medium leading-relaxed">{errorMessage}</p>
              <div className="pt-4">
                <Link to="/login">
                  <Button variant="secondary" className="w-full">
                    Return to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
