"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";
import { validateStudentEmailSync } from "../../../lib/emailValidation";
import { Shield, Mail, Lock, Eye, EyeOff, ArrowRight, Check, AlertCircle, Sparkles, Zap, Award } from "lucide-react";
import {
  FormField,
  FormLabel,
  FormInput,
  FormError,
  FormHelper,
  CVButton,
  CVAlert,
} from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  // Signup-only fields
  const [fullName, setFullName] = useState("");
  const [university, setUniversity] = useState("");
  const [graduationYear, setGraduationYear] = useState<string>("");
  const [major, setMajor] = useState("");
  const [location, setLocation] = useState("");
  const [gpa, setGpa] = useState<string>("");
  // Desired access (required) - only one can be selected
  const [requestedRole, setRequestedRole] = useState<'student' | 'recruiter' | 'faculty' | 'admin'>('student');

  // Remove automatic redirect - let middleware handle it
  // This prevents infinite redirect loops

  // Email validation - role-aware validation system
  const validateEmail = useCallback((email: string, role: string) => {
    // Recruiters can use any email (including non-educational)
    if (role === 'recruiter') {
      return { isValid: true, error: null };
    }
    // Students, faculty, and admins need educational emails
    return validateStudentEmailSync(email);
  }, []);

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    setEmailError(null);
    
    // Only validate on signup mode and if email is not empty
    if (mode === 'signup' && newEmail.trim()) {
      const validation = validateEmail(newEmail, requestedRole);
      if (!validation.isValid) {
        setEmailError(validation.error || 'Invalid email');
      }
    }
  }, [mode, validateEmail, requestedRole]);

  const handleGoogleSignIn = useCallback(() => {
    const redirectTo = '/dashboard';
    window.location.href = `/api/auth/oauth/google?redirectTo=${encodeURIComponent(redirectTo)}`;
  }, []);

  const handleMicrosoftSignIn = useCallback(() => {
    const redirectTo = '/dashboard';
    window.location.href = `/api/auth/oauth/microsoft?redirectTo=${encodeURIComponent(redirectTo)}`;
  }, []);
  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setEmailError(null);
    setLoading(true);

    try {
      // Validate email for signup
      if (mode === "signup") {
        const validation = validateEmail(email, requestedRole);
        if (!validation.isValid) {
          setEmailError(validation.error || 'Invalid email');
          setLoading(false);
          return;
        }

          // Password constraint: min 8 chars, 1 number, 1 uppercase
          const passwordConstraint = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
          if (!passwordConstraint.test(password)) {
            setError('Password must be at least 8 characters, include 1 uppercase letter and 1 number');
            setLoading(false);
            return;
          }
        // Basic required field check
        if (!fullName.trim()) {
          setError('Please provide your full name');
          setLoading(false);
          return;
        }

        // Ensure a role is selected
        if (!requestedRole) {
          setError('Please select an access type');
          setLoading(false);
          return;
        }
      }

      if (mode === "login") {
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
      } else {
        if (process.env.NODE_ENV === 'development') {
          // In development, first check if the account already exists by attempting sign-in.
          try {
            const precheck = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (precheck.data?.user) {
              setError('Email already registered. Please sign in.');
              setLoading(false);
            return;
          }
        } catch (precheckError: unknown) {
          // Expected error if account doesn't exist - proceed with signup
          const error = precheckError as { status?: number };
          if (error?.status === 400) {
            console.log('Account does not exist, proceeding with signup');
          } else {
            console.warn('Unexpected error during precheck:', precheckError);
          }
        }          // Bypass Supabase signUp entirely in development by creating the user directly
          try {
            const resp = await fetch('/api/auth/dev-upsert-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email.trim(), password, role: 'student' })
            });
            const payload = await resp.json();
            if (!resp.ok || !payload.ok) {
              throw new Error(payload?.error || 'Dev upsert failed');
            }
            const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (signInErr || !signInData.user) {
              throw new Error(signInErr?.message || 'Sign-in failed');
            }
            if (signInData.session?.access_token && signInData.session?.refresh_token) {
              await fetch('/api/auth/set-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: signInData.session.access_token,
                  refresh_token: signInData.session.refresh_token
                })
              });
              // Complete signup with profile details
              await fetch('/api/auth/complete-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: signInData.session.access_token,
                  refresh_token: signInData.session.refresh_token,
                  full_name: fullName.trim(),
                  university: university.trim() || undefined,
                  graduation_year: graduationYear ? Number(graduationYear) : undefined,
                  major: major.trim() || undefined,
                  location: location.trim() || undefined,
                  gpa: gpa ? Number(gpa) : undefined,
                })
              });
              // Submit role request if needed
              if (requestedRole && requestedRole !== 'student') {
                await fetch('/api/role-requests', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ requested_role: requestedRole, metadata: { university, company: university, major, location } })
                }).catch(()=>null);
              }
              const completeResp = await fetch('/api/auth/complete-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: signInData.session.access_token,
                  refresh_token: signInData.session.refresh_token
                })
              });
              const completeJson = await completeResp.json().catch(() => ({ redirectTo: undefined })) as { redirectTo?: string };
              if (requestedRole && requestedRole !== 'student') {
                window.location.href = '/waiting';
              } else {
                window.location.href = completeJson?.redirectTo || '/dashboard';
              }
            } else {
              window.location.href = '/dashboard';
            }
            return;
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Signup failed');
            return;
          }
        } else {
          const { data, error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
          });
          if (signUpError) {
            const lower = (signUpError.message || '').toLowerCase();
            if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
              setError('Email already registered. Please sign in.');
            } else {
              setError(signUpError.message || 'Signup failed');
            }
            setLoading(false);
            return;
          }
          if (data.user && !data.user.email_confirmed_at) {
            setError('Account created! Please check your email and click the confirmation link to complete your registration. After confirming, sign in to continue.');
            return;
          }
          // If email confirmation is disabled in dev, complete signup immediately with minimal details
          if (process.env.NODE_ENV !== 'production' && data.session?.access_token && data.session?.refresh_token) {
            const complete = await fetch('/api/auth/complete-signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                  full_name: fullName.trim() || 'New Student',
                  role: requestedRole, // Include the selected role
                  university: university.trim() || undefined,
                  graduation_year: graduationYear ? Number(graduationYear) : undefined,
                  major: major.trim() || undefined,
                  location: location.trim() || undefined,
                gpa: gpa ? Number(gpa) : undefined,
              })
            });
            if (complete.ok) {
              if (requestedRole && requestedRole !== 'student') {
                await fetch('/api/role-requests', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ requested_role: requestedRole, metadata: { university, company: university, major, location } })
                }).catch(()=>null);
              }
              const go = await fetch('/api/auth/complete-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token
                })
              });
              const payload = await go.json().catch(() => ({ redirectTo: undefined })) as { redirectTo?: string };
              if (requestedRole && requestedRole !== 'student') {
                window.location.href = '/waiting';
              } else {
                window.location.href = payload?.redirectTo || '/dashboard';
              }
              return;
            }
          }
          window.location.href = '/login';
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, router, validateEmail, requestedRole, fullName, university, graduationYear, major, location, gpa]);

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
                  Create an account or sign in to manage certificates, build your portfolio, and
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

              {/* Mode Toggle - Enhanced design */}
              <div role="tablist" aria-label="Authentication mode" className="flex bg-white/5 rounded-2xl p-1.5 mb-8 border border-white/10 backdrop-blur-sm">
                <button
                  type="button"
                  role="tab"
                  id="tab-login"
                  aria-selected={mode === "login"}
                  aria-controls="login-panel"
                  tabIndex={mode === "login" ? 0 : -1}
                  disabled={loading}
                  onClick={() => { setMode("login"); setError(null); setShowPassword(false); }}
                  className={`flex-1 py-3.5 text-sm font-bold rounded-xl transition-all duration-300 ${
                    mode === "login"
                      ? "bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg shadow-blue-500/25 scale-[1.02]"
                      : "text-white/90 hover:text-white hover:bg-white/10 hover:scale-[1.01]"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-signup"
                  aria-selected={mode === "signup"}
                  aria-controls="signup-panel"
                  tabIndex={mode === "signup" ? 0 : -1}
                  disabled={loading}
                  onClick={() => { setMode("signup"); setError(null); setShowPassword(false); }}
                  className={`flex-1 py-3.5 text-sm font-bold rounded-xl transition-all duration-300 ${
                    mode === "signup"
                      ? "bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow-lg shadow-emerald-500/25 scale-[1.02]"
                      : "text-white/90 hover:text-white hover:bg-white/10 hover:scale-[1.01]"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Error Alert - Enhanced with animation */}
              {error && (
                <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-300">
                  <CVAlert variant="error" className="border-red-500/30 bg-red-500/10 backdrop-blur-sm">
                    {error}
                  </CVAlert>
                </div>
              )}

              {/* Form with enhanced styling */}
              <form onSubmit={handleSubmit} noValidate className="space-y-5" id={mode === "login" ? "login-panel" : "signup-panel"}>
                {mode === 'signup' && (
                  <>
                    <FormField>
                      <FormLabel htmlFor="full_name" required className="text-white font-semibold text-sm">
                        Full Name
                      </FormLabel>
                      <FormInput
                        id="full_name"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="bg-white/10 text-white border-white/20 focus:border-blue-400 hover:bg-white/15 transition-all duration-300 placeholder:text-white/40"
                        placeholder="Jane Doe"
                      />
                    </FormField>

                    {/* Desired Access - Enhanced design */}
                    <div className="space-y-3 p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-white/90 font-bold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                          <Shield className="w-3.5 h-3.5 text-blue-400" />
                        </span>
                        Access Type <span className="text-red-400">*</span>
                      </p>
                      <div className="space-y-2.5">
                        <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/30 cursor-pointer transition-all duration-300 group">
                          <input 
                            type="radio" 
                            name="requestedRole" 
                            value="student" 
                            checked={requestedRole === 'student'} 
                            onChange={(e) => setRequestedRole(e.target.value as 'student' | 'recruiter' | 'faculty' | 'admin')} 
                            className="w-4 h-4 text-blue-500 focus:ring-2 focus:ring-blue-400"
                          />
                          <span className="text-white/80 group-hover:text-white font-medium text-sm">Student <span className="text-white/50 text-xs">(Default)</span></span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400/30 cursor-pointer transition-all duration-300 group">
                          <input 
                            type="radio" 
                            name="requestedRole" 
                            value="recruiter" 
                            checked={requestedRole === 'recruiter'} 
                            onChange={(e) => setRequestedRole(e.target.value as 'student' | 'recruiter' | 'faculty' | 'admin')} 
                            className="w-4 h-4 text-emerald-500 focus:ring-2 focus:ring-emerald-400"
                          />
                          <span className="text-white/80 group-hover:text-white font-medium text-sm">Recruiter <span className="text-white/50 text-xs">(Any email)</span></span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400/30 cursor-pointer transition-all duration-300 group">
                          <input 
                            type="radio" 
                            name="requestedRole" 
                            value="faculty" 
                            checked={requestedRole === 'faculty'} 
                            onChange={(e) => setRequestedRole(e.target.value as 'student' | 'recruiter' | 'faculty' | 'admin')} 
                            className="w-4 h-4 text-purple-500 focus:ring-2 focus:ring-purple-400"
                          />
                          <span className="text-white/80 group-hover:text-white font-medium text-sm">Faculty <span className="text-white/50 text-xs">(Edu email)</span></span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-400/30 cursor-pointer transition-all duration-300 group">
                          <input 
                            type="radio" 
                            name="requestedRole" 
                            value="admin" 
                            checked={requestedRole === 'admin'} 
                            onChange={(e) => setRequestedRole(e.target.value as 'student' | 'recruiter' | 'faculty' | 'admin')} 
                            className="w-4 h-4 text-orange-500 focus:ring-2 focus:ring-orange-400"
                          />
                          <span className="text-white/80 group-hover:text-white font-medium text-sm">Admin <span className="text-white/50 text-xs">(Edu email)</span></span>
                        </label>
                      </div>
                      <FormHelper className="text-white/60 text-xs">
                        Non-student access requires admin approval
                      </FormHelper>
                    </div>
                  </>
                )}
                
                <FormField>
                  <FormLabel htmlFor="email" required className="text-white font-semibold text-sm">
                    Email Address
                  </FormLabel>
                  <FormInput
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    icon={<Mail className="text-white/60" />}
                    value={email}
                    onChange={handleEmailChange}
                    error={!!emailError}
                    className="bg-white/10 text-white border-white/20 focus:border-blue-400 hover:bg-white/15 transition-all duration-300 placeholder:text-white/40"
                    placeholder={
                      mode === 'signup' 
                        ? (requestedRole === 'recruiter' ? 'recruiter@company.com' : 'student@university.edu')
                        : 'your@email.com'
                    }
                    aria-invalid={Boolean(error || emailError)}
                  />
                  {emailError && (
                    <FormError icon={<AlertCircle className="w-4 h-4" />} className="text-red-400">
                      {emailError}
                    </FormError>
                  )}
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
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-white/10 text-white border border-white/20 rounded-xl focus:outline-none focus:border-blue-400 hover:bg-white/15 transition-all duration-300 placeholder:text-white/40"
                      placeholder={mode === "login" ? "Enter your password" : "Create a strong password"}
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

                {mode === "login" && (
                  <div className="flex items-center justify-between">
                    <label className="flex items-center group cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-500 bg-white/10 border-white/30 rounded focus:ring-2 focus:ring-blue-400 transition-all"
                      />
                      <span className="ml-2 text-sm text-white/80 group-hover:text-white font-medium transition-colors">Remember me</span>
                    </label>
                    <button type="button" className="text-sm text-white/80 hover:text-white font-semibold hover:underline transition-all">
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Enhanced CTA Button */}
                <CVButton
                  type="submit"
                  variant="primary"
                  loading={loading}
                  disabled={loading || (mode === 'signup' && (!!emailError || !email.trim() || !requestedRole))}
                  icon={!loading ? <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /> : undefined}
                  iconPosition="right"
                  className="w-full relative overflow-hidden bg-gradient-to-r from-blue-400 via-cyan-500 to-emerald-400 hover:from-blue-500 hover:via-cyan-600 hover:to-emerald-500 py-4 shadow-xl hover:shadow-2xl hover:shadow-cyan-500/60 transform hover:-translate-y-1 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 group"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></span>
                  <span className="relative font-bold text-white drop-shadow-lg">
                    {loading 
                      ? (mode === "login" ? "Signing you in..." : "Creating your account...")
                      : (mode === "login" ? "Sign In to CampusSync" : "Create My Account")
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
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}



