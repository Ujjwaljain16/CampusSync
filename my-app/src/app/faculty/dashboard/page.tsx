'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle, Eye, Download, Users, Zap, Brain, Shield, Star, Filter, CheckSquare, Square, BarChart3, TrendingUp, Activity, Target, RefreshCw } from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';
import { PageHeader } from '@/components/layout';

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
  verification_details?: Record<string, unknown>;
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
  ocrMetrics?: {
    totalExtractions: number;
    highQuality: number;
    mediumQuality: number;
    lowQuality: number;
    averageScore: number;
    successRate: number;
  };
  confidencePercentiles?: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  confidenceTrend?: Record<string, { scores: number[]; avgScore: number; count: number }>;
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
          pending = (dj.data || []).map((d: Record<string, unknown>) => ({
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
            let md: Record<string, unknown> | null = null;
            const dmd = await fetch(`/api/documents/${encodeURIComponent(cert.id)}/metadata`);
            if (dmd.ok) {
              md = await dmd.json();
              if (md?.data) {
                const data = md.data as Record<string, unknown>;
                return {
                  ...cert,
                  confidence_score: (data?.ai_confidence_score as number) || 0,
                  verification_details: (data?.verification_details as Record<string, unknown>) || {}
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

  const getVerificationMethod = (details: Record<string, unknown>) => {
    const qrVerification = details?.qr_verification as Record<string, unknown> | undefined;
    const logoMatch = details?.logo_match as Record<string, unknown> | undefined;
    const templateMatch = details?.template_match as Record<string, unknown> | undefined;
    
    if (qrVerification?.verified) {
      return { icon: <Shield className="w-3 h-3" />, text: 'QR Verified', color: 'text-emerald-400' };
    }
    if (typeof logoMatch?.score === 'number' && logoMatch.score > 0.8) {
      return { icon: <Brain className="w-3 h-3" />, text: 'Logo Match', color: 'text-blue-400' };
    }
    if (typeof templateMatch?.score === 'number' && templateMatch.score > 0.6) {
      return { icon: <Star className="w-3 h-3" />, text: 'Template Match', color: 'text-purple-400' };
    }
    return { icon: <AlertCircle className="w-3 h-3" />, text: 'Manual Review', color: 'text-gray-400' };
  };

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full blur-xl opacity-50 animate-pulse"></div>
            <div className="relative animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-blue-400"></div>
          </div>
          <span className="mt-4 text-white/80 font-medium">Loading certificates...</span>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 backdrop-blur-xl border border-red-500/30 text-red-300 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <p className="font-semibold text-lg">{error}</p>
        </div>
      );
    }
    
    const filteredRows = getFilteredRows();
    
    if (filteredRows.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-500 rounded-2xl blur-xl opacity-40"></div>
            <div className="relative w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-green-500/20 backdrop-blur-sm rounded-2xl border border-emerald-400/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-emerald-300" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">No certificates to review</h3>
          <p className="text-white/70 max-w-md mx-auto">
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
        {/* Batch Actions - Enhanced */}
        {selectedCerts.size > 0 && (
          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-xl border border-blue-400/30 rounded-2xl p-5 shadow-lg shadow-blue-500/20 animate-in slide-in-from-top duration-300">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <CheckSquare className="w-5 h-5 text-blue-300" />
                </div>
                <span className="text-blue-200 font-semibold text-lg">
                  {selectedCerts.size} certificate{selectedCerts.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={batchApprove}
                  disabled={batchActioning}
                  className="group relative overflow-hidden bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-emerald-500/50 hover:scale-105"
                >
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <CheckCircle className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">Approve All</span>
                </button>
                <button
                  onClick={batchReject}
                  disabled={batchActioning}
                  className="group relative overflow-hidden bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-red-500/50 hover:scale-105"
                >
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <XCircle className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">Reject All</span>
                </button>
                <button
                  onClick={clearSelection}
                  className="bg-gradient-to-br from-white/10 to-white/5 hover:from-white/15 hover:to-white/10 border border-white/10 hover:border-white/20 text-white px-4 py-2.5 rounded-xl font-medium transition-all backdrop-blur-xl"
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
            const verificationMethod = getVerificationMethod(cert.verification_details || {});
            const isSelected = selectedCerts.has(cert.id);
            
            return (
              <div key={cert.id} className={`bg-gradient-to-br backdrop-blur-2xl border rounded-2xl p-6 transition-all duration-300 hover:scale-[1.01] ${
                isSelected 
                  ? 'from-blue-500/15 to-cyan-500/15 border-blue-400/50 shadow-lg shadow-blue-500/20' 
                  : 'from-white/10 to-white/5 border-white/10 hover:border-white/20'
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
                    
                    {/* Individual Actions - Enhanced */}
                    <div className="flex items-center gap-2">
                      <button 
                        className="group relative overflow-hidden flex-1 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-emerald-500/50 hover:scale-105"
                        onClick={() => onApprove(cert.id, cert)}
                        disabled={actioning === cert.id}
                      >
                        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <CheckCircle className="w-4 h-4 relative z-10" />
                        <span className="relative z-10">Approve + Issue</span>
                      </button>
                      <button 
                        className="group relative overflow-hidden flex-1 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-red-500/50 hover:scale-105"
                        onClick={() => onReject(cert.id)}
                        disabled={actioning === cert.id}
                      >
                        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <XCircle className="w-4 h-4 relative z-10" />
                        <span className="relative z-10">Reject</span>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating particles */}
        <div className="absolute top-[10%] left-[5%] w-2 h-2 bg-blue-400/30 rounded-full blur-sm animate-float" style={{ animationDuration: '4s' }}></div>
        <div className="absolute top-[20%] right-[10%] w-2 h-2 bg-emerald-400/30 rounded-full blur-sm animate-float" style={{ animationDuration: '5s', animationDelay: '0.5s' }}></div>
        <div className="absolute top-[60%] left-[15%] w-2 h-2 bg-cyan-400/30 rounded-full blur-sm animate-float" style={{ animationDuration: '3.5s', animationDelay: '1s' }}></div>
        <div className="absolute bottom-[15%] right-[20%] w-2 h-2 bg-blue-400/30 rounded-full blur-sm animate-float" style={{ animationDuration: '4.5s', animationDelay: '0.3s' }}></div>
        <div className="absolute bottom-[30%] left-[25%] w-2 h-2 bg-emerald-400/30 rounded-full blur-sm animate-float" style={{ animationDuration: '5s', animationDelay: '0.7s' }}></div>
        
        {/* Gradient orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>
        
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:radial-gradient(white,transparent_85%)] opacity-10"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with enhanced design */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                <div className="relative p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-10 h-10 text-blue-300 drop-shadow-lg" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
                  Faculty Dashboard
                </h1>
                <p className="text-white/80 text-base md:text-lg mt-1 font-medium">
                  Review and approve certificate submissions
                  <span className="text-emerald-300"> with AI assistance</span>
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <LogoutButton variant="danger" />
            </div>
          </div>
          
          {/* Filters and Actions - Enhanced */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="group relative overflow-hidden flex items-center gap-2 bg-gradient-to-br from-white/10 to-white/5 hover:from-white/15 hover:to-white/10 border border-white/10 hover:border-white/20 text-white px-4 py-2.5 rounded-xl font-medium transition-all backdrop-blur-xl"
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
              
              {showFilters && (
                <div className="flex items-center gap-2 animate-in slide-in-from-left duration-300">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as 'all' | 'low_confidence' | 'manual_review')}
                    className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 text-white px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/30 font-medium transition-all"
                  >
                    <option value="low_confidence" className="bg-slate-900">Low Confidence (&lt; 90%)</option>
                    <option value="manual_review" className="bg-slate-900">Manual Review Required</option>
                    <option value="all" className="bg-slate-900">All Certificates</option>
                  </select>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg hover:shadow-blue-500/50 hover:scale-105"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <CheckSquare className="w-4 h-4 relative z-10" />
                <span className="relative z-10">Select All</span>
              </button>
              <button
                onClick={clearSelection}
                className="bg-gradient-to-br from-white/10 to-white/5 hover:from-white/15 hover:to-white/10 border border-white/10 hover:border-white/20 text-white px-4 py-2.5 rounded-xl font-medium transition-all backdrop-blur-xl"
              >
                Clear
              </button>
              <a
                href="/faculty/history"
                className="bg-gradient-to-br from-white/10 to-white/5 hover:from-white/15 hover:to-white/10 border border-white/10 hover:border-white/20 text-white px-4 py-2.5 rounded-xl font-medium transition-all backdrop-blur-xl inline-flex items-center gap-2"
              >
                <Clock className="w-4 h-4" />
                History
              </a>
            </div>
          </div>
          
          {/* Summary Stats - Enhanced */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 hover:border-red-400/30 transition-all group">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-orange-500 rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
                  <div className="relative p-3 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-xl">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                </div>
                <div>
                  <p className="text-white/60 text-sm font-medium">Low Confidence</p>
                  <p className="text-3xl font-bold text-white">
                    {rows.filter(r => (r.confidence_score || 0) < 0.7).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 hover:border-emerald-400/30 transition-all group">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
                  <div className="relative p-3 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-xl">
                    <Zap className="w-6 h-6 text-emerald-400" />
                  </div>
                </div>
                <div>
                  <p className="text-white/60 text-sm font-medium">Auto-Approved</p>
                  <p className="text-3xl font-bold text-white">
                    {rows.filter(r => r.auto_approved).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 hover:border-cyan-400/30 transition-all group">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
                  <div className="relative p-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-xl">
                    <Clock className="w-6 h-6 text-cyan-400" />
                  </div>
                </div>
                <div>
                  <p className="text-white/60 text-sm font-medium">Pending Review</p>
                  <p className="text-3xl font-bold text-white">
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
                  className="bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-blue-500/25"
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

                {/* OCR Extraction Quality Metrics */}
                {analytics.ocrMetrics && (
                  <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-6 lg:col-span-2">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Brain className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">OCR Extraction Quality</h3>
                        <p className="text-white/60 text-sm">AI-powered document analysis metrics</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-white/60 text-xs mb-1">Total Extractions</p>
                        <p className="text-2xl font-bold text-white">{analytics.ocrMetrics.totalExtractions}</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-white/60 text-xs mb-1">Success Rate</p>
                        <p className="text-2xl font-bold text-emerald-400">{analytics.ocrMetrics.successRate}%</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-white/60 text-xs mb-1">Avg Score</p>
                        <p className="text-2xl font-bold text-blue-400">{Math.round(analytics.ocrMetrics.averageScore * 100)}%</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4">
                        <p className="text-white/60 text-xs mb-1">High Quality</p>
                        <p className="text-2xl font-bold text-purple-400">{analytics.ocrMetrics.highQuality}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white/70 text-sm">High Quality (≥90%)</span>
                          <span className="text-emerald-400 font-semibold">{analytics.ocrMetrics.highQuality} extractions</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-emerald-500 to-green-500 h-2 rounded-full"
                            style={{ width: `${(analytics.ocrMetrics.highQuality / analytics.ocrMetrics.totalExtractions) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white/70 text-sm">Medium Quality (70-89%)</span>
                          <span className="text-yellow-400 font-semibold">{analytics.ocrMetrics.mediumQuality} extractions</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-yellow-500 to-orange-500 h-2 rounded-full"
                            style={{ width: `${(analytics.ocrMetrics.mediumQuality / analytics.ocrMetrics.totalExtractions) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white/70 text-sm">Low Quality (&lt;70%)</span>
                          <span className="text-red-400 font-semibold">{analytics.ocrMetrics.lowQuality} extractions</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-red-500 to-pink-500 h-2 rounded-full"
                            style={{ width: `${(analytics.ocrMetrics.lowQuality / analytics.ocrMetrics.totalExtractions) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confidence Percentiles */}
                {analytics.confidencePercentiles && (
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-cyan-500/20 rounded-lg">
                        <Activity className="w-5 h-5 text-cyan-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white">Score Percentiles</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-sm">25th Percentile</span>
                        <span className="text-white font-semibold">{Math.round(analytics.confidencePercentiles.p25 * 100)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-sm">50th Percentile (Median)</span>
                        <span className="text-cyan-400 font-semibold">{Math.round(analytics.confidencePercentiles.p50 * 100)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-sm">75th Percentile</span>
                        <span className="text-white font-semibold">{Math.round(analytics.confidencePercentiles.p75 * 100)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 text-sm">90th Percentile</span>
                        <span className="text-emerald-400 font-semibold">{Math.round(analytics.confidencePercentiles.p90 * 100)}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {content}
      </div>
    </div>
  );
}


