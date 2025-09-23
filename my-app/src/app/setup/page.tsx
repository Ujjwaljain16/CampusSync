'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Users, Mail, Lock, ArrowRight, CheckCircle, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [envConfigured, setEnvConfigured] = useState(false);
  const [copied, setCopied] = useState('');
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check system diagnostics
    const checkDiagnostics = async () => {
      try {
        const [envResponse, diagResponse] = await Promise.all([
          fetch('/api/auth/check-env'),
          fetch('/api/diagnose')
        ]);
        
        const envData = await envResponse.json();
        const diagData = await diagResponse.json();
        
        setEnvConfigured(envData.configured);
        setDiagnostics(diagData);
      } catch (error) {
        console.error('Error checking diagnostics:', error);
        setEnvConfigured(false);
      } finally {
        setLoading(false);
      }
    };
    checkDiagnostics();
  }, []);

  const handleAdminSetup = () => {
    router.push('/admin/setup');
  };

  const handleStudentSignup = () => {
    router.push('/login');
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(''), 2000);
  };

  const envExample = `# Supabase Configuration
# Copy this file to .env.local and replace with your actual Supabase project values
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OAuth Configuration (Optional - for Google/Microsoft login)
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# Email Configuration (Optional - for email invitations)
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mb-6">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Checking System Status...</h1>
          <p className="text-white/80">Please wait while we diagnose your setup</p>
        </div>
      </div>
    );
  }

  if (!envConfigured) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-red-500 to-orange-600 rounded-2xl mb-6">
              <AlertCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Environment Setup Required
            </h1>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto">
              CampusSync needs to be configured with your Supabase credentials before you can use it.
            </p>
          </div>

          {/* Environment Setup Instructions */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Step 1: Create Environment File</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">1. Create .env.local file</h3>
                <p className="text-white/80 mb-4">
                  Create a file named <code className="bg-white/10 px-2 py-1 rounded">.env.local</code> in your project root directory.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">2. Add your Supabase credentials</h3>
                <p className="text-white/80 mb-4">
                  Copy the following template and replace the placeholder values with your actual Supabase project details:
                </p>
                
                <div className="relative">
                  <pre className="bg-slate-900/50 border border-white/10 rounded-lg p-4 text-sm text-white/90 overflow-x-auto">
                    <code>{envExample}</code>
                  </pre>
                  <button
                    onClick={() => copyToClipboard(envExample, 'env')}
                    className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    {copied === 'env' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">3. Get your Supabase credentials</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <ExternalLink className="w-5 h-5 text-blue-400" />
                    <a 
                      href="https://supabase.com/dashboard" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Go to Supabase Dashboard
                    </a>
                  </div>
                  <p className="text-white/80 text-sm ml-8">
                    Navigate to your project → Settings → API to find your URL and keys
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">4. Restart your development server</h3>
                <p className="text-white/80">
                  After creating the .env.local file, restart your Next.js development server:
                </p>
                <div className="bg-slate-900/50 border border-white/10 rounded-lg p-4 mt-2">
                  <code className="text-green-400">npm run dev</code>
                </div>
              </div>
            </div>
          </div>

          {/* Back to Home */}
          <div className="text-center">
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors group"
            >
              <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
              <span>Back to Home</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show database setup if environment is configured but database is not working
  if (envConfigured && diagnostics && !diagnostics.supabase.database) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-2xl mb-6">
              <AlertCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Database Setup Required
            </h1>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto">
              Your Supabase connection is working, but the database needs to be set up with the required tables.
            </p>
          </div>

          {/* Diagnostic Info */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">System Status</h2>
            
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Environment</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {diagnostics.environment.hasUrl ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">Supabase URL: {diagnostics.environment.hasUrl ? 'Configured' : 'Missing'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {diagnostics.environment.hasKey ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">API Key: {diagnostics.environment.hasKey ? 'Configured' : 'Missing'}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Supabase</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {diagnostics.supabase.connection ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">Connection: {diagnostics.supabase.connection ? 'Working' : 'Failed'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {diagnostics.supabase.auth ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">Authentication: {diagnostics.supabase.auth ? 'Working' : 'Failed'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {diagnostics.supabase.database ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">Database: {diagnostics.supabase.database ? 'Ready' : 'Needs Setup'}</span>
                  </div>
                </div>
              </div>
            </div>

            {diagnostics.supabase.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <p className="text-red-200 text-sm">
                  <strong>Error:</strong> {diagnostics.supabase.error}
                </p>
              </div>
            )}
          </div>

          {/* Database Setup Instructions */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Step 2: Set Up Database</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">1. Go to Supabase Dashboard</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <ExternalLink className="w-5 h-5 text-blue-400" />
                    <a 
                      href="https://supabase.com/dashboard" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Open Supabase Dashboard
                    </a>
                  </div>
                  <p className="text-white/80 text-sm ml-8">
                    Navigate to your project → SQL Editor
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">2. Run Database Migrations</h3>
                <p className="text-white/80 mb-4">
                  Copy and run the following SQL migrations in order in your Supabase SQL Editor:
                </p>
                
                <div className="space-y-4">
                  {[
                    '001_create_user_roles.sql',
                    '002_fix_user_roles_policies.sql', 
                    '003_fix_recursion_completely.sql',
                    '003_disable_rls_temporarily.sql',
                    '004_enable_pgcrypto.sql',
                    '005_add_verification_tables.sql',
                    '006_fix_user_role_trigger.sql',
                    '007_disable_user_roles_rls.sql',
                    '008_create_get_user_role_function.sql',
                    '009_harden_assign_default_role.sql',
                    '010_assign_default_role_exception_guard.sql',
                    '011_add_vc_revocation.sql',
                    '012_add_allowed_domains.sql'
                  ].map((file, index) => (
                    <div key={file} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                      <span className="text-white/60 text-sm w-8">{index + 1}.</span>
                      <code className="text-green-400 text-sm flex-1">{file}</code>
                      <button
                        onClick={() => copyToClipboard(`-- Run this in Supabase SQL Editor\n-- File: ${file}\n\n-- Copy the contents of supabase-migrations/${file}`, file)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                      >
                        {copied === file ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">3. Verify Setup</h3>
                <p className="text-white/80 mb-4">
                  After running all migrations, refresh this page to verify the setup is complete.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300"
                >
                  Refresh Status
                </button>
              </div>
            </div>
          </div>

          {/* Back to Home */}
          <div className="text-center">
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors group"
            >
              <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
              <span>Back to Home</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mb-6">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            CampusSync Setup
          </h1>
          <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto">
            Get started with CampusSync. Choose your role to begin the setup process.
          </p>
        </div>

        {/* Setup Options */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Admin Setup */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 group">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-orange-600 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Admin Setup</h2>
                <p className="text-white/70">Create the first admin account</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white/80">Create first admin user</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white/80">Manage user roles</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white/80">Configure system settings</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white/80">Add educational domains</span>
              </div>
            </div>

            <button
              onClick={handleAdminSetup}
              className="w-full bg-gradient-to-r from-red-500 to-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-red-600 hover:to-orange-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-red-500/25 transform hover:-translate-y-1 hover:scale-105 flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              Setup Admin Account
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-blue-200 text-sm">
                <strong>Note:</strong> Admin key is optional for the first admin. You can create additional admins later.
              </p>
            </div>
          </div>

          {/* Student Signup */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 group">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Student Signup</h2>
                <p className="text-white/70">Create your student account</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white/80">Use educational email</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white/80">Upload certificates</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white/80">Build your portfolio</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white/80">Share achievements</span>
              </div>
            </div>

            <button
              onClick={handleStudentSignup}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25 transform hover:-translate-y-1 hover:scale-105 flex items-center justify-center gap-2"
            >
              <Users className="w-5 h-5" />
              Create Student Account
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-green-200 text-sm">
                <strong>Note:</strong> You need an educational email address (e.g., student@university.edu)
              </p>
            </div>
          </div>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">Quick Start Guide</h3>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-xl">1</span>
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">Admin Setup</h4>
              <p className="text-white/70 text-sm">
                Create the first admin account to manage the system
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-xl">2</span>
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">Configure Domains</h4>
              <p className="text-white/70 text-sm">
                Add educational domains for your institution
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-xl">3</span>
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">Student Access</h4>
              <p className="text-white/70 text-sm">
                Students can now sign up and start using CampusSync
              </p>
            </div>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors group"
          >
            <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    </div>
  );
}
