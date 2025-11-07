/**
 * Signup Page
 * 
 * Entry point for new user registration with multi-step signup flow.
 * Maintains CampusSync dark glassmorphism theme.
 */

'use client';

import React from 'react';
import MultiStepSignup from '@/components/features/signup/MultiStepSignup';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// Static particle positions to avoid hydration mismatch
const particles = [
  { left: 76.55, top: 26.06, delay: 1.12, duration: 12.81 },
  { left: 70.88, top: 30.58, delay: 0.64, duration: 10.43 },
  { left: 41.55, top: 85.39, delay: 3.65, duration: 13.70 },
  { left: 14.82, top: 13.68, delay: 2.98, duration: 12.87 },
  { left: 48.30, top: 28.44, delay: 3.88, duration: 13.93 },
  { left: 34.00, top: 16.33, delay: 3.83, duration: 13.41 },
  { left: 84.22, top: 85.06, delay: 2.34, duration: 11.82 },
  { left: 94.87, top: 35.89, delay: 2.62, duration: 8.03 },
  { left: 65.25, top: 22.84, delay: 1.21, duration: 11.57 },
  { left: 80.41, top: 20.41, delay: 2.50, duration: 8.52 },
  { left: 14.02, top: 69.85, delay: 0.48, duration: 12.99 },
  { left: 61.03, top: 41.61, delay: 3.45, duration: 11.62 },
  { left: 23.75, top: 70.54, delay: 1.12, duration: 12.28 },
  { left: 24.35, top: 95.35, delay: 1.35, duration: 10.70 },
  { left: 9.19, top: 43.11, delay: 1.02, duration: 8.82 },
];

export default function SignupPage() {

  const handleSignupComplete = (data: { role: string | null; email: string; shouldSignIn?: boolean; requiresEmailVerification?: boolean }) => {
    // Check if this is an OAuth user or existing user who can sign in immediately
    const isOAuthUser = new URLSearchParams(window.location.search).get('oauth') === 'true';
    const shouldSignIn = data.shouldSignIn || isOAuthUser;
    
    if (shouldSignIn) {
      // OAuth users or existing users - redirect to login
      console.log('[SignupPage] OAuth/existing user, redirecting to login');
      window.location.href = '/login';
    } else {
      // Email/password users - redirect to email verification page
      console.log('[SignupPage] New email/password user, redirecting to email verification');
      const verifyUrl = `/signup/verify-email?email=${encodeURIComponent(data.email)}`;
      window.location.href = verifyUrl;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0">
        {/* Gradient orbs */}
        <div className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-blue-500/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[10%] right-[10%] w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        
        {/* Floating particles */}
        <div className="absolute inset-0">
          {particles.map((particle, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-blue-400/20 rounded-full animate-float"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`
              }}
            />
          ))}
        </div>
        
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

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="pt-6 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link 
              href="/" 
              className="flex items-center gap-3 group"
            >
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

            <Link
              href="/login"
              className="flex items-center gap-2 px-4 py-2 text-white/80 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to Login</span>
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-2xl">
            {/* Title */}
            <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="relative w-12 h-12">
                  <Image
                    src="/logo-clean.svg"
                    alt="CampusSync"
                    width={48}
                    height={48}
                    className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]"
                    priority
                  />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-white">
                  Join CampusSync
                </h1>
              </div>
              <p className="text-lg text-white/60">
                Create your account and start verifying credentials
              </p>
            </div>

            {/* Signup Component */}
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-700" style={{ animationDelay: '150ms' }}>
              <MultiStepSignup onComplete={handleSignupComplete} />
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 text-center text-sm text-white/50">
          <p>
            &copy; {new Date().getFullYear()} CampusSync. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
