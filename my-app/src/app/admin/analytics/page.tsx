'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Clock, Zap, Shield, Brain, Star, AlertCircle, Download, RefreshCw } from 'lucide-react';

interface AnalyticsData {
  totalCertificates: number;
  verifiedCertificates: number;
  pendingCertificates: number;
  rejectedCertificates: number;
  autoApprovedCertificates: number;
  manualReviewCertificates: number;
  averageConfidenceScore: number;
  verificationMethods: {
    qr_verified: number;
    logo_match: number;
    template_match: number;
    manual_review: number;
  };
  dailyStats: Array<{
    date: string;
    certificates: number;
    verified: number;
    auto_approved: number;
  }>;
  topInstitutions: Array<{
    institution: string;
    count: number;
    verified: number;
  }>;
  systemPerformance: {
    averageProcessingTime: number;
    successRate: number;
    errorRate: number;
  };
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/dashboard?range=${timeRange}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load analytics');
      setData(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const getVerificationMethodIcon = (method: string) => {
    switch (method) {
      case 'qr_verified':
        return <Shield className="w-4 h-4 text-emerald-400" />;
      case 'logo_match':
        return <Brain className="w-4 h-4 text-blue-400" />;
      case 'template_match':
        return <Star className="w-4 h-4 text-purple-400" />;
      case 'manual_review':
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getVerificationMethodColor = (method: string) => {
    switch (method) {
      case 'qr_verified':
        return 'text-emerald-400';
      case 'logo_match':
        return 'text-blue-400';
      case 'template_match':
        return 'text-purple-400';
      case 'manual_review':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-3 text-white/80">Loading analytics...</span>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl p-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-3" />
          <p className="font-medium">{error}</p>
        </div>
      );
    }
    
    if (!data) {
      return (
        <div className="text-center py-12">
          <BarChart3 className="w-16 h-16 text-white/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No analytics data available</h3>
          <p className="text-white/60">Analytics will appear once certificates are processed</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-white/60 text-sm">Total Certificates</p>
                <p className="text-3xl font-bold text-white">{data.totalCertificates}</p>
              </div>
            </div>
            <div className="text-white/50 text-sm">
              {data.verifiedCertificates} verified ({Math.round((data.verifiedCertificates / data.totalCertificates) * 100)}%)
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-white/60 text-sm">Auto-Approved</p>
                <p className="text-3xl font-bold text-white">{data.autoApprovedCertificates}</p>
              </div>
            </div>
            <div className="text-white/50 text-sm">
              {Math.round((data.autoApprovedCertificates / data.totalCertificates) * 100)}% automation rate
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-white/60 text-sm">Pending Review</p>
                <p className="text-3xl font-bold text-white">{data.pendingCertificates}</p>
              </div>
            </div>
            <div className="text-white/50 text-sm">
              {data.manualReviewCertificates} require manual review
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-white/60 text-sm">Avg Confidence</p>
                <p className="text-3xl font-bold text-white">{Math.round(data.averageConfidenceScore * 100)}%</p>
              </div>
            </div>
            <div className="text-white/50 text-sm">
              System accuracy score
            </div>
          </div>
        </div>

        {/* Verification Methods */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Verification Methods</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(data.verificationMethods).map(([method, count]) => (
              <div key={method} className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  {getVerificationMethodIcon(method)}
                  <span className={`font-medium capitalize ${getVerificationMethodColor(method)}`}>
                    {method.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-2xl font-bold text-white">{count}</p>
                <p className="text-white/50 text-sm">
                  {Math.round((count / data.totalCertificates) * 100)}% of total
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* System Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-white mb-4">System Performance</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-white/70">Average Processing Time</span>
                <span className="text-white font-semibold">{data.systemPerformance.averageProcessingTime}ms</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Success Rate</span>
                <span className="text-emerald-400 font-semibold">{Math.round(data.systemPerformance.successRate * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Error Rate</span>
                <span className="text-red-400 font-semibold">{Math.round(data.systemPerformance.errorRate * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Top Institutions</h3>
            <div className="space-y-3">
              {data.topInstitutions.slice(0, 5).map((institution, index) => (
                <div key={institution.institution} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-white/50 text-sm">#{index + 1}</span>
                    <span className="text-white font-medium">{institution.institution}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-semibold">{institution.count}</div>
                    <div className="text-white/50 text-sm">
                      {Math.round((institution.verified / institution.count) * 100)}% verified
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Daily Stats Chart */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Daily Activity</h3>
          <div className="space-y-4">
            {data.dailyStats.slice(-7).map((day) => (
              <div key={day.date} className="flex items-center gap-4">
                <div className="w-20 text-white/70 text-sm">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min((day.certificates / Math.max(...data.dailyStats.map(d => d.certificates))) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-white text-sm font-medium">{day.certificates}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-white/60">
                    <span>{day.verified} verified</span>
                    <span>{day.auto_approved} auto-approved</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }, [loading, error, data]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl backdrop-blur-sm border border-white/10">
                <BarChart3 className="w-8 h-8 text-purple-300" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                  Analytics Dashboard
                </h1>
                <p className="text-white/70 text-lg">System performance and usage insights</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d')}
                className="bg-white/10 border border-white/20 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              
              <button
                onClick={fetchAnalytics}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              
              <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>
        
        {content}
      </div>
    </div>
  );
}
