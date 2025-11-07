'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Shield, Users, ArrowRight, CheckCircle, AlertCircle, ExternalLink, Copy, Check, Settings } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [envConfigured, setEnvConfigured] = useState(false);
  const [copied, setCopied] = useState('');
  const [diagnostics, setDiagnostics] = useState<{
    environment?: { hasUrl: boolean; hasKey: boolean };
    supabase?: { connection: boolean; auth: boolean; database: boolean; error?: string };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Deterministic particles
  const particles = useMemo(() => [
    { top: '10%', left: '10%', delay: '0s', duration: '4s' },
    { top: '20%', left: '80%', delay: '0.5s', duration: '3.5s' },
    { top: '60%', left: '15%', delay: '1s', duration: '4.5s' },
    { top: '75%', left: '75%', delay: '1.5s', duration: '3s' },
    { top: '40%', left: '50%', delay: '2s', duration: '5s' },
  ], []);

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
        
        setEnvConfigured(envData.data.configured);
        setDiagnostics(diagData.data);
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

# OAuth Configuration (Optional - for Google login)
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Email Configuration (Optional - for email invitations)
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
        {/* Animated Background */}
        {particles.map((particle, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-white/20 rounded-full"
            style={{
              top: particle.top,
              left: particle.left,
              animation: `float ${particle.duration} ease-in-out infinite`,
              animationDelay: particle.delay
            }}
          />
        ))}
        
        {/* Gradient Orbs */}
        <div className="absolute top-20 left-10 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s' }} />
        
        {/* Grid Overlay */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:radial-gradient(white,transparent_85%)] opacity-10" />

        <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
          <div className="text-center">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-3xl blur-2xl opacity-40" />
              <div className="relative p-8 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-3xl border border-white/10">
                <Settings className="w-16 h-16 text-white animate-spin" style={{ animationDuration: '3s' }} />
              </div>
            </div>
            <h1 className="text-4xl font-extrabold mb-4 bg-gradient-to-r from-blue-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent animate-gradient">
              Checking System Status...
            </h1>
            <p className="text-white/70 text-lg font-medium">Please wait while we diagnose your setup</p>
          </div>
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
  if (envConfigured && diagnostics?.supabase && !diagnostics.supabase.database) {
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
                    {diagnostics.environment?.hasUrl ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">Supabase URL: {diagnostics.environment?.hasUrl ? 'Configured' : 'Missing'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {diagnostics.environment?.hasKey ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">API Key: {diagnostics.environment?.hasKey ? 'Configured' : 'Missing'}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Supabase</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {diagnostics.supabase?.connection ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">Connection: {diagnostics.supabase?.connection ? 'Working' : 'Failed'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {diagnostics.supabase?.auth ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">Authentication: {diagnostics.supabase?.auth ? 'Working' : 'Failed'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {diagnostics.supabase?.database ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
                    <span className="text-white/80">Database: {diagnostics.supabase?.database ? 'Ready' : 'Needs Setup'}</span>
                  </div>
                </div>
              </div>
            </div>

            {diagnostics.supabase?.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <p className="text-red-200 text-sm">
                  <strong>Error:</strong> {diagnostics.supabase?.error}
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Animated Background */}
      {particles.map((particle, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 bg-white/20 rounded-full"
          style={{
            top: particle.top,
            left: particle.left,
            animation: `float ${particle.duration} ease-in-out infinite`,
            animationDelay: particle.delay
          }}
        />
      ))}
      
      {/* Gradient Orbs */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s' }} />
      
      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:radial-gradient(white,transparent_85%)] opacity-10" />

      {/* Top Logo and Back to Home Button (floating, as in landing/header) */}
  <div className="relative z-20 w-full flex items-center justify-between pt-6">
        {/* Logo and text (left) - match header style */}
  <Link href="/" className="flex items-center gap-3 group select-none ml-8 md:ml-16">
          <div className="relative w-9 h-9 transition-all duration-300 group-hover:scale-110">
            <Image
              src="/logo-clean.svg"
              alt="CampusSync"
              width={36}
              height={36}
              className="w-full h-full object-contain transition-all duration-300 group-hover:brightness-110 group-hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]"
              priority
            />
          </div>
          <div className="flex flex-col -space-y-1">
            <span className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors duration-300">
              CampusSync
            </span>
            <span className="text-[10px] font-medium text-gray-400 tracking-wider uppercase">
              Verified Credentials
            </span>
          </div>
        </Link>
        {/* Back to Home (right) */}
        <button
          onClick={() => window.location.href = '/'}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl font-semibold transition-all shadow-lg hover:scale-105 mr-8 md:mr-16"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          <span>Back to Home</span>
        </button>
      </div>

      <div className="relative z-10 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-3xl blur-2xl opacity-40" />
              <div className="relative p-6 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl rounded-3xl border border-white/10">
                <Settings className="w-16 h-16 text-white drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-blue-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent animate-gradient">
              CampusSync Setup
            </h1>
            <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto font-medium">
              Get started with CampusSync. Choose your role to begin the setup process.
            </p>
          </div>

          {/* Setup Options */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* Admin Setup */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-3xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity" />
              <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 hover:scale-105 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="relative mr-4">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-lg opacity-40" />
                    <div className="relative w-14 h-14 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Shield className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Admin Setup</h2>
                    <p className="text-white/60 font-medium">Create the first admin account</p>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80 font-medium">Create first admin user</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80 font-medium">Manage user roles</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80 font-medium">Configure system settings</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80 font-medium">Add educational domains</span>
                  </div>
                </div>

                <button
                  onClick={handleAdminSetup}
                  className="group/btn relative overflow-hidden w-full bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white px-6 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105 flex items-center justify-center gap-2"
                >
                  <Shield className="w-5 h-5 relative z-10" />
                  <span className="relative z-10">Setup Admin Account</span>
                  <ArrowRight className="w-4 h-4 relative z-10" />
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                </button>

                <div className="mt-4 p-3.5 bg-blue-500/10 border border-blue-400/30 rounded-xl backdrop-blur-xl">
                  <p className="text-blue-300 text-sm font-medium leading-relaxed">
                    <strong className="font-bold">Note:</strong> Admin key is optional for the first admin. You can create additional admins later.
                  </p>
                </div>
              </div>
            </div>

            {/* Student Signup */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-3xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity" />
              <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 hover:scale-105 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="relative mr-4">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur-lg opacity-40" />
                    <div className="relative w-14 h-14 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Users className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Student Signup</h2>
                    <p className="text-white/60 font-medium">Create your student account</p>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80 font-medium">Use educational email</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80 font-medium">Upload certificates</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80 font-medium">Build your portfolio</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-white/80 font-medium">Share achievements</span>
                  </div>
                </div>

                <button
                  onClick={handleStudentSignup}
                  className="group/btn relative overflow-hidden w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 text-white px-6 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-105 flex items-center justify-center gap-2"
                >
                  <Users className="w-5 h-5 relative z-10" />
                  <span className="relative z-10">Create Student Account</span>
                  <ArrowRight className="w-4 h-4 relative z-10" />
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                </button>

                <div className="mt-4 p-3.5 bg-emerald-500/10 border border-emerald-400/30 rounded-xl backdrop-blur-xl">
                  <p className="text-emerald-300 text-sm font-medium leading-relaxed">
                    <strong className="font-bold">Note:</strong> You need an educational email address (e.g., student@university.edu)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Start Guide */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8">
            <h3 className="text-2xl font-bold mb-8 text-center bg-gradient-to-r from-blue-300 to-emerald-300 bg-clip-text text-transparent">
              Quick Start Guide
            </h3>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-lg opacity-40" />
                  <div className="relative w-14 h-14 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                    <span className="text-white font-extrabold text-xl">1</span>
                  </div>
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Admin Setup</h4>
                <p className="text-white/60 text-sm font-medium leading-relaxed">
                  Create the first admin account to manage the system
                </p>
              </div>

              <div className="text-center">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur-lg opacity-40" />
                  <div className="relative w-14 h-14 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto">
                    <span className="text-white font-extrabold text-xl">2</span>
                  </div>
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Configure Domains</h4>
                <p className="text-white/60 text-sm font-medium leading-relaxed">
                  Add educational domains for your institution
                </p>
              </div>

              <div className="text-center">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl blur-lg opacity-40" />
                  <div className="relative w-14 h-14 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                    <span className="text-white font-extrabold text-xl">3</span>
                  </div>
                </div>
                <h4 className="text-lg font-bold text-white mb-2">Student Access</h4>
                <p className="text-white/60 text-sm font-medium leading-relaxed">
                  Students can now sign up and start using CampusSync
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
