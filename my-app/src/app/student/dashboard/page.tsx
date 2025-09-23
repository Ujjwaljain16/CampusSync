'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle, Eye, Download, Share2, Star, Zap, Shield, Brain, FileText } from 'lucide-react';
import LogoutButton from '../../../components/LogoutButton';

interface Row {
  id: string;
  title: string;
  institution: string;
  date_issued: string;
  file_url?: string;
  verification_status: 'verified' | 'pending' | 'rejected';
  confidence_score?: number;
  auto_approved?: boolean;
  verification_method?: string;
  created_at: string;
}

export default function StudentDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [details, setDetails] = useState<Record<string, any>>({});
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/certificates/mine');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      const list = json.data as Row[];
      setRows(list);
      // Fetch metadata for confidence per cert
      const confMap: Record<string, number> = {};
      const detMap: Record<string, any> = {};
      for (const r of list) {
        const mdRes = await fetch(`/api/certificates/metadata/${encodeURIComponent(r.id)}`);
        if (mdRes.ok) {
          const md = await mdRes.json();
          const ai = md?.data?.ai_confidence_score;
          confMap[r.id] = typeof ai === 'number' ? ai : (md?.data?.verification_details?.ai_confidence?.score ?? 0);
          detMap[r.id] = md?.data?.verification_details ?? {};
        }
      }
      setConfidence(confMap);
      setDetails(detMap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportPortfolioPDF = useCallback(async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/portfolio/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'current-user' }) // In real app, get from auth
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campusync-portfolio-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('PDF export error:', error);
      setError('Failed to export portfolio PDF');
    } finally {
      setExporting(false);
    }
  }, []);

  const getStatusIcon = (status: string, autoApproved?: boolean) => {
    switch (status) {
      case 'verified':
        return autoApproved ? <Zap className="w-4 h-4 text-emerald-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string, autoApproved?: boolean) => {
    switch (status) {
      case 'verified':
        return autoApproved ? 'Auto-Approved' : 'Approved';
      case 'pending':
        return 'Pending Review';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status: string, autoApproved?: boolean) => {
    switch (status) {
      case 'verified':
        return autoApproved ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'rejected':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

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
    
    if (rows.length === 0) {
      return (
        <div className="text-center py-12">
          <Star className="w-16 h-16 text-white/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No certificates yet</h3>
          <p className="text-white/60 mb-6">Upload your first certificate to get started!</p>
          <a 
            href="/student/upload" 
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Upload Certificate
          </a>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-emerald-500/20 rounded-lg">
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white/60 text-xs md:text-sm">Verified</p>
                <p className="text-lg md:text-2xl font-bold text-white">
                  {rows.filter(r => r.verification_status === 'verified').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-yellow-500/20 rounded-lg">
                <Clock className="w-4 h-4 md:w-5 md:h-5 text-yellow-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white/60 text-xs md:text-sm">Pending</p>
                <p className="text-lg md:text-2xl font-bold text-white">
                  {rows.filter(r => r.verification_status === 'pending').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-blue-500/20 rounded-lg">
                <Zap className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white/60 text-xs md:text-sm">Auto-Approved</p>
                <p className="text-lg md:text-2xl font-bold text-white">
                  {rows.filter(r => r.auto_approved).length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-purple-500/20 rounded-lg">
                <Star className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white/60 text-xs md:text-sm">Total</p>
                <p className="text-lg md:text-2xl font-bold text-white">{rows.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Certificates Grid */}
        <div className="grid gap-4">
          {rows.map(cert => {
            const confScore = confidence[cert.id] || 0;
            const verificationMethod = getVerificationMethod(details[cert.id]);
            
            return (
              <div key={cert.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-6 hover:bg-white/10 transition-all duration-200">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg md:text-xl font-semibold text-white mb-2 truncate">{cert.title}</h3>
                    <p className="text-white/70 mb-1 truncate">{cert.institution}</p>
                    <p className="text-white/50 text-sm">
                      Issued: {new Date(cert.date_issued).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {/* Status Badge */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${getStatusColor(cert.verification_status, cert.auto_approved)}`}>
                      {getStatusIcon(cert.verification_status, cert.auto_approved)}
                      <span className="text-xs md:text-sm font-medium">
                        {getStatusText(cert.verification_status, cert.auto_approved)}
                      </span>
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
                      <button 
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                        title="Share Portfolio"
                      >
                        <Share2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1 ${verificationMethod.color}`}>
                      {verificationMethod.icon}
                      <span className="text-sm">{verificationMethod.text}</span>
                    </div>
                  </div>
                  
                  <div className="text-white/50 text-xs">
                    {cert.auto_approved ? 'Automatically verified' : 'Manual review required'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [rows, loading, error, confidence, details]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-10">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl backdrop-blur-sm border border-white/10">
                <Star className="w-6 h-6 md:w-8 md:h-8 text-blue-300" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
                  My Certificates
                </h1>
                <p className="text-white/70 text-sm md:text-lg">Track your verified achievements and credentials</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <LogoutButton variant="minimal" />
              <button
                onClick={exportPortfolioPDF}
                disabled={exporting || rows.length === 0}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-medium transition-colors flex items-center gap-2 text-sm md:text-base"
              >
                <FileText className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">{exporting ? 'Generating...' : 'Export PDF'}</span>
                <span className="sm:hidden">{exporting ? '...' : 'PDF'}</span>
              </button>
            </div>
          </div>
        </div>
        
        {content}
      </div>
    </div>
  );
}


