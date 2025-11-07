"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";
import { Shield, Mail, Lock, Eye, EyeOff, ArrowRight, Check, Sparkles, Zap, Award } from "lucide-react";
import {
  FormField,
  FormLabel,
  CVButton,
  CVAlert,
} from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Remove automatic redirect - let middleware handle it
  // This prevents infinite redirect loops

  const handleGoogleSignIn = useCallback(() => {
    const redirectTo = '/dashboard';
    window.location.href = `/api/auth/oauth/google?redirectTo=${encodeURIComponent(redirectTo)}`;
  }, []);

  const handleMicrosoftSignIn = useCallback(() => {
    const redirectTo = '/dashboard';
    window.location.href = `/api/auth/oauth/microsoft?redirectTo=${encodeURIComponent(redirectTo)}`;
  }, []);

  const handleForgotPassword = useCallback(async () => {
    if (!email) {
      setError("Please enter your email address first");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // First, check if the user exists in the database
      const checkResponse = await fetch('/api/auth/check-user-exists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        throw new Error(checkData.error || 'Failed to verify email');
      }

      if (!checkData.exists) {
        setError("No account found with this email address");
        setLoading(false);
        return;
      }

      // User exists, send reset email
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;

      setResetEmailSent(true);
      setError(null);
      
      // Log success for debugging
      console.log('Password reset email sent successfully to:', email.trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send reset email";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      
      // Check if user was successfully authenticated
      if (data.user && data.session) {
        console.log('Login successful, user data:', data.user);
        
        // Establish session and get redirect target in one step (avoid duplicate setSession)
        const completeResp = await fetch('/api/auth/complete-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
        });
        const completeJson = await completeResp.json().catch(() => ({ redirectTo: undefined })) as { redirectTo?: string };
        if (!completeResp.ok || !completeJson?.redirectTo) {
          console.error('Complete-login failed, falling back to /dashboard', completeJson);
          window.location.href = '/dashboard';
        } else {
          window.location.href = completeJson.redirectTo;
        }
      } else {
        throw new Error('Authentication failed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Animated background - matching landing page */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating particles */}
        <div className="absolute top-20 left-[10%] w-2 h-2 bg-blue-400/40 rounded-full animate-float" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-40 right-[15%] w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-float" style={{ animationDelay: '0.5s', animationDuration: '4s' }} />
        <div className="absolute bottom-32 left-[20%] w-2.5 h-2.5 bg-purple-400/30 rounded-full animate-float" style={{ animationDelay: '1s', animationDuration: '5s' }} />
        <div className="absolute top-[60%] right-[25%] w-1 h-1 bg-blue-300/50 rounded-full animate-float" style={{ animationDelay: '1.5s', animationDuration: '3.5s' }} />
        <div className="absolute bottom-[20%] right-[10%] w-2 h-2 bg-emerald-300/40 rounded-full animate-float" style={{ animationDelay: '2s', animationDuration: '4.5s' }} />
        
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

          {/* Back to Home */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white transition-all duration-300 group backdrop-blur-sm"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-semibold">Back to Home</span>
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          
          {/* Left: Marketing panel - Enhanced with animations */}
          <section className="space-y-8">
              {/* Marketing panel - Desktop only */}
              <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 text-white rounded-3xl shadow-2xl relative overflow-hidden group hover:-rotate-1 transition-transform duration-500">
                {/* Corner Accents - Animated decorative corners */}
                <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-l-2 border-blue-400/0 group-hover:border-blue-400/50 rounded-tl-3xl transition-all duration-500" />
                <div className="absolute top-0 right-0 w-20 h-20 border-t-2 border-r-2 border-emerald-400/0 group-hover:border-emerald-400/50 rounded-tr-3xl transition-all duration-500 delay-100" />
                <div className="absolute bottom-0 left-0 w-20 h-20 border-b-2 border-l-2 border-purple-400/0 group-hover:border-purple-400/50 rounded-bl-3xl transition-all duration-500 delay-200" />
                <div className="absolute bottom-0 right-0 w-20 h-20 border-b-2 border-r-2 border-blue-400/0 group-hover:border-blue-400/50 rounded-br-3xl transition-all duration-500 delay-300" />
                
                {/* Animated background elements */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.1),transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-emerald-400/20 to-blue-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
                <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-gradient-to-tr from-blue-400/20 to-emerald-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000 delay-200" />
                
                <div className="relative z-10 space-y-8">
                {/* Hero text */}
                <h2 className="text-white text-4xl font-bold leading-tight mb-6 group-hover:text-blue-100 transition-colors duration-500">
                  Secure your academic credentials with{" "}
                  <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                    blockchain-verified
                  </span>{" "}
                  confidence
                </h2>
                
                <p className="text-white/70 text-lg leading-relaxed mb-8">
                  Sign in to manage certificates, build your portfolio, and
                  verify achievements instantly with W3C Verifiable Credentials.
                </p>

                {/* Feature list with icons */}
                <ul className="space-y-4 overflow-hidden">
                  <li className="flex items-start gap-4 group/item">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 flex items-center justify-center group-hover/item:scale-110 group-hover/item:border-blue-400/40 transition-all duration-300">
                      <Zap className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 pt-1">
                      <h3 className="text-white font-semibold mb-1">Instant Verification</h3>
                      <p className="text-white/60 text-sm">Share and verify credentials in seconds with cryptographic proof</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-4 group/item">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center group-hover/item:scale-110 group-hover/item:border-emerald-400/40 transition-all duration-300">
                      <Award className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-1">
                      <h3 className="text-white font-semibold mb-1">Portfolio Ready</h3>
                      <p className="text-white/60 text-sm">Beautiful templates to showcase your achievements professionally</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-4 group/item">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center group-hover/item:scale-110 group-hover/item:border-purple-400/40 transition-all duration-300">
                      <Sparkles className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 pt-1">
                      <h3 className="text-white font-semibold mb-1">Privacy First</h3>
                      <p className="text-white/60 text-sm">Your data is encrypted and you control who sees what</p>
                    </div>
                  </li>
                </ul>
                </div>
              </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-blue-500/30 hover:bg-white/10 transition-all duration-300 group">
                <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent mb-1">100%</div>
                <div className="text-xs text-white/60 font-medium">Secure</div>
              </div>
              <div className="text-center p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-emerald-500/30 hover:bg-white/10 transition-all duration-300 group">
                <div className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent mb-1">W3C</div>
                <div className="text-xs text-white/60 font-medium">Standard</div>
              </div>
              <div className="text-center p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-purple-500/30 hover:bg-white/10 transition-all duration-300 group">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-1">∞</div>
                <div className="text-xs text-white/60 font-medium">Lifetime</div>
              </div>
            </div>
          </section>

          {/* Right: Auth card - Modern glassmorphism design */}
          <section 
            aria-labelledby="auth-heading" 
            className="relative group"
          >
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/50 via-emerald-500/50 to-blue-500/50 rounded-3xl blur-2xl opacity-0 group-hover:opacity-75 transition-opacity duration-700 animate-gradient" />
            
            <div className="relative rounded-3xl p-6 sm:p-8 lg:p-10 border border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl shadow-2xl">
              <h2 id="auth-heading" className="sr-only">Authentication</h2>

              {/* Error Alert - Enhanced with animation */}
              {error && (
                <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-300">
                  <CVAlert variant="error" className="border-red-500/30 bg-red-500/10 backdrop-blur-sm">
                    {error}
                  </CVAlert>
                </div>
              )}

              {/* Success Alert for Password Reset */}
              {resetEmailSent && (
                <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-300">
                  <CVAlert variant="success" className="border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm">
                    Password reset email sent! Check your inbox.
                  </CVAlert>
                </div>
              )}

              {/* Form with enhanced styling */}
              <form onSubmit={handleSubmit} noValidate className="space-y-5" id="login-panel">
                
                <FormField>
                  <FormLabel htmlFor="email" required className="text-white font-semibold text-sm">
                    Email Address
                  </FormLabel>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Mail className="w-5 h-5 text-white/60" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white/10 text-white border border-white/20 rounded-xl focus:outline-none focus:border-blue-400 hover:bg-white/15 transition-all duration-300 placeholder:text-white/40"
                      placeholder="your@email.com"
                    />
                  </div>
                </FormField>

                <FormField>
                  <FormLabel htmlFor="password" required className="text-white font-semibold text-sm">
                    Password
                  </FormLabel>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Lock className="w-5 h-5 text-white/60" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-white/10 text-white border border-white/20 rounded-xl focus:outline-none focus:border-blue-400 hover:bg-white/15 transition-all duration-300 placeholder:text-white/40"
                      placeholder="Enter your password"
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

                <div className="flex items-center justify-end">
                  <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-sm text-blue-400 hover:text-blue-300 font-semibold hover:underline transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Enhanced CTA Button */}
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
                    {loading 
                      ? "Signing you in..."
                      : "Sign In to CampusSync"
                    }
                  </span>
                </CVButton>
              </form>

              {/* Social Login - Enhanced design */}
              <div className="mt-8">
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/20" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl text-white/70 font-semibold text-sm rounded-full border border-white/10">
                      Or continue with
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="group relative overflow-hidden bg-white/5 hover:bg-white/10 border border-white/20 hover:border-white/30 text-white py-3.5 rounded-xl flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <svg className="w-5 h-5 relative" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span className="font-semibold relative">Google</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleMicrosoftSignIn}
                    className="group relative overflow-hidden bg-white/5 hover:bg-white/10 border border-white/20 hover:border-white/30 text-white py-3.5 rounded-xl flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <svg className="w-5 h-5 relative" viewBox="0 0 24 24">
                      <path fill="#f25022" d="M1 1h10v10H1z"/>
                      <path fill="#00a4ef" d="M13 1h10v10H13z"/>
                      <path fill="#7fba00" d="M1 13h10v10H1z"/>
                      <path fill="#ffb900" d="M13 13h10v10H13z"/>
                    </svg>
                    <span className="font-semibold relative">Microsoft</span>
                  </button>
                </div>
              </div>

              {/* Trust indicators - Honest and accurate */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-2 group hover:bg-blue-500/20 transition-all duration-300">
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Shield className="w-3 h-3 text-blue-400" />
                  </div>
                  <span className="text-xs font-semibold text-blue-300">Encrypted Storage</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 group hover:bg-emerald-500/20 transition-all duration-300">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Check className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-300">W3C VC Standard</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center gap-2 group hover:bg-purple-500/20 transition-all duration-300">
                  <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                  </div>
                  <span className="text-xs font-semibold text-purple-300">Open Source</span>
                </div>
              </div>

              {/* Footer */}
              <p className="mt-8 text-center text-xs text-white/60 leading-relaxed">
                By continuing, you agree to our {" "}
                <button className="text-white/80 hover:text-white hover:underline font-semibold transition-colors">Terms of Service</button>
                {" "} and {" "}
                <button className="text-white/80 hover:text-white hover:underline font-semibold transition-colors">Privacy Policy</button>
              </p>

              {/* Sign Up Link */}
              <div className="mt-6 text-center">
                <p className="text-white/70 text-sm">
                  Don&apos;t have an account?{" "}
                  <Link 
                    href="/signup" 
                    className="text-blue-400 hover:text-blue-300 font-semibold hover:underline transition-all duration-300 inline-flex items-center gap-1 group"
                  >
                    Create Account
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}



