'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Settings, ArrowLeft, AlertCircle, RefreshCw, Save,
  Building2, Mail, Shield, CheckCircle, Trash2
} from 'lucide-react';
import LogoutButton from '@/components/LogoutButton';

interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  email: string;
  phone?: string;
  website?: string;
  address?: string;
  is_active: boolean;
  is_verified: boolean;
}

export default function OrganizationSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    type: 'institute',
    email: '',
    phone: '',
    website: '',
    address: '',
    is_active: true,
    is_verified: false,
  });

  const loadOrganization = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/admin/super/organizations/${orgId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load organization');
      
      const org = json.data;
      setOrganization(org);
      setFormData({
        name: org.name || '',
        slug: org.slug || '',
        type: org.type || 'institute',
        email: org.email || '',
        phone: org.phone || '',
        website: org.website || '',
        address: org.address || '',
        is_active: org.is_active ?? true,
        is_verified: org.is_verified ?? false,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadOrganization();
  }, [loadOrganization]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/v2/admin/super/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update organization');
      
      setSuccess('Organization updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
      loadOrganization();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update organization');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this organization? This action cannot be undone!')) return;
    if (!confirm('ALL DATA including users, certificates, and documents will be permanently deleted. Continue?')) return;

    try {
      const res = await fetch(`/api/v2/admin/super/organizations/${orgId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete organization');
      
      alert('Organization deleted successfully');
      router.push('/admin/super');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete organization');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-blue-300 mx-auto" />
          <p className="mt-4 text-white/80">Loading settings...</p>
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
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-clean.svg"
              alt="CampusSync"
              width={40}
              height={40}
              className="w-10 h-10"
              priority
            />
            <span className="text-lg font-bold text-white">CampusSync</span>
          </Link>
          <LogoutButton variant="danger" />
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
          <span className="text-white">Settings</span>
        </div>

        {/* Header */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 mb-6 shadow-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl flex items-center justify-center">
              <Settings className="w-8 h-8 text-purple-300" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Organization Settings</h1>
              <p className="text-white/60">Configure settings for {organization?.name}</p>
            </div>
          </div>
          <Link
            href={`/admin/super/organizations/${orgId}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold transition-all border border-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Organization
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-5 rounded-2xl border bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-300" />
              <p className="text-red-300 font-semibold">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-5 rounded-2xl border bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-300" />
              <p className="text-emerald-300 font-semibold">{success}</p>
            </div>
          </div>
        )}

        {/* Settings Form */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6">
          {/* Basic Info */}
          <div>
            <h2 className="text-white font-bold text-xl mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-300" />
              Basic Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Organization Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  placeholder="Enter organization name"
                />
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Slug (URL identifier)</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 font-mono"
                  placeholder="organization-slug"
                />
                <p className="mt-1 text-white/50 text-xs">Used in URLs: campus-sync.com/{formData.slug}</p>
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Organization Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                >
                  <option value="institute" className="bg-gray-800">Institute</option>
                  <option value="university" className="bg-gray-800">University</option>
                  <option value="company" className="bg-gray-800">Company</option>
                  <option value="enterprise" className="bg-gray-800">Enterprise</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="pt-6 border-t border-white/10">
            <h2 className="text-white font-bold text-xl mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-emerald-300" />
              Contact Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  placeholder="contact@organization.com"
                />
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Phone (Optional)</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Website (Optional)</label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  placeholder="https://organization.com"
                />
              </div>

              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">Address (Optional)</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 resize-none"
                  placeholder="Organization address"
                />
              </div>
            </div>
          </div>

          {/* Status Settings */}
          <div className="pt-6 border-t border-white/10">
            <h2 className="text-white font-bold text-xl mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-yellow-300" />
              Status & Verification
            </h2>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-5 h-5 rounded bg-white/10 border-white/20 text-blue-600 focus:ring-2 focus:ring-blue-400/50"
                />
                <div>
                  <span className="text-white font-medium">Active Organization</span>
                  <p className="text-white/60 text-sm">Enable access for users in this organization</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_verified}
                  onChange={(e) => setFormData({ ...formData, is_verified: e.target.checked })}
                  className="w-5 h-5 rounded bg-white/10 border-white/20 text-blue-600 focus:ring-2 focus:ring-blue-400/50"
                />
                <div>
                  <span className="text-white font-medium">Verified Organization</span>
                  <p className="text-white/60 text-sm">Mark this organization as verified</p>
                </div>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-semibold transition-all shadow-lg disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            
            <button
              onClick={handleDelete}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-semibold transition-all shadow-lg"
            >
              <Trash2 className="w-5 h-5" />
              Delete Organization
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
