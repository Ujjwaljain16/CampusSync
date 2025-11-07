'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { 
  UserPlus, ArrowLeft, Save, AlertCircle, CheckCircle,
  Mail, Shield, RefreshCw
} from 'lucide-react';
import LogoutButton from '@/components/LogoutButton';

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function AddAdminPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'org_admin',
    make_primary: false
  });

  // Load organization data
  useEffect(() => {
    const loadOrganization = async () => {
      try {
        const res = await fetch(`/api/v2/admin/super/organizations/${orgId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load organization');
        setOrganization(json.data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load organization');
      } finally {
        setLoading(false);
      }
    };
    loadOrganization();
  }, [orgId]);

  function handleChange(field: string, value: string | boolean) {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (submitting) return;
    
    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch(`/api/v2/admin/super/organizations/${orgId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          full_name: formData.full_name,
          password: formData.password,
          role: formData.role,
          is_primary_admin: formData.make_primary
        })
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to add admin');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/admin/super/organizations/${orgId}/admins`);
      }, 1500);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-blue-300 mx-auto" />
          <p className="mt-4 text-white/80">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Link 
            href={`/admin/super/organizations/${orgId}/admins`} 
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back to Admins</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/logo-clean.svg"
                alt="CampusSync"
                width={32}
                height={32}
                className="w-8 h-8"
                priority
              />
              <span className="text-lg font-bold text-white">CampusSync</span>
            </Link>
            <LogoutButton variant="danger" />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-3 text-sm">
          <Link href="/admin/super" className="text-white/80 hover:text-white transition-colors">
            Super Admin
          </Link>
          <span className="text-white/40">/</span>
          <Link href={`/admin/super/organizations/${orgId}`} className="text-white/80 hover:text-white transition-colors">
            {organization?.name}
          </Link>
          <span className="text-white/40">/</span>
          <Link href={`/admin/super/organizations/${orgId}/admins`} className="text-white/80 hover:text-white transition-colors">
            Admins
          </Link>
          <span className="text-white/40">/</span>
          <span className="text-white">Add Admin</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <div className="relative p-4 bg-gradient-to-br from-emerald-500/20 to-green-500/20 backdrop-blur-sm rounded-2xl border border-white/10">
                <UserPlus className="w-10 h-10 text-emerald-300 drop-shadow-lg" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-400 bg-clip-text text-transparent">
                Add Administrator
              </h1>
              <p className="text-white/80 text-base md:text-lg mt-1 font-medium">
                Create new admin for <span className="text-white font-semibold">{organization?.name}</span>
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
                <p className="text-emerald-300 font-semibold">Admin added successfully!</p>
                <p className="text-emerald-300/80 text-sm">Redirecting...</p>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Admin Details */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 md:px-8 py-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-300" />
                </div>
                <h2 className="text-white text-2xl font-bold">Administrator Details</h2>
              </div>
            </div>
            
            <div className="px-6 md:px-8 py-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Full Name */}
                <div className="md:col-span-2">
                  <label className="block text-white font-semibold text-sm mb-2">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => handleChange('full_name', e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  />
                </div>

                {/* Email */}
                <div className="md:col-span-2">
                  <label className="block text-white font-semibold text-sm mb-2">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/60" />
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="admin@organization.com"
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="md:col-span-2">
                  <label className="block text-white font-semibold text-sm mb-2">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  />
                  <p className="text-white/50 text-xs mt-1">
                    Admin will be prompted to change this on first login
                  </p>
                </div>

                {/* Role */}
                <div>
                  <label className="block text-white font-semibold text-sm mb-2">
                    Role <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all backdrop-blur-sm hover:bg-white/15"
                  >
                    <option value="org_admin" className="bg-gray-800">Organization Admin</option>
                    <option value="admin" className="bg-gray-800">Admin</option>
                  </select>
                  <p className="text-white/50 text-xs mt-1">
                    Organization Admin has full control over this organization
                  </p>
                </div>

                {/* Primary Admin Checkbox */}
                <div className="flex items-start pt-8">
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.make_primary}
                      onChange={(e) => handleChange('make_primary', e.target.checked)}
                      className="w-5 h-5 bg-white/10 border border-white/20 rounded text-emerald-500 focus:ring-2 focus:ring-emerald-400/50 focus:outline-none cursor-pointer"
                    />
                    <span className="ml-3 text-white font-medium group-hover:text-emerald-300 transition-colors">
                      Make Primary Admin
                    </span>
                  </label>
                </div>
              </div>

              {/* Info Box */}
              {formData.make_primary && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-yellow-300 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-yellow-300 font-semibold text-sm mb-1">
                        Primary Admin Status
                      </p>
                      <p className="text-yellow-200/80 text-xs">
                        Making this user the primary admin will transfer all primary admin 
                        privileges to them. The current primary admin will become a regular 
                        organization admin. This action cannot be undone easily.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={submitting}
              className="flex-1 px-6 py-4 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold transition-all disabled:opacity-50 border border-white/10 hover:border-white/20 backdrop-blur-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="group relative overflow-hidden flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
            >
              <Save className="w-5 h-5" />
              <span>{submitting ? 'Adding Admin...' : 'Add Administrator'}</span>
              {!submitting && (
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
