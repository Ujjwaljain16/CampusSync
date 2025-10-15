'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle, Eye, Download, Users, Zap, Brain, Shield, Star, Filter, CheckSquare, Square, BarChart3, TrendingUp, Activity, Target, RefreshCw } from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';

interface PendingCert {
  id: string;
  title: string;
  institution: string;
  date_issued: string;
  description?: string;
  file_url?: string;
  student_id: string; // Fixed: Use student_id instead of user_id
  created_at: string;
  confidence_score?: number;
  auto_approved?: boolean;
  verification_method?: string;
  verification_details?: any;
}

interface Analytics {
  overview: {
    totalCertificates: number;
    autoApproved: number;
    pending: number;
    verified: number;
    rejected: number;
    autoApprovalRate: number;
    averageConfidence: number;
  };
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  verificationMethods: {
    qr_verified: number;
    logo_match: number;
    template_match: number;
    ai_confidence: number;
    manual_review: number;
  };
  dailyActivity: Record<string, { total: number; verified: number; pending: number; rejected: number }>;
  topInstitutions: Array<{ institution: string; count: number }>;
}

export default function FacultyDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingCert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [selectedCerts, setSelectedCerts] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<'all' | 'low_confidence' | 'manual_review'>('low_confidence');
  const [showFilters, setShowFilters] = useState(false);
  const [batchActioning, setBatchActioning] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try documents pending first, fallback to certificates
      let pending: PendingCert[] = [];
      try {
        const dres = await fetch('/api/documents/pending');
        if (dres.ok) {
          const dj = await dres.json();
          pending = (dj.data || []).map((d: any) => ({
            id: d.id,
            title: d.title,
            institution: d.institution || '',
            date_issued: d.issue_date || d.created_at,
            file_url: d.file_url,
            user_id: d.student_id,
            created_at: d.created_at,
          }));
        }
      } catch {}

      if (!pending || pending.length === 0) {
        const res = await fetch('/api/certificates/pending');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        pending = json.data as PendingCert[];
      }

      // Fetch verification details for each
      const certificatesWithDetails = await Promise.all(
        (pending as PendingCert[]).map(async (cert) => {
          try {
            // Prefer document metadata
            let md: any = null;
            const dmd = await fetch(`/api/documents/${encodeURIComponent(cert.id)}/metadata`);
            if (dmd.ok) {
              md = await dmd.json();
              if (md?.data) {
                return {
                  ...cert,
                  confidence_score: md?.data?.ai_confidence_score || 0,
                  verification_details: md?.data?.verification_details || {}
                };
              }
            }

            const cmdRes = await fetch(`/api/certificates/metadata/${encodeURIComponent(cert.id)}`);
            if (cmdRes.ok) {
              const cmd = await cmdRes.json();
              return {
                ...cert,
                confidence_score: cmd?.data?.ai_confidence_score || 0,
                verification_details: cmd?.data?.verification_details || {}
              };
            }
          } catch (e) {
            console.error('Failed to fetch metadata for cert:', cert.id);
          }
          return cert;
        })
      );
      
      setRows(certificatesWithDetails);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch('/api/analytics/faculty');
      const json = await res.json();
      if (res.ok) {
        setAnalytics(json.data);
      }
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
    fetchAnalytics();
  }, [fetchRows, fetchAnalytics]);

  const onApprove = useCallback(async (certificateId: string, cert: PendingCert) => {
    setActioning(certificateId);
    setError(null);
    try {
      // 1) Approve
      {
        const res = await fetch('/api/certificates/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateId, status: 'approved' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Approve failed');
      }

      // 2) Issue VC
      {
        const subject = {
          id: cert.student_id, // Fixed: Use student_id instead of user_id
          certificateId: cert.id,
          title: cert.title,
          institution: cert.institution,
          dateIssued: cert.date_issued,
          description: cert.description,
        };
        const res = await fetch('/api/certificates/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentialSubject: subject }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Issuance failed');
      }

      await fetchRows();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setActioning(null);
    }
  }, [fetchRows]);

  const onReject = useCallback(async (certificateId: string) => {
    setActioning(certificateId);
    setError(null);
    try {
      const res = await fetch('/api/certificates/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId, status: 'rejected' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Reject failed');
      await fetchRows();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setActioning(null);
    }
  }, [fetchRows]);

  const toggleSelect = useCallback((certId: string) => {
    setSelectedCerts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(certId)) {
        newSet.delete(certId);
      } else {
        newSet.add(certId);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    const filteredRows = getFilteredRows();
    setSelectedCerts(new Set(filteredRows.map(r => r.id)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCerts(new Set());
  }, []);

  const batchApprove = useCallback(async () => {
    if (selectedCerts.size === 0) return;
    
    setBatchActioning(true);
    setError(null);
    try {
      const certIds = Array.from(selectedCerts);
      
      const res = await fetch('/api/certificates/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateIds: certIds, action: 'approve' }),
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Batch approval failed');
      
      await fetchRows();
      await fetchAnalytics(); // Refresh analytics
      setSelectedCerts(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setBatchActioning(false);
    }
  }, [selectedCerts, fetchRows, fetchAnalytics]);

  const batchReject = useCallback(async () => {
    if (selectedCerts.size === 0) return;
    
    setBatchActioning(true);
    setError(null);
    try {
      const certIds = Array.from(selectedCerts);
      
      const res = await fetch('/api/certificates/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateIds: certIds, action: 'reject' }),
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Batch rejection failed');
      
      await fetchRows();
      await fetchAnalytics(); // Refresh analytics
      setSelectedCerts(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setBatchActioning(false);
    }
  }, [selectedCerts, fetchRows, fetchAnalytics]);

  const getFilteredRows = useCallback(() => {
    switch (filterStatus) {
      case 'low_confidence':
        return rows.filter(r => (r.confidence_score || 0) < 0.9);
      case 'manual_review':
        return rows.filter(r => !r.auto_approved);
      default:
        return rows;
    }
  }, [rows, filterStatus]);

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-emerald-400';
    if (score >= 0.7) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceBar = (score: number) => {
    const percentage = Math.round(score * 100);
    const color = score >= 0.9 ? 'bg-emerald-500' : score >= 0.7 ? 'bg-yellow-500' : 'bg-red-500';
    return (
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div 
          className={`h-2 rounded-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  };

  const getVerificationMethod = (details: any) => {
    if (details?.qr_verification?.verified) {
      return { icon: <Shield className="w-3 h-3" />, text: 'QR Verified', color: 'text-emerald-400' };
    }
    if (details?.logo_match?.score > 0.8) {
      return { icon: <Brain className="w-3 h-3" />, text: 'Logo Match', color: 'text-blue-400' };
    }
    if (details?.template_match?.score > 0.6) {
      return { icon: <Star className="w-3 h-3" />, text: 'Template Match', color: 'text-purple-400' };
    }
    return { icon: <AlertCircle className="w-3 h-3" />, text: 'Manual Review', color: 'text-gray-400' };
  };

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-3 text-white/80">Loading certificates...</span>
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
    
    const filteredRows = getFilteredRows();
    
    if (filteredRows.length === 0) {
      return (
        <div className="text-center py-12">
          <CheckCircle className="w-16 h-16 text-white/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No certificates to review</h3>
          <p className="text-white/60">
            {filterStatus === 'low_confidence' 
              ? 'All certificates have high confidence scores and are auto-approved!'
              : 'No certificates match the current filter criteria.'
            }
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Batch Actions */}
        {selectedCerts.size > 0 && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckSquare className="w-5 h-5 text-blue-400" />
                <span className="text-blue-300 font-medium">
                  {selectedCerts.size} certificate{selectedCerts.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={batchApprove}
                  disabled={batchActioning}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve All
                </button>
                <button
                  onClick={batchReject}
                  disabled={batchActioning}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Reject All
                </button>
                <button
                  onClick={clearSelection}
                  className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Certificates Grid */}
        <div className="grid gap-4">
          {filteredRows.map(cert => {
            const confScore = cert.confidence_score || 0;
            const verificationMethod = getVerificationMethod(cert.verification_details);
            const isSelected = selectedCerts.has(cert.id);
            
            return (
              <div key={cert.id} className={`bg-white/5 backdrop-blur-xl border rounded-2xl p-6 transition-all duration-200 ${
                isSelected ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 hover:bg-white/10'
              }`}>
                <div className="flex items-start gap-4">
                  {/* Selection Checkbox */}
                  <button
                    onClick={() => toggleSelect(cert.id)}
                    className="mt-1 p-1 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-400" />
                    ) : (
                      <Square className="w-5 h-5 text-white/40" />
                    )}
                  </button>
                  
                  {/* Certificate Info */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-white mb-2">{cert.title}</h3>
                        <p className="text-white/70 mb-1">{cert.institution}</p>
                        <p className="text-white/50 text-sm mb-2">
                          Student: {cert.student_id} • Issued: {new Date(cert.date_issued).toLocaleDateString()}
                        </p>
                        {cert.description && (
                          <p className="text-white/60 text-sm">{cert.description}</p>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {cert.file_url && (
                          <a 
                            href={cert.file_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                            title="View Certificate"
                          >
                            <Eye className="w-4 h-4 text-white" />
                          </a>
                        )}
                      </div>
                    </div>
                    
                    {/* Confidence Score */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white/70 text-sm">Confidence Score</span>
                        <span className={`text-sm font-semibold ${getConfidenceColor(confScore)}`}>
                          {Math.round(confScore * 100)}%
                        </span>
                      </div>
                      {getConfidenceBar(confScore)}
                    </div>
                    
                    {/* Verification Details */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1 ${verificationMethod.color}`}>
                          {verificationMethod.icon}
                          <span className="text-sm">{verificationMethod.text}</span>
                        </div>
                      </div>
                      
                      <div className="text-white/50 text-xs">
                        {cert.auto_approved ? 'Auto-approved' : 'Requires review'}
                      </div>
                    </div>
                    
                    {/* Individual Actions */}
                    <div className="flex items-center gap-2">
                      <button 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        onClick={() => onApprove(cert.id, cert)}
                        disabled={actioning === cert.id}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve + Issue
                      </button>
                      <button 
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        onClick={() => onReject(cert.id)}
                        disabled={actioning === cert.id}
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [loading, error, getFilteredRows, selectedCerts, batchApprove, batchReject, clearSelection, toggleSelect, onApprove, onReject, actioning]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-2xl backdrop-blur-sm border border-white/10">
                <Users className="w-8 h-8 text-orange-300" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-orange-200 to-red-200 bg-clip-text text-transparent">
                  Faculty Dashboard
                </h1>
                <p className="text-white/70 text-lg">Review and approve certificate submissions</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <LogoutButton variant="danger" />
            </div>
          </div>
          
          {/* Filters and Actions */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
              
              {showFilters && (
                <div className="flex items-center gap-2">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                    className="bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low_confidence">Low Confidence (&lt; 90%)</option>
                    <option value="manual_review">Manual Review Required</option>
                    <option value="all">All Certificates</option>
                  </select>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <CheckSquare className="w-4 h-4" />
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Clear Selection
              </button>
              <a
                href="/faculty/history"
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                History
              </a>
            </div>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Low Confidence</p>
                  <p className="text-2xl font-bold text-white">
                    {rows.filter(r => (r.confidence_score || 0) < 0.7).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <Zap className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Auto-Approved</p>
                  <p className="text-2xl font-bold text-white">
                    {rows.filter(r => r.auto_approved).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Star className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Pending Review</p>
                  <p className="text-2xl font-bold text-white">
                    {rows.length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-white">Analytics Dashboard</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchAnalytics}
                  disabled={analyticsLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={() => setShowAnalytics(!showAnalytics)}
                  className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  {showAnalytics ? 'Hide' : 'Show'} Analytics
                </button>
              </div>
            </div>

            {showAnalytics && analytics && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Auto-Approval Rate */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">Auto-Approval Rate</h3>
                  </div>
                  <div className="text-3xl font-bold text-white mb-2">
                    {analytics.overview.autoApprovalRate}%
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${analytics.overview.autoApprovalRate}%` }}
                    />
                  </div>
                  <p className="text-white/60 text-sm mt-2">
                    {analytics.overview.autoApproved} of {analytics.overview.totalCertificates} certificates auto-approved
                  </p>
                </div>

                {/* Average Confidence */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Target className="w-5 h-5 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">Average Confidence</h3>
                  </div>
                  <div className="text-3xl font-bold text-white mb-2">
                    {Math.round(analytics.overview.averageConfidence * 100)}%
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${analytics.overview.averageConfidence * 100}%` }}
                    />
                  </div>
                  <p className="text-white/60 text-sm mt-2">
                    Based on {analytics.overview.totalCertificates} certificates
                  </p>
                </div>

                {/* Confidence Distribution */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Confidence Distribution</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">High (≥90%)</span>
                      <span className="text-emerald-400 font-semibold">{analytics.confidenceDistribution.high}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">Medium (70-89%)</span>
                      <span className="text-yellow-400 font-semibold">{analytics.confidenceDistribution.medium}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">Low (&lt;70%)</span>
                      <span className="text-red-400 font-semibold">{analytics.confidenceDistribution.low}</span>
                    </div>
                  </div>
                </div>

                {/* Top Institutions */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Top Institutions</h3>
                  <div className="space-y-2">
                    {analytics.topInstitutions.map((inst, index) => (
                      <div key={inst.institution} className="flex items-center justify-between">
                        <span className="text-white/70 text-sm truncate">{inst.institution}</span>
                        <span className="text-white font-semibold">{inst.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {content}
      </div>
    </div>
  );
}


