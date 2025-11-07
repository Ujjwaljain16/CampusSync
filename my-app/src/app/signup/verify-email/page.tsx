/**
 * Email Verification Page
 * 
 * Shown after signup to remind user to check their email
 * and verify their account before logging in.
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { Mail, CheckCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const email = searchParams?.get('email') || '';
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResendEmail = async () => {
    if (!email) return;
    
    setResending(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      });

      if (error) throw error;

      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend email');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] relative overflow-hidden">
      {/* Animated Background - Matching CampusSync theme */}
      <div className="fixed inset-0">
        {/* Gradient orbs */}
        <div className="absolute top-[20%] left-[10%] w-[500px] h-[500px] bg-blue-500/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] right-[10%] w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)',
              backgroundSize: '50px 50px'
            }}
          />
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Card */}
          <div className="relative rounded-3xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl">
            {/* Content */}
            <div className="relative p-8">
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full blur-xl opacity-50 animate-pulse" />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg">
                    <Mail className="w-10 h-10 text-white" />
                  </div>
                </div>
              </div>

              {/* Title */}
              <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                Check Your Email
              </h1>
            
            <p className="text-center text-gray-300 mb-6">
              We&apos;ve sent a verification link to
            </p>

            {/* Email */}
            <div className="mb-8 p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border border-blue-400/20">
              <p className="text-center text-white font-medium break-all">
                {email || 'your email address'}
              </p>
            </div>

            {/* Instructions */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300">
                  Click the verification link in the email to activate your account
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300">
                  Once verified, you can log in and access your dashboard
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300">
                  Don&apos;t forget to check your spam folder if you don&apos;t see it
                </p>
              </div>
            </div>

            {/* Resend Email */}
            {email && (
              <div className="mb-6">
                <button
                  onClick={handleResendEmail}
                  disabled={resending || resent}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/20 text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {resending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : resent ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Email Sent!
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Resend Verification Email
                    </>
                  )}
                </button>

                {error && (
                  <p className="mt-2 text-sm text-red-400 text-center">
                    {error}
                  </p>
                )}
              </div>
            )}

            {/* Login Link */}
            <a
              href="/login"
              className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-lg shadow-blue-500/20"
            >
              Go to Login
              <ArrowRight className="w-4 h-4" />
            </a>

              {/* Note */}
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border border-blue-400/20">
                <p className="text-xs text-blue-300 text-center">
                  Note: The verification link expires in 1 hour. If it expires, you can request a new one.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-400">
            Need help? <a href="/support" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">Contact Support</a>
          </p>
        </div>
      </div>
    </div>
  );
}
