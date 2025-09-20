"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { validateStudentEmailSync } from "../../../lib/emailValidation";
import { Shield, Mail, Lock, Eye, EyeOff, ArrowRight, Check } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Email validation for student signup - Using flexible validation system
  const validateStudentEmail = useCallback((email: string) => {
    return validateStudentEmailSync(email);
  }, []);

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    setEmailError(null);
    
    // Only validate on signup mode and if email is not empty
    if (mode === 'signup' && newEmail.trim()) {
      const validation = validateStudentEmail(newEmail);
      if (!validation.isValid) {
        setEmailError(validation.error || 'Invalid email');
      }
    }
  }, [mode, validateStudentEmail]);

  const handleGoogleSignIn = useCallback(() => {
    const redirectTo = '/dashboard';
    window.location.href = `/api/auth/oauth/google?redirectTo=${encodeURIComponent(redirectTo)}`;
  }, []);
  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setEmailError(null);
    setLoading(true);

    try {
      // Validate email for signup
      if (mode === "signup") {
        const validation = validateStudentEmail(email);
        if (!validation.isValid) {
          setEmailError(validation.error || 'Invalid email');
          setLoading(false);
          return;
        }
      }

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
      }

      router.replace("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, router, validateStudentEmail]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Decorative background matching landing hero */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-blue-900/10 to-purple-900/20 animate-pulse" />
      </div>

      {/* Back to Home */}
      <div className="relative z-10 p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors group"
        >
          <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-semibold">Back to Home</span>
        </Link>
      </div>

      {/* Main content */}
      <main className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 pb-12 md:grid-cols-2 md:items-center">
        {/* Left: Marketing panel */}
        <section className="hidden md:block">
          <div className="rounded-2xl p-8 border border-white/20 bg-white/5 backdrop-blur-xl shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">CredentiVault</span>
            </div>
            <h1 className="text-white text-3xl font-bold leading-tight mb-4">
              Secure your credentials with blockchain-verified confidence
            </h1>
            <p className="text-white/80 leading-relaxed mb-8">
              Create an account or sign in to manage certificates, build your portfolio, and
              verify achievements instantly.
            </p>
            <ul className="space-y-3 text-white/90">
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-green-400" /><span>Instant verification and sharing</span></li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-green-400" /><span>Portfolio-ready templates</span></li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-green-400" /><span>Privacy-first, secure by design</span></li>
            </ul>
          </div>
        </section>

        {/* Right: Auth card */}
        <section aria-labelledby="auth-heading" className="rounded-2xl p-6 sm:p-8 border border-white/20 bg-white/5 backdrop-blur-xl shadow-xl">
          <h2 id="auth-heading" className="sr-only">Authentication</h2>

          {/* Mode Toggle */}
          <div role="tablist" aria-label="Authentication mode" className="flex bg-white/10 rounded-xl p-1.5 mb-8">
            <button
              type="button"
              role="tab"
              id="tab-login"
              aria-selected={mode === "login"}
              aria-controls="login-panel"
              tabIndex={mode === "login" ? 0 : -1}
              disabled={loading}
              onClick={() => { setMode("login"); setError(null); setShowPassword(false); }}
              className={`flex-1 py-3 text-sm font-semibold rounded-lg transition-all duration-200 ${
                mode === "login"
                  ? "bg-white text-gray-900 shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/10"
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
              className={`flex-1 py-3 text-sm font-semibold rounded-lg transition-all duration-200 ${
                mode === "signup"
                  ? "bg-white text-gray-900 shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-100/90 border border-red-300 rounded-xl" role="alert" aria-live="polite">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 text-red-600 flex-shrink-0">⚠️</div>
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-6" id={mode === "login" ? "login-panel" : "signup-panel"}>
            <div className="space-y-3">
              <label htmlFor="email" className="cv-form-label text-white font-semibold">
                Email Address
              </label>
              <div className="cv-input-wrapper">
                <Mail className="cv-input-icon" />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={handleEmailChange}
                  className={`cv-form-input cv-input-focus-ring pl-10 bg-white/90 text-gray-900 border-white/30 focus:border-white focus:bg-white ${
                    emailError ? 'border-red-300 focus:border-red-500' : ''
                  }`}
                  placeholder={mode === 'signup' ? 'student@university.edu' : 'your@email.com'}
                  aria-invalid={Boolean(error || emailError)}
                />
              </div>
              {emailError && (
                <p className="text-red-300 text-sm mt-1 flex items-center gap-1">
                  <span>⚠️</span>
                  {emailError}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <label htmlFor="password" className="cv-form-label text-white font-semibold">
                Password
              </label>
              <div className="cv-input-wrapper">
                <Lock className="cv-input-icon" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="cv-form-input cv-input-focus-ring pl-10 pr-12 bg-white/90 text-gray-900 border-white/30 focus:border-white focus:bg-white"
                  placeholder={mode === "login" ? "Enter your password" : "Create a strong password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-3 my-auto h-9 px-2 rounded-md cv-ghost-btn"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {mode === "login" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 bg-white/90 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="ml-2 text-sm text-white/90 font-medium">Remember me</span>
                </label>
                <button type="button" className="text-sm text-white/90 hover:text-white font-semibold underline">
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'signup' && (!!emailError || !email.trim()))}
              className="w-full group bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-4 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25 transform hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>{mode === "login" ? "Signing you in..." : "Creating your account..."}</span>
                </span>
              ) : (
                <>
                  <span>{mode === "login" ? "Access CredentiVault" : "Create Account"}</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Social Login */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/30" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-transparent text-white/80 font-medium">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="cv-btn bg-white/10 border border-white/30 text-white hover:bg-white hover:text-gray-900 transition-all duration-200 py-3"
              >
                Google
              </button>
              <button
                type="button"
                className="cv-btn bg-white/10 border border-white/30 text-white hover:bg-white hover:text-gray-900 transition-all duration-200 py-3"
              >
                GitHub
              </button>
            </div>
          </div>

          {/* Trust indicators */}
          <div className="mt-8 flex items-center justify-center gap-6 text-white/80 text-xs">
            <span className="cv-badge cv-badge-verified text-xs">SSL Secured</span>
            <span className="cv-badge cv-badge-verified text-xs">GDPR Compliant</span>
          </div>

          {/* Footer */}
          <p className="mt-8 text-center text-sm text-white/80">
            By continuing, you agree to our {" "}
            <button className="text-white hover:underline font-semibold">Terms of Service</button>{" "}
            and {" "}
            <button className="text-white hover:underline font-semibold">Privacy Policy</button>
          </p>
        </section>
      </main>
    </div>
  );
}



