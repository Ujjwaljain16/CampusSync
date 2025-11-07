"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle } from "lucide-react";
import {
  FormField,
  FormLabel,
  CVButton,
  CVAlert,
} from "@/components/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [sessionEstablished, setSessionEstablished] = useState(false);

  // Check for recovery token and establish session
  useEffect(() => {
    const handlePasswordReset = async () => {
      console.log('[INFO] [Reset Password] Initializing password reset flow...');
      console.log('[INFO] [Reset Password] Full URL:', window.location.href);
      console.log('[INFO] [Reset Password] Hash:', window.location.hash);
      console.log('[INFO] [Reset Password] Search:', window.location.search);
      
      const supabase = createClient();
      
      try {
        // IMPORTANT: Check URL format first to diagnose the issue
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        console.log('[INFO] [Reset Password] Query params:', {
          token_hash: params.get('token_hash'),
          type: params.get('type'),
          code: params.get('code'),
          error: params.get('error'),
        });
        
        console.log('[INFO] [Reset Password] Hash params:', {
          access_token: hashParams.get('access_token'),
          refresh_token: hashParams.get('refresh_token'),
          type: hashParams.get('type'),
        });
        
        // Check for error in URL params first
        const urlError = params.get('error');
        const errorDescription = params.get('error_description');
        
        if (urlError) {
          console.log('[ERROR] [Reset Password] URL contains error:', urlError, errorDescription);
          setError(errorDescription?.replace(/\+/g, ' ') || 'Invalid or expired reset link. Please request a new one.');
          setIsValidating(false);
          return;
        }
        
        // Check if email template is still using old format (hash fragments)
        const hasOldFormat = window.location.hash.includes('access_token');
        if (hasOldFormat) {
          console.warn('[WARNING] [Reset Password] DETECTED OLD EMAIL TEMPLATE FORMAT!');
          console.warn('[WARNING] Email link uses #access_token= (implicit flow)');
          console.warn('[WARNING] TEMPORARY WORKAROUND: Handling old format, but you MUST update the email template!');
          console.warn('[WARNING] Update Supabase email template to use ?token_hash= (PKCE flow)');
          
          // TEMPORARY: Handle old format by setting session from hash tokens
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const type = hashParams.get('type');
          
          if (accessToken && type === 'recovery') {
            console.log('[DEBUG] [Reset Password] Attempting to set session from hash tokens (TEMPORARY FIX)...');
            
            try {
              const { data, error: setSessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '',
              });
              
              if (setSessionError) {
                console.error('[ERROR] [Reset Password] Failed to set session from hash:', setSessionError);
                setError('Failed to verify reset link. Please request a new one.');
                setIsValidating(false);
                return;
              }
              
              if (data?.session) {
                console.log('[SUCCESS] [Reset Password] Session established from hash tokens');
                console.log('[WARNING] [Reset Password] IMPORTANT: Update your email template to use ?token_hash= format!');
                setSessionEstablished(true);
                setIsValidating(false);
                return;
              }
            } catch (err) {
              console.error('[ERROR] [Reset Password] Exception setting session from hash:', err);
              setError('Failed to verify reset link. Please request a new one.');
              setIsValidating(false);
              return;
            }
          }
          
          setError('Invalid reset link format. Email template needs to be updated. See console for details.');
          setIsValidating(false);
          return;
        }
        
        // Check if we already have a valid session (PKCE flow completed by middleware)
        const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[ERROR] [Reset Password] Session error:', sessionError);
          setError('Failed to verify reset link. Please request a new one.');
          setIsValidating(false);
          return;
        }

        if (existingSession) {
          console.log('[SUCCESS] [Reset Password] Valid session found via PKCE flow');
          console.log('[SUCCESS] [Reset Password] Session user:', existingSession.user.email);
          setSessionEstablished(true);
          setIsValidating(false);
          return;
        }

        console.log('[INFO] [Reset Password] No existing session, checking for token_hash in URL...');
        
        // For password recovery, we need to exchange the token_hash using verifyOtp
        const tokenHash = params.get('token_hash');
        const type = params.get('type');
        
        if (tokenHash && type === 'recovery') {
          console.log('[DEBUG] [Reset Password] Found token_hash, exchanging for session...');
          
          try {
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'recovery',
            });
            
            if (verifyError) {
              console.error('[ERROR] [Reset Password] Failed to verify OTP:', verifyError);
              setError('Invalid or expired reset link. Please request a new one.');
              setIsValidating(false);
              return;
            }
            
            if (data?.session) {
              console.log('[SUCCESS] [Reset Password] Session established via verifyOtp');
              console.log('[SUCCESS] [Reset Password] Session user:', data.session.user.email);
              setSessionEstablished(true);
              setIsValidating(false);
              return;
            }
          } catch (err) {
            console.error('[ERROR] [Reset Password] Exception during OTP verification:', err);
            setError('Failed to verify reset link. Please try again.');
            setIsValidating(false);
            return;
          }
        }

        // No session found
        console.log('[ERROR] [Reset Password] No valid session found after all attempts');
        console.log('[INFO] [Reset Password] Troubleshooting:');
        console.log('   1. Check if email template uses ?token_hash= (not #access_token=)');
        console.log('   2. Link expires after 1 hour');
        console.log('   3. Links are one-time use only');
        
        setError('Could not establish session. Link may be expired or invalid. Please request a new password reset.');
        setIsValidating(false);

      } catch (err) {
        console.error('[ERROR] [Reset Password] Exception during initialization:', err);
        setError('An error occurred while verifying your reset link. Please try again.');
        setIsValidating(false);
      }
    };
    
    handlePasswordReset();
  }, []);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      console.log('[INFO] [Reset Password] Attempting to update password...');
      console.log('[INFO] [Reset Password] Session established flag:', sessionEstablished);
      
      const supabase = createClient();
      
      // Verify we still have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('[INFO] [Reset Password] Session check:', {
        hasSession: !!session,
        sessionError: sessionError?.message,
        userId: session?.user?.id,
        userEmail: session?.user?.email
      });
      
      if (sessionError || !session) {
        console.error('[ERROR] [Reset Password] No valid session found');
        console.error('[ERROR] [Reset Password] Session was established:', sessionEstablished);
        console.error('[ERROR] [Reset Password] This means the session was lost between page load and form submit');
        console.error('[ERROR] [Reset Password] Possible causes:');
        console.error('   1. Session cookies were blocked or cleared');
        console.error('   2. Session expired (should not happen this quickly)');
        console.error('   3. Storage issue (localStorage/cookies)');
        throw new Error('Session lost. Please try again or request a new password reset link.');
      }

      console.log('[SUCCESS] [Reset Password] Session valid, updating password...');
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        console.error('[ERROR] [Reset Password] Update error:', updateError);
        throw updateError;
      }

      console.log('[SUCCESS] [Reset Password] Password updated successfully');
      setSuccess(true);
      
      // Sign out after password reset for security
      await supabase.auth.signOut();
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login?message=Password reset successful. Please login with your new password.');
      }, 2000);

    } catch (err: unknown) {
      console.error('[ERROR] [Reset Password] Exception:', err);
      const message = err instanceof Error ? err.message : "Failed to reset password";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [password, confirmPassword, router, sessionEstablished]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating particles */}
        <div className="absolute top-20 left-[10%] w-2 h-2 bg-blue-400/40 rounded-full animate-float" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-40 right-[15%] w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-float" style={{ animationDelay: '0.5s', animationDuration: '4s' }} />
        <div className="absolute bottom-32 left-[20%] w-2.5 h-2.5 bg-purple-400/30 rounded-full animate-float" style={{ animationDelay: '1s', animationDuration: '5s' }} />
        
        {/* Gradient orbs */}
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-br from-blue-500/30 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-br from-emerald-500/30 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
        
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 transition-transform duration-300 group-hover:scale-110">
              <Image
                src="/logo-clean.svg"
                alt="CampusSync"
                width={40}
                height={40}
                className="w-full h-full object-contain transition-all duration-300 group-hover:brightness-110 group-hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]"
                priority
              />
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors duration-300">
                CampusSync
              </span>
              <span className="text-[9px] font-medium text-gray-400 tracking-wider uppercase">
                Verified Credentials
              </span>
            </div>
          </Link>

          {/* Back to Login */}
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white transition-all duration-300 group backdrop-blur-sm"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-semibold">Back to Login</span>
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-md px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="relative group">
          {/* Glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/50 via-emerald-500/50 to-blue-500/50 rounded-3xl blur-2xl opacity-0 group-hover:opacity-75 transition-opacity duration-700 animate-gradient" />
          
          <div className="relative rounded-3xl p-6 sm:p-8 lg:p-10 border border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl shadow-2xl">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
              <p className="text-white/60">Enter your new password below</p>
            </div>

            {/* Validating State */}
            {isValidating && !error && (
              <div className="mb-6 animate-in fade-in duration-300">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                    <p className="text-blue-300">Validating reset link...</p>
                  </div>
                </div>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-300">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-emerald-300 font-semibold">Password reset successful!</p>
                      <p className="text-emerald-400/80 text-sm">Redirecting to login...</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Alert */}
            {error && !success && (
              <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-300">
                <CVAlert variant="error" className="border-red-500/30 bg-red-500/10 backdrop-blur-sm">
                  {error}
                </CVAlert>
              </div>
            )}
            
            {/* Warning: Session not established */}
            {!isValidating && !error && !success && !sessionEstablished && (
              <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-300">
                <CVAlert variant="warning" className="border-yellow-500/30 bg-yellow-500/10 backdrop-blur-sm">
                  <p className="font-semibold">[WARNING] Session not established</p>
                  <p className="text-sm mt-1">Your reset link may be invalid or expired. Check browser console for details.</p>
                </CVAlert>
              </div>
            )}

            {/* Form */}
            {!success && (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <FormField>
                  <FormLabel htmlFor="password" required className="text-white font-semibold text-sm">
                    New Password
                  </FormLabel>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Lock className="w-5 h-5 text-white/60" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-white/10 text-white border border-white/20 rounded-xl focus:outline-none focus:border-blue-400 hover:bg-white/15 transition-all duration-300 placeholder:text-white/40"
                      placeholder="Enter new password (min. 8 characters)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/10 transition-colors duration-200"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5 text-white/60" /> : <Eye className="w-5 h-5 text-white/60" />}
                    </button>
                  </div>
                </FormField>

                <FormField>
                  <FormLabel htmlFor="confirmPassword" required className="text-white font-semibold text-sm">
                    Confirm Password
                  </FormLabel>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Lock className="w-5 h-5 text-white/60" />
                    </div>
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-white/10 text-white border border-white/20 rounded-xl focus:outline-none focus:border-blue-400 hover:bg-white/15 transition-all duration-300 placeholder:text-white/40"
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/10 transition-colors duration-200"
                      aria-pressed={showConfirmPassword}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5 text-white/60" /> : <Eye className="w-5 h-5 text-white/60" />}
                    </button>
                  </div>
                </FormField>

                {/* Submit Button */}
                <CVButton
                  type="submit"
                  variant="primary"
                  loading={loading}
                  disabled={loading}
                  icon={!loading ? <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /> : undefined}
                  iconPosition="right"
                  className="w-full relative overflow-hidden bg-gradient-to-r from-blue-400 via-cyan-500 to-emerald-400 hover:from-blue-500 hover:via-cyan-600 hover:to-emerald-500 py-4 shadow-xl hover:shadow-2xl hover:shadow-cyan-500/60 transform hover:-translate-y-1 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 group"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></span>
                  <span className="relative font-bold text-white drop-shadow-lg">
                    {loading ? "Resetting Password..." : "Reset Password"}
                  </span>
                </CVButton>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
