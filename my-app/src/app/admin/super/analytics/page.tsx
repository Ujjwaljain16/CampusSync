'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  BarChart3, ArrowLeft, TrendingUp, Users, 
  Building2, FileCheck, Activity
} from 'lucide-react';
import LogoutButton from '@/components/LogoutButton';

export default function SuperAdminAnalyticsPage() {
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
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/admin/super"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-medium">Back to Super Admin Dashboard</span>
          </Link>
        </div>

        {/* Header */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 mb-6 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-2xl flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-blue-300" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Platform Analytics</h1>
              <p className="text-white/60">Comprehensive insights across all organizations</p>
            </div>
          </div>
        </div>

        {/* Coming Soon Message */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-12 shadow-2xl">
          <div className="text-center max-w-2xl mx-auto">
            <div className="w-24 h-24 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <BarChart3 className="w-12 h-12 text-blue-300" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-4">Analytics Dashboard Coming Soon</h2>
            <p className="text-white/60 text-lg mb-8 leading-relaxed">
              We&apos;re building a comprehensive analytics dashboard that will provide deep insights 
              into platform usage, user engagement, certificate issuance trends, and much more.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/10">
                <TrendingUp className="w-8 h-8 text-emerald-300 mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-2">Growth Metrics</h3>
                <p className="text-white/60 text-sm">Track user growth and engagement trends</p>
              </div>
              
              <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/10">
                <Users className="w-8 h-8 text-blue-300 mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-2">User Analytics</h3>
                <p className="text-white/60 text-sm">Detailed breakdowns by role and organization</p>
              </div>
              
              <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/10">
                <FileCheck className="w-8 h-8 text-purple-300 mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-2">Certificate Insights</h3>
                <p className="text-white/60 text-sm">Issuance rates and verification stats</p>
              </div>
            </div>

            <Link
              href="/admin/super"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl font-semibold transition-all shadow-lg"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Quick Stats Preview */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Organizations"
            icon={<Building2 className="w-6 h-6" />}
            description="Coming soon"
            gradient="from-blue-500/20 to-cyan-500/20"
            iconColor="text-blue-300"
          />
          <StatCard
            title="Platform Users"
            icon={<Users className="w-6 h-6" />}
            description="Coming soon"
            gradient="from-emerald-500/20 to-green-500/20"
            iconColor="text-emerald-300"
          />
          <StatCard
            title="Certificates Issued"
            icon={<FileCheck className="w-6 h-6" />}
            description="Coming soon"
            gradient="from-purple-500/20 to-pink-500/20"
            iconColor="text-purple-300"
          />
          <StatCard
            title="Active Verifications"
            icon={<Activity className="w-6 h-6" />}
            description="Coming soon"
            gradient="from-orange-500/20 to-red-500/20"
            iconColor="text-orange-300"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  icon, 
  description,
  gradient, 
  iconColor 
}: { 
  title: string; 
  icon: React.ReactNode; 
  description: string;
  gradient: string; 
  iconColor: string;
}) {
  return (
    <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 bg-gradient-to-br ${gradient} rounded-xl`}>
          <div className={iconColor}>{icon}</div>
        </div>
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      <p className="text-white/60 text-xs">{description}</p>
    </div>
  );
}
