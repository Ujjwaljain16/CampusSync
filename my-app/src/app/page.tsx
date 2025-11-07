'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Shield, Sparkles, Share2, ChevronRight, ArrowRight, Upload, CheckCircle, Lock, Zap, Eye, Globe, TrendingUp } from 'lucide-react';
import { Header, Footer } from '@/components/layout';

export default function EnhancedLandingPage() {
  const router = useRouter();
  const [scrollY, setScrollY] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0);

  // Generate consistent particle positions (deterministic, not random)
  const particles = React.useMemo(() => {
    const positions = [
      { left: 15, top: 20, delay: 0, duration: 8 },
      { left: 85, top: 15, delay: 1, duration: 10 },
      { left: 45, top: 60, delay: 2, duration: 12 },
      { left: 70, top: 40, delay: 0.5, duration: 9 },
      { left: 25, top: 75, delay: 1.5, duration: 11 },
      { left: 60, top: 25, delay: 2.5, duration: 7 },
      { left: 10, top: 50, delay: 3, duration: 13 },
      { left: 90, top: 70, delay: 0.8, duration: 8.5 },
      { left: 35, top: 10, delay: 2.2, duration: 10.5 },
      { left: 55, top: 85, delay: 1.8, duration: 9.5 },
      { left: 20, top: 35, delay: 3.5, duration: 11.5 },
      { left: 75, top: 55, delay: 0.3, duration: 12.5 },
      { left: 40, top: 90, delay: 2.8, duration: 7.5 },
      { left: 65, top: 30, delay: 1.2, duration: 14 },
      { left: 30, top: 65, delay: 4, duration: 8.8 },
      { left: 80, top: 45, delay: 0.6, duration: 10.8 },
      { left: 50, top: 5, delay: 3.2, duration: 9.8 },
      { left: 5, top: 80, delay: 1.6, duration: 13.5 },
      { left: 95, top: 60, delay: 2.6, duration: 7.8 },
      { left: 12, top: 95, delay: 4.2, duration: 11.8 }
    ];
    return positions;
  }, []);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleGetStarted = () => {
    router.push('/signup');
  };

  const workflowSteps = [
    {
      icon: Upload,
      title: "Upload Certificate",
      description: "Students upload their academic certificates in any format (PDF, JPG, PNG)",
      color: "from-blue-500 to-cyan-500",
      bgColor: "from-blue-500/10 to-cyan-500/10",
      step: "01"
    },
    {
      icon: Sparkles,
      title: "AI Verification",
      description: "Advanced OCR & AI extracts and validates certificate data automatically",
      color: "from-purple-500 to-pink-500",
      bgColor: "from-purple-500/10 to-pink-500/10",
      step: "02"
    },
    {
      icon: CheckCircle,
      title: "Faculty Approval",
      description: "Faculty reviews and approves certificates with cryptographic signatures",
      color: "from-emerald-500 to-teal-500",
      bgColor: "from-emerald-500/10 to-teal-500/10",
      step: "03"
    },
    {
      icon: Share2,
      title: "Share Portfolio",
      description: "Create stunning portfolios and share verifiable credentials with recruiters",
      color: "from-orange-500 to-amber-500",
      bgColor: "from-orange-500/10 to-amber-500/10",
      step: "04"
    }
  ];

  return (
    <div className="min-h-screen bg-[#0A0F1E] overflow-x-hidden">
      <Header />

      {/* Hero Section - CoreShift Inspired */}
      <main className="pt-32">
        <section id="hero" className="relative overflow-hidden py-24 lg:py-40">
          {/* Modern Background Effects */}
          <div className="absolute inset-0">
            {/* Animated gradient orbs */}
            <div 
              className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-blue-500/30 rounded-full blur-[120px] transition-transform duration-1000 animate-pulse"
              style={{ transform: `translateY(${scrollY * 0.15}px) rotate(${scrollY * 0.05}deg)` }}
            ></div>
            <div 
              className="absolute bottom-[10%] right-[10%] w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-[120px] transition-transform duration-1000 animate-pulse"
              style={{ transform: `translateY(${scrollY * -0.2}px) rotate(${scrollY * -0.05}deg)`, animationDelay: '1s' }}
            ></div>
            
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
                ></div>
              ))}
            </div>
            
            {/* Grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]">
              <div 
                className="absolute inset-0"
                style={{
                  backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)',
                  backgroundSize: '50px 50px',
                  transform: `translateY(${scrollY * 0.1}px)`
                }}
              ></div>
            </div>
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-12">
              {/* Pill Badge */}
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm px-5 py-2.5 rounded-full border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 group animate-fade-in-down cursor-pointer hover:scale-105">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-300">
                  Cryptographically-Signed Digital Credentials
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </div>

              {/* Main Heading */}
              <div className="space-y-8">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold text-white leading-[1.3] tracking-tight max-w-5xl mx-auto animate-fade-in-up px-4">
                  <span className="inline-block hover:scale-105 transition-transform duration-300">Transform Certificates</span>
                  <br />
                  <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent inline-block hover:scale-105 transition-transform duration-300 animate-gradient pb-2">
                    Into Digital Trust
                  </span>
                </h1>
                <p className="text-xl sm:text-2xl text-gray-400 max-w-3xl mx-auto leading-relaxed font-light animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                  End-to-end platform for universities to issue, verify, and manage 
                  cryptographically-signed digital credentials that employers trust.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                <button 
                  onClick={handleGetStarted}
                  className="group bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 transform hover:-translate-y-2 hover:scale-105 flex items-center gap-3 w-full sm:w-auto relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                  <span className="relative z-10">Get Started Free</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform relative z-10" />
                </button>
                <button 
                  onClick={handleGetStarted}
                  className="group bg-white/5 backdrop-blur-sm text-white px-8 py-4 rounded-xl font-semibold text-lg border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105 hover:-translate-y-1 flex items-center gap-3 w-full sm:w-auto"
                >
                  <Eye className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  View Demo
                </button>
              </div>

              {/* Animated Metrics */}
              <div className="grid grid-cols-3 gap-8 pt-24 max-w-4xl mx-auto">
                <div className="text-center group animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
                  <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2 group-hover:scale-125 transition-all duration-500 cursor-pointer">
                    100%
                  </div>
                  <div className="text-gray-500 text-sm font-medium group-hover:text-gray-300 transition-colors">Secure & Tamper-Proof</div>
                </div>
                <div className="text-center group animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
                  <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2 group-hover:scale-125 transition-all duration-500 cursor-pointer">
                    &lt;2s
                  </div>
                  <div className="text-gray-500 text-sm font-medium group-hover:text-gray-300 transition-colors">Instant Verification</div>
                </div>
                <div className="text-center group animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
                  <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-2 group-hover:scale-125 transition-all duration-500 cursor-pointer">
                    AI
                  </div>
                  <div className="text-gray-500 text-sm font-medium group-hover:text-gray-300 transition-colors">Powered Extraction</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works - Workflow Section */}
        <section id="how-it-works" className="py-24 lg:py-32 relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0F1E] via-[#0F1629] to-[#0A0F1E]"></div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-500/20 mb-6">
                <Zap className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-gray-300">Simple 4-Step Process</span>
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
                How CampusSync Works
              </h2>
              <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                From upload to verification in minutes. Our streamlined workflow 
                makes credential management effortless.
              </p>
            </div>

            {/* Workflow Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                const isActive = activeStep === index;
                
                return (
                  <div 
                    key={index}
                    className={`relative group transition-all duration-500 ${isActive ? 'scale-105' : ''}`}
                  >
                    {/* Connecting Line */}
                    {index < workflowSteps.length - 1 && (
                      <div className="hidden lg:block absolute top-20 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-blue-500/50 to-transparent"></div>
                    )}
                    
                    {/* Card */}
                    <div className={`relative bg-gradient-to-br ${step.bgColor} backdrop-blur-sm rounded-2xl p-8 border transition-all duration-500 ${
                      isActive ? 'border-blue-500/50 shadow-2xl shadow-blue-500/20' : 'border-white/5 hover:border-white/10'
                    }`}>
                      {/* Step Number */}
                      <div className="absolute top-4 right-4 text-6xl font-bold text-white/5">
                        {step.step}
                      </div>
                      
                      {/* Icon */}
                      <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      
                      {/* Content */}
                      <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-blue-400 transition-colors">
                        {step.title}
                      </h3>
                      <p className="text-gray-400 leading-relaxed">
                        {step.description}
                      </p>
                      
                      {/* Active Indicator */}
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-b-2xl"></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CTA Button */}
            <div className="text-center mt-16">
              <button 
                onClick={handleGetStarted}
                className="group bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 transform hover:-translate-y-1 inline-flex items-center gap-3"
              >
                Start Your Journey
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </section>

        {/* Product Showcase */}
        <section id="features" className="py-24 lg:py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-[#0A0F1E]">
            <div className="absolute inset-0 opacity-[0.02]">
              <div 
                className="absolute inset-0"
                style={{
                  backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.5) 1px, transparent 0)',
                  backgroundSize: '40px 40px'
                }}
              ></div>
            </div>
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left Content */}
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 backdrop-blur-sm px-4 py-2 rounded-full border border-purple-500/20">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-gray-300">AI-Powered Intelligence</span>
                </div>

                <h2 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
                  Smart Certificate
                  <br />
                  <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Processing
                  </span>
                </h2>

                <p className="text-xl text-gray-400 leading-relaxed">
                  Our advanced OCR and AI technology automatically extracts data from certificates, 
                  validates authenticity, and creates blockchain-backed verifiable credentials in seconds.
                </p>

                {/* Feature List */}
                <div className="space-y-4">
                  {[
                    { icon: Shield, text: "Cryptographically-signed with Ed25519 keys" },
                    { icon: Sparkles, text: "AI-powered OCR for instant data extraction" },
                    { icon: Lock, text: "End-to-end encryption for sensitive data" },
                    { icon: Globe, text: "W3C Verifiable Credentials standard" }
                  ].map((feature, index) => (
                    <div key={index} className="flex items-center gap-4 group">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/20 group-hover:border-purple-500/40 transition-all">
                        <feature.icon className="w-5 h-5 text-purple-400" />
                      </div>
                      <span className="text-gray-300 group-hover:text-white transition-colors">
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Visual */}
              <div className="relative">
                {/* Certificate Image with Enhanced Effects */}
                <div className="relative group">
                  {/* Glow effect background */}
                  <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-blue-500/30 rounded-3xl blur-2xl opacity-50 group-hover:opacity-75 transition-opacity duration-500"></div>
                  
                  {/* Certificate Container */}
                  <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/20 shadow-2xl transform hover:scale-105 hover:rotate-1 transition-all duration-500 animate-float">
                    <Image
                      src="/certificate-sample.svg"
                      alt="Sample Academic Certificate"
                      width={800}
                      height={600}
                      className="w-full h-auto rounded-xl shadow-2xl"
                      priority
                    />
                    
                    {/* Verified Badge Overlay */}
                    <div className="absolute top-8 right-8 bg-emerald-500/90 backdrop-blur-sm rounded-full p-3 border-2 border-white/50 shadow-xl animate-pulse">
                      <CheckCircle className="w-8 h-8 text-white" />
                    </div>
                    
                    {/* Floating shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 animate-shimmer"></div>
                  </div>
                </div>

                {/* Stats Badge */}
                <div className="absolute -bottom-8 -left-8 bg-gradient-to-br from-emerald-500/90 to-teal-500/90 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl hover:scale-110 hover:rotate-2 transition-all duration-300 cursor-pointer animate-float" style={{ animationDelay: '2s' }}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">98.7%</div>
                      <div className="text-sm text-white/80">Accuracy Rate</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section id="pricing" className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0F1E] via-[#0F1629] to-[#0A0F1E]">
            <div className="absolute inset-0">
              <div className="absolute top-[20%] left-[20%] w-[400px] h-[400px] bg-blue-500/20 rounded-full blur-[100px] animate-pulse"></div>
              <div className="absolute bottom-[20%] right-[20%] w-[500px] h-[500px] bg-cyan-500/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
          </div>
          
          <div className="relative max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 hover:scale-105 transition-transform duration-300">
              Ready to Transform Your
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent animate-gradient">
                Credential Management?
              </span>
            </h2>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto hover:text-gray-300 transition-colors">
              Join leading universities using CampusSync to issue verifiable digital credentials
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={handleGetStarted}
                className="group bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-10 py-5 rounded-xl font-semibold text-lg hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 transform hover:-translate-y-2 hover:scale-110 inline-flex items-center gap-3 justify-center relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                <span className="relative z-10">Start Free Trial</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform relative z-10" />
              </button>
            </div>
          </div>
        </section>

        <Footer />

        {/* Scroll to top button with brand gradient */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`fixed bottom-8 right-8 z-50 bg-gradient-to-r from-blue-500 to-emerald-500 text-white p-3 rounded-full shadow-lg transition-all duration-300 ${
            isVisible 
              ? 'opacity-100 translate-y-0 hover:scale-110 hover:shadow-xl hover:shadow-blue-500/25' 
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