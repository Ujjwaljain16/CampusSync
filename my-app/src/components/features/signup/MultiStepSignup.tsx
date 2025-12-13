/**
 * Multi-Step Signup Component
 * 
 * Beautiful, animated signup flow with role selection, email validation,
 * and organization matching. Maintains CampusSync dark glassmorphism theme.
 * 
 * Features:
 * - 4-step wizard with progress indicator
 * - Role-based signup (Student/Faculty/Recruiter)
 * - Real-time email domain validation
 * - Organization auto-matching
 * - Smooth animations and transitions
 * - Mobile responsive
 */

'use client';

import React, { useState, useCallback } from 'react';
import { GraduationCap, Briefcase, UserCheck, Mail, Lock, User, Building2, Calendar, BookOpen, MapPin, Star, Eye, EyeOff, CheckCircle, ArrowRight, ArrowLeft, Sparkles, Shield } from 'lucide-react';
import { toast } from '@/components/ui/toast';

// Types
interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
}

interface EmailValidationResult {
  matches: Organization[];
  canSignup: boolean;
  userType: 'student' | 'faculty' | 'recruiter';
}

type Role = 'student' | 'faculty' | 'recruiter';
type Step = 1 | 2 | 3 | 4;

interface SignupData {
  role: Role | null;
  email: string;
  password: string;
  fullName: string;
  organization: Organization | null;
  // Student/Faculty specific
  university?: string;
  major?: string;
  graduationYear?: number;
  location?: string;
  gpa?: number;
  // Recruiter specific
  companyName?: string;
  position?: string;
  // Flow control
  shouldSignIn?: boolean;
  requiresEmailVerification?: boolean;
}

export default function MultiStepSignup({ onComplete }: { onComplete?: (data: SignupData) => void }) {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [data, setData] = useState<SignupData>({
    role: null,
    email: '',
    password: '',
    fullName: '',
    organization: null
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validatingEmail, setValidatingEmail] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Validate email and fetch organizations
  // validateEmail now accepts an optional role override so OAuth redirects
  // that include a role (e.g. recruiter) won't be subject to student/faculty checks
  const validateEmail = useCallback(async (email: string, roleOverride?: Role) => {
    if (!email || !email.includes('@')) return;

    const effectiveRole = roleOverride ?? data.role;

    // IMPORTANT: Recruiters can use ANY email - skip validation entirely
    if (effectiveRole === 'recruiter') {
      console.log('[validateEmail] Skipping validation for recruiter');
      setOrganizations([]);
      setError(null);
      setValidatingEmail(false);
      return;
    }

    // Only validate for students and faculty (they need university emails)
    setValidatingEmail(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const result: EmailValidationResult = await res.json();

      if (!res.ok) {
        throw new Error(result.canSignup === false ? 'Email not eligible for signup' : 'Validation failed');
      }

      setOrganizations(result.matches || []);

      // For students/faculty, require org match
      if (result.matches.length === 0) {
        const errorMsg = 'Email domain not recognized. Please use your university email.';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Email validation failed';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setValidatingEmail(false);
    }
  }, [data.role]);

  // Check for OAuth user on mount
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    const oauthParam = params.get('oauth');

    if (emailParam && oauthParam === 'true') {
      const roleParam = params.get('role') as Role | null;
      // If role is present in query (e.g. role=recruiter) set it immediately
      if (roleParam) {
        setData(prev => ({ ...prev, role: roleParam }));
      } else {
        // leave role null so user selects it
        setData(prev => ({ ...prev }));
      }

      setData(prev => ({ ...prev, email: emailParam }));

      // IMPORTANT: Only auto-validate email if role is known
      // If no role, let user choose first (they might be a recruiter with non-org email)
      if (roleParam) {
        // Auto-validate email for OAuth users with known role
        setTimeout(() => {
          validateEmail(emailParam, roleParam);
        }, 500);
      } else {
        console.log('[OAuth] Email set but validation skipped - waiting for role selection');
      }
    }
  }, [validateEmail]);

  // Handle role selection
  const selectRole = useCallback((role: Role) => {
    setData(prev => ({ ...prev, role }));
    setError(null);

    // For OAuth users who came without a role, validate email now that role is selected
    const params = new URLSearchParams(window.location.search);
    const isOAuthUser = params.get('oauth') === 'true';
    const emailParam = params.get('email');

    if (isOAuthUser && emailParam && (role === 'student' || role === 'faculty')) {
      // Validate email for student/faculty to check org match
      console.log('[selectRole] OAuth user selected student/faculty, validating email');
      validateEmail(emailParam, role);
    }

    // Auto-advance to next step after brief delay
    setTimeout(() => setCurrentStep(2), 300);
  }, [validateEmail]);

  // Handle email blur
  const handleEmailBlur = useCallback(() => {
    if (data.email) {
      validateEmail(data.email);
    }
  }, [data.email, validateEmail]);

  // Navigate steps
  const nextStep = useCallback(() => {
    // Before moving to step 3 (organization), validate email for student/faculty if not done yet
    if (currentStep === 2 && (data.role === 'student' || data.role === 'faculty') && data.email) {
      // Trigger validation if organizations array is empty (means not validated yet)
      if (organizations.length === 0 && !validatingEmail && !error) {
        console.log('[nextStep] Triggering email validation before proceeding to org selection');
        validateEmail(data.email, data.role);
      }
    }

    if (currentStep < 4) setCurrentStep((prev) => (prev + 1) as Step);
  }, [currentStep, data.role, data.email, organizations.length, validatingEmail, error, validateEmail]);

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep((prev) => (prev - 1) as Step);
  };

  // Submit signup
  const handleSubmit = async () => {
    // Prevent double submission
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!data.role || !data.email || !data.password || !data.fullName) {
        throw new Error('Please fill all required fields');
      }

      // For students/faculty, organization is required
      if ((data.role === 'student' || data.role === 'faculty') && !data.organization) {
        throw new Error('Please select your organization');
      }

      // Call appropriate signup endpoint
      const endpoint = data.role === 'recruiter'
        ? '/api/auth/signup/recruiter'
        : '/api/auth/signup/student-faculty';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          full_name: data.fullName,
          role: data.role,
          organization_id: data.organization?.id,
          // Student/Faculty fields
          university: data.university,
          major: data.major,
          graduation_year: data.graduationYear,
          location: data.location,
          gpa: data.gpa,
          // Recruiter fields
          company_name: data.companyName,
          position: data.position
        })
      });

      const result = await res.json();

      if (!res.ok) {
        // Format error messages for better UX
        let errorMessage = result.error || 'Signup failed';

        // Handle duplicate email errors
        if (res.status === 409) {
          // Extract role from error message
          if (errorMessage.includes('already registered as')) {
            errorMessage = `[WARNING] ${errorMessage}`;
          }
        }

        // Handle validation errors
        if (res.status === 400) {
          if (errorMessage.includes('Missing required fields')) {
            errorMessage = '[INFO] ' + errorMessage;
          } else if (errorMessage.includes('Password must be')) {
            errorMessage = '[SECURITY] ' + errorMessage;
          }
        }

        throw new Error(errorMessage);
      }

      // Account created successfully!
      setLoading(false);

      // Check if this is an OAuth user or if account was already confirmed
      const isOAuthUser = new URLSearchParams(window.location.search).get('oauth') === 'true';
      const shouldSignInFromAPI = result.shouldSignIn === true;
      const shouldSignIn = shouldSignInFromAPI || isOAuthUser;

      console.log('[MultiStepSignup] Response received:', {
        shouldSignIn: result.shouldSignIn,
        isNewUser: result.isNewUser,
        requiresEmailVerification: result.requiresEmailVerification,
        isOAuthUser,
        shouldSignInFromAPI,
        finalShouldSignIn: shouldSignIn
      });

      if (shouldSignIn) {
        // OAuth users or existing users - redirect to appropriate page
        toast.success('Account setup complete! Signing you in...');
        console.log('[MultiStepSignup] OAuth user or existing account, role:', data.role);

        // If onComplete callback exists, call it with shouldSignIn flag
        if (onComplete) {
          console.log('[MultiStepSignup] Calling onComplete callback with shouldSignIn: true');
          onComplete({ ...data, shouldSignIn: true, requiresEmailVerification: false });
          return;
        }

        // For recruiters, redirect to waiting page (pending approval)
        if (data.role === 'recruiter') {
          console.log('[MultiStepSignup] Recruiter OAuth signup, redirecting to waiting page');
          setTimeout(() => {
            window.location.href = '/recruiter/waiting';
          }, 500);
        } else {
          // Other roles - redirect to login
          console.log('[MultiStepSignup] Non-recruiter OAuth user, redirecting to login');
          setTimeout(() => {
            window.location.href = '/login';
          }, 500);
        }
        return; // Important: exit here
      } else {
        // Regular email/password users - need email verification
        toast.success('Account created! Please check your email to verify.');
        console.log('[MultiStepSignup] New email/password user, redirecting to verify email page');

        // If onComplete callback exists, call it with shouldSignIn flag
        if (onComplete) {
          console.log('[MultiStepSignup] Calling onComplete callback for email verification with shouldSignIn: false');
          onComplete({ ...data, shouldSignIn: false, requiresEmailVerification: true });
          return;
        }

        console.log('[MultiStepSignup] Performing redirect to /signup/verify-email');
        setTimeout(() => {
          window.location.href = '/signup/verify-email?email=' + encodeURIComponent(data.email);
        }, 500); // Small delay to ensure logs and toast are visible
      }
    } catch (err) {
      console.error('[MultiStepSignup] Error during signup:', err);
      const errorMessage = err instanceof Error ? err.message : 'Signup failed';
      toast.error(errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  };

  // Render role cards
  const roleCards = [
    {
      role: 'student' as Role,
      icon: GraduationCap,
      title: 'Student',
      description: 'Upload and verify your academic certificates',
      gradient: 'from-blue-500 to-cyan-500',
      bgGradient: 'from-blue-500/10 to-cyan-500/10'
    },
    {
      role: 'recruiter' as Role,
      icon: Briefcase,
      title: 'Recruiter',
      description: 'Discover and verify student credentials',
      gradient: 'from-purple-500 to-pink-500',
      bgGradient: 'from-purple-500/10 to-pink-500/10'
    },
    {
      role: 'faculty' as Role,
      icon: UserCheck,
      title: 'Faculty',
      description: 'Review and approve student certificates',
      gradient: 'from-emerald-500 to-teal-500',
      bgGradient: 'from-emerald-500/10 to-teal-500/10'
    }
  ];

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((step) => (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${currentStep > step
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
                      : currentStep === step
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                        : 'bg-white/10 text-white/40 border border-white/20'
                    }`}
                >
                  {currentStep > step ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-semibold">{step}</span>
                  )}
                </div>
                <span className="text-xs text-white/60 mt-2">
                  {step === 1 && 'Role'}
                  {step === 2 && 'Account'}
                  {step === 3 && 'Organization'}
                  {step === 4 && 'Profile'}
                </span>
              </div>
              {step < 4 && (
                <div
                  className={`flex-1 h-0.5 mx-2 transition-all duration-300 ${currentStep > step ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-white/20'
                    }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content Container */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 relative overflow-hidden">
        {/* Background gradient orb */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10" />

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-5 bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/30 rounded-2xl text-red-200 animate-in slide-in-from-top-2 fade-in duration-300 backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium leading-relaxed whitespace-pre-line">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Role Selection */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                <Sparkles className="w-7 h-7 text-blue-400" />
                Choose Your Path
              </h2>
              <p className="text-white/60">Select your role to get started</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {roleCards.map(({ role, icon: Icon, title, description, gradient, bgGradient }) => (
                <button
                  key={role}
                  onClick={() => selectRole(role)}
                  className={`group relative p-6 rounded-2xl border transition-all duration-300 hover:scale-105 ${data.role === role
                      ? 'bg-gradient-to-br ' + bgGradient + ' border-white/30'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                >
                  <div
                    className={`w-14 h-14 mx-auto mb-4 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                  <p className="text-sm text-white/60">{description}</p>
                  {data.role === role && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Account Details */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-500">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Create Your Account</h2>
              <p className="text-white/60">Enter your email and choose a password</p>
            </div>

            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Email {data.role !== 'recruiter' && <span className="text-blue-400">(use your university email)</span>}
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type="email"
                    value={data.email}
                    onChange={(e) => setData(prev => ({ ...prev, email: e.target.value }))}
                    onBlur={handleEmailBlur}
                    placeholder={data.role === 'recruiter' ? 'you@company.com' : 'you@university.edu'}
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                  />
                  {validatingEmail && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {organizations.length > 0 && (
                  <p className="mt-2 text-sm text-emerald-400 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {organizations.length} organization{organizations.length > 1 ? 's' : ''} matched
                  </p>
                )}
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type="text"
                    value={data.fullName}
                    onChange={(e) => setData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={data.password}
                    onChange={(e) => setData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Min 8 characters, 1 uppercase, 1 number"
                    className="w-full pl-12 pr-12 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-white/50">
                  Must be at least 8 characters with 1 uppercase letter and 1 number
                </p>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={prevStep}
                className="flex-1 py-3 px-6 bg-white/5 border border-white/20 text-white/90 rounded-xl font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={!data.email || !data.fullName || !data.password || validatingEmail}
                className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl font-semibold hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Organization Selection (Students/Faculty only) */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-500">
            {data.role === 'recruiter' ? (
              // Skip this step for recruiters
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Organization Access</h2>
                <p className="text-white/60 mb-6">
                  You&apos;ll be able to request access to organizations after signup
                </p>
                <button
                  onClick={nextStep}
                  className="mx-auto px-8 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl font-semibold hover:scale-105 transition-all inline-flex items-center gap-2"
                >
                  Continue to Profile
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">Select Your Organization</h2>
                  <p className="text-white/60">Choose your university</p>
                </div>

                {organizations.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Building2 className="w-8 h-8 text-white/40" />
                    </div>
                    <p className="text-white/60 mb-4">
                      No organizations found for your email domain.
                    </p>
                    <button
                      onClick={prevStep}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      ← Change email address
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {organizations.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          setData(prev => ({ ...prev, organization: org }));
                          setTimeout(nextStep, 300);
                        }}
                        className={`w-full p-4 rounded-xl border transition-all duration-300 text-left ${data.organization?.id === org.id
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                          }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white">{org.name}</h3>
                            {org.description && (
                              <p className="text-sm text-white/60">{org.description}</p>
                            )}
                          </div>
                          {data.organization?.id === org.id && (
                            <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={prevStep}
                    className="flex-1 py-3 px-6 bg-white/5 border border-white/20 text-white/90 rounded-xl font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Profile Details */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-500">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Complete Your Profile</h2>
              <p className="text-white/60">Add some details about yourself (optional)</p>
            </div>

            <div className="space-y-4">
              {data.role === 'recruiter' ? (
                <>
                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">Company Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                      <input
                        type="text"
                        value={data.companyName || ''}
                        onChange={(e) => setData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="Acme Corp"
                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                      />
                    </div>
                  </div>

                  {/* Position */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">Position</label>
                    <div className="relative">
                      <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                      <input
                        type="text"
                        value={data.position || ''}
                        onChange={(e) => setData(prev => ({ ...prev, position: e.target.value }))}
                        placeholder="Senior Recruiter"
                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                      />
                    </div>
                  </div>
                </>
              ) : data.role === 'student' ? (
                <>
                  {/* University */}
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">University</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                      <input
                        type="text"
                        value={data.university || data.organization?.name || ''}
                        onChange={(e) => setData(prev => ({ ...prev, university: e.target.value }))}
                        placeholder="Stanford University"
                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                      />
                    </div>
                  </div>

                  {/* Major & Graduation Year */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Major</label>
                      <div className="relative">
                        <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                          type="text"
                          value={data.major || ''}
                          onChange={(e) => setData(prev => ({ ...prev, major: e.target.value }))}
                          placeholder="Computer Science"
                          className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Grad Year</label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                          type="number"
                          value={data.graduationYear || ''}
                          onChange={(e) => setData(prev => ({ ...prev, graduationYear: parseInt(e.target.value) || undefined }))}
                          placeholder="2025"
                          min="2020"
                          max="2030"
                          className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Location & GPA */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                          type="text"
                          value={data.location || ''}
                          onChange={(e) => setData(prev => ({ ...prev, location: e.target.value }))}
                          placeholder="Palo Alto, CA"
                          className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">GPA</label>
                      <div className="relative">
                        <Star className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                          type="number"
                          step="0.01"
                          value={data.gpa || ''}
                          onChange={(e) => setData(prev => ({ ...prev, gpa: parseFloat(e.target.value) || undefined }))}
                          placeholder="3.8"
                          min="0"
                          max="4"
                          className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-white/60">
                    No additional details needed for your role. You can complete your profile later.
                  </p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={prevStep}
                className="flex-1 py-3 px-6 bg-white/5 border border-white/20 text-white/90 rounded-xl font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl font-semibold hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Complete Signup
                    <Sparkles className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom text */}
      <p className="text-center text-sm text-white/60 mt-6">
        Already have an account?{' '}
        <a href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-semibold">
          Sign in
        </a>
      </p>
    </div>
  );
}
