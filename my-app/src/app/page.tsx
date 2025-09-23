'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Zap, Palette, GraduationCap, Smartphone, Star, ChevronRight, Play, Check, ArrowRight, Globe, Users, Award, Lock, Eye, Upload, Menu, X } from 'lucide-react';

interface ScrollPosition {
  y: number;
}

export default function EnhancedLandingPage() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [scrollY, setScrollY] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    const handleScrollVisibility = () => {
      setIsVisible(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScrollVisibility, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScrollVisibility);
    };
  }, []);

  const handleSmoothScroll = (elementId: string) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const handleSignIn = () => {
    router.push('/login');
  };

  const handleGetStarted = () => {
    router.push('/login');
  };

  const handleUploadCertificate = () => {
    router.push('/login');
  };

  const handleWatchDemo = () => {
    // For now, just scroll to features section
    handleSmoothScroll('features');
  };

  const handleScheduleDemo = () => {
    // For now, just scroll to features section
    handleSmoothScroll('features');
  };

  const handleAdminSetup = () => {
    router.push('/admin/setup');
  };

  const handleSetup = () => {
    router.push('/setup');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrollY > 50 
          ? 'bg-slate-900/95 backdrop-blur-xl border-b border-white/20 shadow-2xl' 
          : 'bg-white/10 backdrop-blur-lg border-b border-white/10'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 ${
                scrollY > 50 ? 'scale-110 shadow-blue-500/25' : ''
              }`}>
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                CampusSync
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <button 
                onClick={() => handleSmoothScroll('features')}
                className="text-white/80 hover:text-white font-medium transition-all duration-200 hover:scale-105 relative group"
              >
                Features
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-300 group-hover:w-full"></span>
              </button>
              <button 
                onClick={() => handleSmoothScroll('how-it-works')}
                className="text-white/80 hover:text-white font-medium transition-all duration-200 hover:scale-105 relative group"
              >
                How it Works
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-300 group-hover:w-full"></span>
              </button>
              <button 
                onClick={() => handleSmoothScroll('pricing')}
                className="text-white/80 hover:text-white font-medium transition-all duration-200 hover:scale-105 relative group"
              >
                Pricing
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-300 group-hover:w-full"></span>
              </button>
              <button 
                onClick={() => handleSmoothScroll('about')}
                className="text-white/80 hover:text-white font-medium transition-all duration-200 hover:scale-105 relative group"
              >
                About
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-300 group-hover:w-full"></span>
              </button>
            </div>

            <div className="hidden md:flex items-center space-x-4">
              <button 
                onClick={handleSignIn}
                className="text-white/80 hover:text-white font-medium transition-all duration-200 hover:scale-105"
              >
                Sign In
              </button>
              <button 
                onClick={handleSetup}
                className="text-white/80 hover:text-white font-medium transition-all duration-200 hover:scale-105"
              >
                Setup
              </button>
              <button 
                onClick={handleGetStarted}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25 transform hover:-translate-y-1 hover:scale-105 flex items-center gap-2 group"
              >
                <Upload className="w-4 h-4 transition-transform group-hover:scale-110" />
                Get Started
              </button>
            </div>

            {/* Mobile menu button */}
            <button 
              className="md:hidden text-white transition-transform duration-200 hover:scale-110"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className={`md:hidden transition-all duration-300 overflow-hidden ${
          mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="bg-slate-900/95 backdrop-blur-lg border-t border-white/10">
            <div className="px-4 py-6 space-y-4">
              <button 
                onClick={() => {
                  handleSmoothScroll('features');
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left text-white/80 hover:text-white font-medium py-2 transition-colors"
              >
                Features
              </button>
              <button 
                onClick={() => {
                  handleSmoothScroll('how-it-works');
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left text-white/80 hover:text-white font-medium py-2 transition-colors"
              >
                How it Works
              </button>
              <button 
                onClick={() => {
                  handleSmoothScroll('pricing');
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left text-white/80 hover:text-white font-medium py-2 transition-colors"
              >
                Pricing
              </button>
              <button 
                onClick={() => {
                  handleSmoothScroll('about');
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left text-white/80 hover:text-white font-medium py-2 transition-colors"
              >
                About
              </button>
              <div className="pt-4 border-t border-white/10 space-y-3">
                <button 
                  onClick={() => {
                    handleSignIn();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left text-white/80 hover:text-white font-medium py-2 transition-colors"
                >
                  Sign In
                </button>
                <button 
                  onClick={() => {
                    handleSetup();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left text-white/80 hover:text-white font-medium py-2 transition-colors"
                >
                  Setup
                </button>
                <button 
                  onClick={() => {
                    handleGetStarted();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-20">
        <section className="relative overflow-hidden py-20 lg:py-32">
          {/* Enhanced Background Effects with Parallax */}
          <div className="absolute inset-0">
            <div 
              className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl transition-transform duration-1000"
              style={{ transform: `translateY(${scrollY * 0.2}px) rotate(${scrollY * 0.1}deg)` }}
            ></div>
            <div 
              className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl transition-transform duration-1000"
              style={{ transform: `translateY(${scrollY * -0.3}px) rotate(${scrollY * -0.1}deg)` }}
            ></div>
            <div 
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl transition-transform duration-1000"
              style={{ transform: `translate(-50%, -50%) scale(${1 + scrollY * 0.001})` }}
            ></div>
            
            {/* Animated Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-blue-900/10 to-purple-900/20 animate-pulse"></div>
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-8">
              {/* Trust Badge with enhanced animation */}
              <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm px-6 py-3 rounded-full border border-white/20 hover:bg-white/20 hover:scale-105 transition-all duration-300 group">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <Star className="w-4 h-4 text-yellow-400 fill-current group-hover:rotate-12 transition-transform" />
                  <span className="text-sm font-medium text-white/90">
                    Trusted by 10,000+ students worldwide
                  </span>
                </div>
              </div>

              {/* Main Heading with staggered animation */}
              <div className="space-y-8">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white leading-tight tracking-tight max-w-5xl mx-auto">
                  <span className="inline-block animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    Secure Your Academic
                  </span>
                  <br />
                  <span className="inline-block bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                    Future Today
                  </span>
                </h1>
                <p className="text-lg sm:text-xl lg:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
                  Transform your certificates into blockchain-verified digital credentials. 
                  Build professional portfolios that employers trust and verify instantly.
                </p>
              </div>

              {/* Enhanced CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-12 animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
                <button 
                  onClick={handleUploadCertificate}
                  className="group bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-purple-500/25 transform hover:-translate-y-1 hover:scale-105 flex items-center gap-3 w-full sm:w-auto sm:min-w-[280px] justify-center relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <Upload className="w-5 h-5 transition-all duration-300 group-hover:scale-110 relative z-10" />
                  <span className="relative z-10">Upload Your First Certificate</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300 relative z-10" />
                </button>
                <button 
                  onClick={handleWatchDemo}
                  className="group bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-xl font-semibold text-lg border border-white/20 hover:bg-white/20 hover:border-white/30 transition-all duration-300 hover:scale-105 flex items-center gap-3 w-full sm:w-auto sm:min-w-[280px] justify-center"
                >
                  <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  Watch Demo
                </button>
              </div>

              {/* Enhanced Stats with scroll animation */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-20 max-w-5xl mx-auto">
                <div className="text-center group cursor-pointer p-4">
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-3 group-hover:scale-110 transition-all duration-300">
                    50K+
                  </div>
                  <div className="text-white/80 font-medium text-sm sm:text-base group-hover:text-white transition-colors">Verified Certificates</div>
                </div>
                <div className="text-center group cursor-pointer p-4">
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-3 group-hover:scale-110 transition-all duration-300">
                    1,200+
                  </div>
                  <div className="text-white/80 font-medium text-sm sm:text-base group-hover:text-white transition-colors">Partner Institutions</div>
                </div>
                <div className="text-center group cursor-pointer p-4">
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-3 group-hover:scale-110 transition-all duration-300">
                    99.9%
                  </div>
                  <div className="text-white/80 font-medium text-sm sm:text-base group-hover:text-white transition-colors">Verification Accuracy</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section with enhanced scroll animations */}
        <section id="features" className="py-20 lg:py-32 bg-white relative overflow-hidden">
          {/* Animated background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-purple-100"></div>
            <div 
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.1) 1px, transparent 0)',
                backgroundSize: '40px 40px',
                transform: `translateY(${scrollY * 0.1}px)`
              }}
            ></div>
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-20">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-8 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                Why Choose CampusSync?
              </h2>
              <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed opacity-0 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                Our comprehensive platform provides everything you need to manage, verify, 
                and showcase your academic credentials with confidence.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
              {/* Feature 1 with enhanced interactions */}
              <div className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 border border-gray-100 hover:border-blue-200 hover:-translate-y-4 hover:scale-105 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="flex items-center mb-6">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:shadow-blue-500/25 transition-all duration-300 group-hover:rotate-6 group-hover:scale-110">
                      <Shield className="w-7 h-7 text-white group-hover:animate-pulse" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 ml-4 group-hover:text-blue-600 transition-colors">Blockchain Security</h3>
                  </div>
                  <p className="text-gray-600 leading-relaxed mb-6 group-hover:text-gray-800 transition-colors">
                    Your certificates are secured using advanced blockchain technology, ensuring 
                    immutable proof of authenticity and preventing fraud.
                  </p>
                  <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-semibold group-hover:bg-green-100 transition-colors">
                    <Check className="w-4 h-4" />
                    Cryptographically Verified
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500 border border-gray-100 hover:border-purple-200 hover:-translate-y-4 hover:scale-105 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="flex items-center mb-6">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:shadow-purple-500/25 transition-all duration-300 group-hover:rotate-6 group-hover:scale-110">
                      <Zap className="w-7 h-7 text-white group-hover:animate-bounce" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 ml-4 group-hover:text-purple-600 transition-colors">Instant Verification</h3>
                  </div>
                  <p className="text-gray-600 leading-relaxed mb-6 group-hover:text-gray-800 transition-colors">
                    Employers and institutions can instantly verify your credentials with a simple click. 
                    No more waiting for manual verification processes.
                  </p>
                  <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold group-hover:bg-blue-100 transition-colors">
                    <Zap className="w-4 h-4" />
                    Lightning Fast
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:shadow-pink-500/10 transition-all duration-500 border border-gray-100 hover:border-pink-200 hover:-translate-y-4 hover:scale-105 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-pink-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="flex items-center mb-6">
                    <div className="w-14 h-14 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:shadow-pink-500/25 transition-all duration-300 group-hover:rotate-6 group-hover:scale-110">
                      <Palette className="w-7 h-7 text-white group-hover:animate-spin" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 ml-4 group-hover:text-pink-600 transition-colors">Portfolio Builder</h3>
                  </div>
                  <p className="text-gray-600 leading-relaxed mb-6 group-hover:text-gray-800 transition-colors">
                    Create stunning digital portfolios that showcase your achievements with 
                    customizable themes and professional layouts.
                  </p>
                  <div className="inline-flex items-center gap-2 bg-pink-50 text-pink-700 px-4 py-2 rounded-full text-sm font-semibold group-hover:bg-pink-100 transition-colors">
                    <Eye className="w-4 h-4" />
                    Beautifully Designed
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Additional Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100 hover:border-blue-200 transition-all duration-300 hover:scale-105 hover:shadow-lg group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center mr-4 group-hover:rotate-12 transition-transform">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Academic Integration</h4>
                </div>
                <p className="text-gray-700 leading-relaxed group-hover:text-gray-800 transition-colors">
                  Seamlessly connect with over 1,200 universities and educational institutions 
                  worldwide for automatic credential importing and verification.
                </p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border border-green-100 hover:border-green-200 transition-all duration-300 hover:scale-105 hover:shadow-lg group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center mr-4 group-hover:rotate-12 transition-transform">
                    <Smartphone className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 group-hover:text-green-600 transition-colors">Mobile Optimized</h4>
                </div>
                <p className="text-gray-700 leading-relaxed group-hover:text-gray-800 transition-colors">
                  Access your credentials anywhere, anytime with our responsive design and 
                  mobile-optimized experience that works flawlessly on all devices.
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-8 border border-purple-100 hover:border-purple-200 transition-all duration-300 hover:scale-105 hover:shadow-lg group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-600 rounded-lg flex items-center justify-center mr-4 group-hover:rotate-12 transition-transform">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 group-hover:text-purple-600 transition-colors">Global Recognition</h4>
                </div>
                <p className="text-gray-700 leading-relaxed group-hover:text-gray-800 transition-colors">
                  Your credentials are recognized worldwide with international standards 
                  compliance and multi-language support for global opportunities.
                </p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-8 border border-orange-100 hover:border-orange-200 transition-all duration-300 hover:scale-105 hover:shadow-lg group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center mr-4 group-hover:rotate-12 transition-transform">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 group-hover:text-orange-600 transition-colors">Recruiter Network</h4>
                </div>
                <p className="text-gray-700 leading-relaxed group-hover:text-gray-800 transition-colors">
                  Connect directly with top employers and recruiters who trust our verification 
                  system and actively search for verified talent.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Enhanced Social Proof Section */}
        <section className="py-20 bg-gray-50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-50 via-white to-gray-50"></div>
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 hover:scale-105 transition-transform duration-300">
              Trusted by Leading Institutions
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center">
              {['MIT', 'Stanford', 'Harvard', 'Oxford'].map((institution, index) => (
                <div 
                  key={institution}
                  className="h-12 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg flex items-center justify-center font-semibold text-gray-600 hover:from-blue-100 hover:to-purple-100 hover:text-gray-800 hover:scale-110 hover:shadow-lg transition-all duration-300 cursor-pointer transform"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {institution}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Enhanced CTA Section */}
        <section className="py-20 bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 relative overflow-hidden">
          {/* Enhanced Background Effects */}
          <div className="absolute inset-0">
            <div 
              className="absolute top-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
              style={{ transform: `translateY(${scrollY * 0.1}px) rotate(${scrollY * 0.05}deg)` }}
            ></div>
            <div 
              className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
              style={{ transform: `translateY(${scrollY * -0.1}px) rotate(${scrollY * -0.05}deg)` }}
            ></div>
          </div>
          
          <div className="relative max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20 mb-8 hover:bg-white/20 hover:scale-105 transition-all duration-300 group">
              <Award className="w-4 h-4 text-yellow-400 group-hover:rotate-12 transition-transform" />
              <span className="text-sm font-medium text-white/90">
                Join the Future of Credentials
              </span>
            </div>
            
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6 hover:scale-105 transition-transform duration-300">
              Ready to Secure Your Future?
            </h2>
            <p className="text-xl text-white/80 mb-10 leading-relaxed max-w-3xl mx-auto hover:text-white transition-colors duration-300">
              Join thousands of students who trust CampusSync to manage and showcase 
              their academic achievements. Get started in less than 2 minutes.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={handleGetStarted}
                className="group bg-white text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-2 hover:scale-105 flex items-center gap-3 justify-center relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-200/50 to-transparent transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                <Upload className="w-5 h-5 group-hover:rotate-12 transition-transform relative z-10" />
                <span className="relative z-10">Get Started Free</span>
                <ChevronRight className="w-5 h-5 group-hover:translate-x-2 transition-transform relative z-10" />
              </button>
              <button 
                onClick={handleScheduleDemo}
                className="group bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-lg font-semibold text-lg border border-white/20 hover:bg-white/20 hover:border-white/30 transition-all duration-300 hover:scale-105 flex items-center gap-3 justify-center"
              >
                <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                Schedule Demo
              </button>
            </div>
            
            <p className="text-white/60 text-sm mt-6 hover:text-white/80 transition-colors duration-300">
              No credit card required • Set up in 2 minutes • Free forever
            </p>
          </div>
        </section>

        {/* Enhanced Footer */}
        <footer className="bg-gray-900 text-white py-16 relative overflow-hidden">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div 
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255, 255, 255, 0.15) 1px, transparent 0)',
                backgroundSize: '40px 40px'
              }}
            ></div>
          </div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div className="space-y-4 group">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent group-hover:scale-105 transition-transform">
                    CampusSync
                  </span>
                </div>
                <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                  Secure, verify, and showcase your academic achievements with blockchain-powered digital credentials.
                </p>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-bold mb-4 text-lg group-hover:text-blue-400 transition-colors cursor-pointer">Platform</h4>
                <ul className="space-y-3 text-gray-400">
                  {['Dashboard', 'Certificates', 'Portfolio', 'Verification'].map((item) => (
                    <li key={item}>
                      <a href="#" className="hover:text-white hover:translate-x-2 transition-all duration-200 inline-block">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-bold mb-4 text-lg group-hover:text-purple-400 transition-colors cursor-pointer">Support</h4>
                <ul className="space-y-3 text-gray-400">
                  {['Help Center', 'Contact Us', 'API Documentation', 'System Status'].map((item) => (
                    <li key={item}>
                      <a href="#" className="hover:text-white hover:translate-x-2 transition-all duration-200 inline-block">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-bold mb-4 text-lg group-hover:text-pink-400 transition-colors cursor-pointer">Legal</h4>
                <ul className="space-y-3 text-gray-400">
                  {['Privacy Policy', 'Terms of Service', 'Security', 'Compliance'].map((item) => (
                    <li key={item}>
                      <a href="#" className="hover:text-white hover:translate-x-2 transition-all duration-200 inline-block">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
              <p className="text-gray-400 text-center md:text-left hover:text-gray-300 transition-colors">
                &copy; 2024 CampusSync. All rights reserved.
              </p>
              <div className="flex space-x-6 mt-4 md:mt-0">
                {['Twitter', 'LinkedIn', 'GitHub'].map((social) => (
                  <a 
                    key={social}
                    href="#" 
                    className="text-gray-400 hover:text-white hover:scale-110 transition-all duration-200"
                  >
                    {social}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </footer>

        {/* Scroll to top button */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`fixed bottom-8 right-8 z-50 bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 rounded-full shadow-lg transition-all duration-300 ${
            isVisible 
              ? 'opacity-100 translate-y-0 hover:scale-110 hover:shadow-xl hover:shadow-purple-500/25' 
              : 'opacity-0 translate-y-10 pointer-events-none'
          }`}
          aria-label="Scroll to top"
        >
          <ChevronRight className="w-5 h-5 rotate-[-90deg]" />
        </button>
      </main>

    </div>
  );
}