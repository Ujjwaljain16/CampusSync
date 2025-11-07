'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { 
  Building2, ArrowLeft, Save, AlertCircle, CheckCircle,
  Mail, Phone, Globe, Users, Shield, Clock
} from 'lucide-react';

export default function CreateOrganizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    type: 'institute',
    email: '',
    phone: '',
    website: '',
    timezone: 'Asia/Kolkata',
    allowedDomains: '',
    adminEmail: '',
    adminName: '',
    adminPassword: ''
  });

  // Deterministic particles
  const particles = useMemo(() => [
    { top: '10%', left: '5%', duration: '4s', delay: '0s' },
    { top: '20%', right: '10%', duration: '5s', delay: '0.5s' },
    { top: '60%', left: '15%', duration: '3.5s', delay: '1s' },
    { bottom: '15%', right: '20%', duration: '4.5s', delay: '0.3s' },
    { bottom: '30%', left: '25%', duration: '5s', delay: '0.7s' },
  ], []);

  function handleChange(field: string, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear slug suggestions when user manually edits slug
    if (field === 'slug') {
      setSlugSuggestions([]);
      setError('');
    }
    
    // Auto-generate slug from name
    if (field === 'name') {
      const slug = value.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }
  }

  function selectSuggestion(e: React.MouseEvent, suggestion: string) {
    e.preventDefault(); // Prevent form submission
    e.stopPropagation(); // Stop event bubbling
    setFormData(prev => ({ ...prev, slug: suggestion }));
    setSlugSuggestions([]);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Prevent double submission
    if (loading) {
      console.log('[FORM] Already submitting, ignoring duplicate submit');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess(false);
    setSlugSuggestions([]);

    try {
      // Step 1: Create organization
      const response = await fetch('/api/v2/admin/super/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          type: formData.type,
          email: formData.email,
          phone: formData.phone,
          website: formData.website,
          settings: {
            timezone: formData.timezone,
            language: 'en',
            allowed_email_domains: formData.allowedDomains.split(',').map(d => d.trim()).filter(d => d),
            require_email_verification: true
          }
        })
      });

      if (!response.ok) {
        const json = await response.json();
        
        // Handle slug conflict with suggestions
        if (response.status === 409 && json.suggestions) {
          setSlugSuggestions(json.suggestions);
        }
        
        throw new Error(json.error || 'Failed to create organization');
      }
      
      const { organization } = await response.json();

      // Step 2: Create admin user (only if org was just created)
      console.log(`[FORM] Creating admin for organization ${organization.id}`);
      const adminResponse = await fetch('/api/v2/admin/super/organizations/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
          email: formData.adminEmail,
          name: formData.adminName,
          password: formData.adminPassword
        })
      });

      if (!adminResponse.ok) {
        const json = await adminResponse.json();
        throw new Error(json.error || 'Failed to create admin');
      }

      // Success!
      setSuccess(true);
      setTimeout(() => {
        router.push('/admin/super');
      }, 2000);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-blue-400/30 rounded-full blur-sm animate-float"
            style={{
              top: particle.top,
              left: particle.left,
              right: particle.right,
              bottom: particle.bottom,
              animationDuration: particle.duration,
              animationDelay: particle.delay,
            }}
          />
        ))}
        
        {/* Gradient orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Link href="/admin/super" className="flex items-center gap-2 text-white/80 hover:text-white transition-colors group">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back to Dashboard</span>
          </Link>
          
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-8 h-8 transition-transform duration-300 group-hover:scale-110">
              <Image
                src="/logo-clean.svg"
                alt="CampusSync"
                width={32}
                height={32}
                className="w-full h-full object-contain"
                priority
              />
            </div>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <div className="relative p-4 bg-gradient-to-br from-emerald-500/20 to-green-500/20 backdrop-blur-sm rounded-2xl border border-white/10">
                <Building2 className="w-10 h-10 text-emerald-300 drop-shadow-lg" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-400 bg-clip-text text-transparent">
                Create Organization
              </h1>
              <p className="text-white/80 text-base md:text-lg mt-1 font-medium">
                Set up a new organization with admin account
              </p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-5 rounded-2xl border bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/30 backdrop-blur-xl animate-fade-in-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <p className="text-emerald-300 font-semibold">Organization created successfully!</p>
                <p className="text-emerald-300/80 text-sm">Redirecting to dashboard...</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-5 rounded-2xl border bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-300" />
              </div>
              <p className="text-red-300 font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* Slug Suggestions */}
        {slugSuggestions.length > 0 && (
          <div className="mb-6 p-5 rounded-2xl border bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/30 backdrop-blur-xl animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-yellow-300" />
              </div>
              <div className="flex-1">
                <p className="text-yellow-300 font-semibold mb-3">
                  Slug already taken! Try one of these suggestions:
                </p>
                <div className="flex flex-wrap gap-2">
                  {slugSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={(e) => selectSuggestion(e, suggestion)}
                      className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 rounded-lg text-yellow-100 font-medium transition-all hover:scale-105 active:scale-95"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <p className="text-yellow-300/70 text-xs mt-3">
                  Click a suggestion to use it, or manually edit the slug field
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Details */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 md:px-8 py-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-300" />
                </div>
                <h2 className="text-white text-2xl font-bold">Organization Details</h2>
              </div>
            </div>
            
            <div className="px-6 md:px-8 py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Organization Name */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Organization Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="e.g., Scaler Academy"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  />
                </div>

                {/* URL Slug */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    URL Slug <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => handleChange('slug', e.target.value)}
                    placeholder="e.g., scaler"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  />
                  <p className="text-white/50 text-xs mt-1">
                    URL: campussync.com/org/{formData.slug || 'your-slug'}
                  </p>
                </div>

                {/* Organization Type */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Organization Type <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  >
                    <option value="institute" className="bg-gray-800">Educational Institute</option>
                    <option value="university" className="bg-gray-800">University</option>
                    <option value="company" className="bg-gray-800">Company</option>
                    <option value="enterprise" className="bg-gray-800">Enterprise</option>
                  </select>
                </div>

                {/* Contact Email */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Contact Email <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="contact@organization.com"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="+91-80-1234-5678"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                    />
                  </div>
                </div>

                {/* Website */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Website
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => handleChange('website', e.target.value)}
                      placeholder="https://organization.com"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                    />
                  </div>
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Timezone
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <select
                      value={formData.timezone}
                      onChange={(e) => handleChange('timezone', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                    >
                      <option value="Asia/Kolkata" className="bg-gray-800">Asia/Kolkata (IST)</option>
                      <option value="America/New_York" className="bg-gray-800">America/New York (EST)</option>
                      <option value="Europe/London" className="bg-gray-800">Europe/London (GMT)</option>
                      <option value="Asia/Singapore" className="bg-gray-800">Asia/Singapore (SGT)</option>
                    </select>
                  </div>
                </div>

                {/* Allowed Email Domains */}
                <div className="md:col-span-2">
                  <label className="block text-white font-semibold text-sm mb-2">
                    Allowed Email Domains <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.allowedDomains}
                    onChange={(e) => handleChange('allowedDomains', e.target.value)}
                    placeholder="scaler.com, student.scaler.com"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  />
                  <p className="text-white/50 text-xs mt-1">
                    Comma-separated list of domains that can sign up
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Account */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 md:px-8 py-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-300" />
                </div>
                <h2 className="text-white text-2xl font-bold">Organization Admin</h2>
              </div>
            </div>
            
            <div className="px-6 md:px-8 py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Admin Name */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Admin Name <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <input
                      type="text"
                      required
                      value={formData.adminName}
                      onChange={(e) => handleChange('adminName', e.target.value)}
                      placeholder="John Doe"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                    />
                  </div>
                </div>

                {/* Admin Email */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Admin Email <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <input
                      type="email"
                      required
                      value={formData.adminEmail}
                      onChange={(e) => handleChange('adminEmail', e.target.value)}
                      placeholder="admin@organization.com"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                    />
                  </div>
                </div>

                {/* Admin Password */}
                <div className="md:col-span-2">
                  <label className="block text-white font-semibold text-sm mb-2">
                    Temporary Password <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.adminPassword}
                    onChange={(e) => handleChange('adminPassword', e.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  />
                  <p className="text-white/50 text-xs mt-1">
                    Admin will be prompted to change this on first login
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading}
              className="flex-1 px-6 py-4 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold transition-all disabled:opacity-50 border border-white/10 hover:border-white/20 backdrop-blur-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="group relative overflow-hidden flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
            >
              <Save className="w-5 h-5" />
              <span>{loading ? 'Creating Organization...' : 'Create Organization'}</span>
              {!loading && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
