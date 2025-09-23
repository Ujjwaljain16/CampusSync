'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, User, Mail, Lock, CheckCircle, AlertCircle, Loader } from 'lucide-react';

export default function AdminSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    adminKey: ''
  });
  const [showAdminKey, setShowAdminKey] = useState(false);

  // Check if setup is needed
  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        const response = await fetch('/api/admin/setup');
        const data = await response.json();
        
        if (response.ok) {
          setNeedsSetup(data.needsSetup);
          if (!data.needsSetup) {
            // Admin already exists, redirect to dashboard
            router.push('/admin/dashboard');
          }
        } else {
          setError(data.error || 'Failed to check setup status');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    checkSetupStatus();
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setSubmitting(false);
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      setSubmitting(false);
      return;
    }

    // For first admin, admin key is optional
    if (!formData.adminKey && !needsSetup) {
      setError('Admin setup key is required for additional admins');
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          adminKey: formData.adminKey
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/admin/dashboard');
        }, 2000);
      } else {
        setError(data.error || 'Failed to create admin user');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-white mx-auto mb-4" />
          <p className="text-white/80">Checking setup status...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Admin Setup Complete!</h1>
          <p className="text-white/80 mb-6">Redirecting to admin dashboard...</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!needsSetup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-blue-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Admin Already Exists</h1>
          <p className="text-white/80 mb-6">Redirecting to admin dashboard...</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mb-6">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Admin Setup</h1>
          <p className="text-white/80 text-lg">
            Create the first admin user for CampusSync
          </p>
        </div>

        {/* Setup Form */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Admin Key */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="adminKey" className="block text-white font-semibold">
                  Admin Setup Key
                </label>
                {needsSetup && (
                  <button
                    type="button"
                    onClick={() => setShowAdminKey(!showAdminKey)}
                    className="text-blue-400 hover:text-blue-300 text-sm underline"
                  >
                    {showAdminKey ? 'Hide' : 'Why do I need this?'}
                  </button>
                )}
              </div>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  type="text"
                  id="adminKey"
                  name="adminKey"
                  value={formData.adminKey}
                  onChange={handleInputChange}
                  placeholder={needsSetup ? "Optional for first admin" : "Enter admin setup key"}
                  required={!needsSetup}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {showAdminKey && needsSetup && (
                <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-blue-200 text-sm">
                    <strong>For first admin:</strong> Admin key is optional. You can leave this blank to create the first admin user.
                  </p>
                  <p className="text-blue-200 text-sm mt-1">
                    <strong>For additional admins:</strong> You'll need the admin setup key from your system administrator.
                  </p>
                </div>
              )}
              {!needsSetup && (
                <p className="text-white/60 text-sm mt-1">
                  Contact your system administrator for the setup key
                </p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="block text-white font-semibold mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="Enter your full name"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-white font-semibold mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="admin@university.edu"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-white font-semibold mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Create a strong password"
                  required
                  minLength={8}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-white font-semibold mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirm your password"
                  required
                  minLength={8}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-4 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25 transform hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Creating Admin User...</span>
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  <span>Create Admin User</span>
                </>
              )}
            </button>
          </form>

          {/* Instructions */}
          <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <h3 className="text-blue-300 font-semibold mb-2">Setup Instructions:</h3>
            <ul className="text-blue-200 text-sm space-y-1">
              <li>• Use a strong password (at least 8 characters)</li>
              <li>• Use an educational email address if possible</li>
              <li>• The admin setup key is required for security</li>
              <li>• You'll be redirected to the admin dashboard after setup</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
