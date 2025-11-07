/**
 * Email Testing Page
 * 
 * Simple page to test all email functions in CampusSync:
 * - Signup verification
 * - Password reset
 * - Email verification status
 * 
 * For development/testing only - remove in production!
 */

'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, CheckCircle, XCircle, AlertCircle, Send, Loader2 } from 'lucide-react';

interface EmailTest {
  type: 'signup' | 'reset' | 'resend';
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
}

export default function EmailTestPage() {
  const [testEmail, setTestEmail] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [tests, setTests] = useState<Record<string, EmailTest>>({
    signup: { type: 'signup', status: 'idle' },
    reset: { type: 'reset', status: 'idle' },
    resend: { type: 'resend', status: 'idle' }
  });
  const [userStatus, setUserStatus] = useState<{
    loading: boolean;
    exists?: boolean;
    confirmed?: boolean;
    email?: string;
  }>({ loading: false });

  const supabase = createClient();

  // Test 1: Trigger signup verification email (resend)
  const testSignupEmail = async () => {
    if (!testEmail) {
      setTests(prev => ({
        ...prev,
        signup: { type: 'signup', status: 'error', message: 'Please enter an email' }
      }));
      return;
    }

    setTests(prev => ({
      ...prev,
      signup: { type: 'signup', status: 'loading' }
    }));

    try {
      // Resend confirmation email for existing unconfirmed user
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: testEmail
      });

      if (error) throw error;

      setTests(prev => ({
        ...prev,
        signup: {
          type: 'signup',
          status: 'success',
          message: `Signup verification email sent to ${testEmail}. Check your inbox!`
        }
      }));
    } catch (error) {
      setTests(prev => ({
        ...prev,
        signup: {
          type: 'signup',
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to send email'
        }
      }));
    }
  };

  // Test 2: Trigger password reset email
  const testPasswordReset = async () => {
    if (!resetEmail) {
      setTests(prev => ({
        ...prev,
        reset: { type: 'reset', status: 'error', message: 'Please enter an email' }
      }));
      return;
    }

    setTests(prev => ({
      ...prev,
      reset: { type: 'reset', status: 'loading' }
    }));

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;

      setTests(prev => ({
        ...prev,
        reset: {
          type: 'reset',
          status: 'success',
          message: `Password reset email sent to ${resetEmail}. Check your inbox!`
        }
      }));
    } catch (error) {
      setTests(prev => ({
        ...prev,
        reset: {
          type: 'reset',
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to send email'
        }
      }));
    }
  };

  // Check current user email verification status
  const checkUserStatus = async () => {
    setUserStatus({ loading: true });

    try {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) throw error;

      if (user) {
        setUserStatus({
          loading: false,
          exists: true,
          confirmed: !!user.email_confirmed_at,
          email: user.email
        });
      } else {
        setUserStatus({
          loading: false,
          exists: false
        });
      }
    } catch (error) {
      console.error('[EMAIL-TEST] Error checking user:', error);
      setUserStatus({ loading: false });
    }
  };

  const getStatusIcon = (status: EmailTest['status']) => {
    switch (status) {
      case 'loading':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-400" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Mail className="w-10 h-10 text-blue-400" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Email Testing Dashboard
            </h1>
          </div>
          <p className="text-gray-300">Test all email functions in CampusSync</p>
          <p className="text-sm text-yellow-400 mt-2">[WARNING] Development Only - Remove in Production</p>
        </div>

        {/* Current User Status */}
        <div className="mb-8 p-6 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-400" />
            Current Session Status
          </h2>
          
          <button
            onClick={checkUserStatus}
            disabled={userStatus.loading}
            className="mb-4 px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-300 transition-colors disabled:opacity-50"
          >
            {userStatus.loading ? 'Checking...' : 'Check Session'}
          </button>

          {userStatus.exists !== undefined && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {userStatus.exists ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-400" />
                )}
                <span className="text-gray-300">
                  {userStatus.exists ? 'Logged In' : 'Not Logged In'}
                </span>
              </div>
              
              {userStatus.exists && (
                <>
                  <div className="flex items-center gap-2">
                    {userStatus.confirmed ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-yellow-400" />
                    )}
                    <span className="text-gray-300">
                      Email {userStatus.confirmed ? 'Verified' : 'Not Verified'}
                    </span>
                  </div>
                  <p className="text-gray-400 ml-6">
                    {userStatus.email}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Test Cards */}
        <div className="space-y-6">
          {/* Test 1: Signup Email */}
          <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  {getStatusIcon(tests.signup.status)}
                  1. Signup Verification Email
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Resend email verification for an unconfirmed account
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Enter email to test..."
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              
              <button
                onClick={testSignupEmail}
                disabled={tests.signup.status === 'loading'}
                className="w-full px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {tests.signup.status === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Signup Verification
                  </>
                )}
              </button>

              {tests.signup.message && (
                <div className={`p-3 rounded-lg text-sm ${
                  tests.signup.status === 'success' 
                    ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-300'
                }`}>
                  {tests.signup.message}
                </div>
              )}
            </div>
          </div>

          {/* Test 2: Password Reset */}
          <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  {getStatusIcon(tests.reset.status)}
                  2. Password Reset Email (Already Working!)
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Send password reset email with PKCE flow
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="Enter email to test..."
                className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
              
              <button
                onClick={testPasswordReset}
                disabled={tests.reset.status === 'loading'}
                className="w-full px-4 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {tests.reset.status === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Password Reset
                  </>
                )}
              </button>

              {tests.reset.message && (
                <div className={`p-3 rounded-lg text-sm ${
                  tests.reset.status === 'success' 
                    ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-300'
                }`}>
                  {tests.reset.message}
                </div>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="p-6 rounded-2xl bg-blue-500/5 border border-blue-400/20">
            <h3 className="text-lg font-semibold text-blue-300 mb-3">Testing Instructions</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex gap-2">
                <span className="text-blue-400">1.</span>
                <span>Use a real email address you can access</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">2.</span>
                <span>Check both inbox and spam folder</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">3.</span>
                <span>Email links expire after 1 hour</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">4.</span>
                <span>Free tier limit: 4 emails per hour</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">5.</span>
                <span>Check browser console for detailed logs</span>
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-3">Quick Links</h3>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="/signup"
                className="px-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 text-green-300 text-center transition-colors"
              >
                Test Signup Flow
              </a>
              <a
                href="/login"
                className="px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-300 text-center transition-colors"
              >
                Test Login
              </a>
              <a
                href="/reset-password"
                className="px-4 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-300 text-center transition-colors"
              >
                Password Reset Page
              </a>
              <a
                href="/docs/EMAIL_TESTING_GUIDE.md"
                target="_blank"
                className="px-4 py-2 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/30 text-yellow-300 text-center transition-colors"
              >
                Email Testing Guide
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
