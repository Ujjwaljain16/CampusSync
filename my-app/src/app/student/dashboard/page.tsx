'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle, Eye, Download, Share2, Star, Zap, Shield, Brain, FileText, Upload, ExternalLink, Trash2, User2, Edit3, Building, Calendar, GraduationCap, MapPin, Award, FileCheck, ScrollText } from 'lucide-react';
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

interface Profile {
  id: string;
  full_name: string;
  university?: string;
  graduation_year?: number;
  major?: string;
  location?: string;
  gpa?: number;
  role: string;
  created_at: string;
}

export default function StudentDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [details, setDetails] = useState<Record<string, any>>({});
  const [vcStatus, setVcStatus] = useState<Record<string, { status: 'active'|'revoked'|'suspended'|'expired', reason?: string }>>({});
  const [exporting, setExporting] = useState(false);
  const [recentUploads, setRecentUploads] = useState<Row[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; certId: string | null; certTitle: string }>({ show: false, certId: null, certTitle: '' });

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch('/api/profile/complete');
      const json = await res.json();
      if (res.ok) {
        setProfile(json.data);
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const fetchVcStatus = useCallback(async (credentialId: string) => {
    try {
      const res = await fetch(`/api/vc/status?credentialId=${encodeURIComponent(credentialId)}`);
      const json = await res.json();
      if (res.ok) {
        setVcStatus(prev => ({ ...prev, [credentialId]: json.data }));
      }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try new documents endpoint first
      let list: Row[] = [];
      try {
        const docsRes = await fetch('/api/documents');
        if (docsRes.ok) {
          const docsJson = await docsRes.json();
          const docs = (docsJson.data || []) as Array<Record<string, unknown>>;
          list = docs.map(d => ({
            id: d.id,
            title: d.title,
            institution: d.institution || '',
            date_issued: d.issue_date || '',
            file_url: d.file_url,
            verification_status: d.verification_status,
            created_at: d.created_at,
            // Optional fields; will be filled from metadata if available
          })) as Row[];
        }
      } catch {}

      if (!list || list.length === 0) {
        // Fallback to legacy certificates API
        const res = await fetch('/api/certificates/mine');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        list = json.data as Row[];
      }
      setRows(list);
      
      // Sort by created_at to get recent uploads (last 5)
      const sortedList = list.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // Most recent first
      });
      setRecentUploads(sortedList.slice(0, 5));
      
      // Fetch metadata for confidence per cert
      const confMap: Record<string, number> = {};
      const detMap: Record<string, any> = {};
      for (const r of list) {
        // Prefer document metadata; fallback to certificate metadata
        let got = false;
        try {
          const dmd = await fetch(`/api/documents/${encodeURIComponent(r.id)}/metadata`);
          if (dmd.ok) {
            const md = await dmd.json();
            if (md?.data) {
              const ai = md.data.ai_confidence_score;
              confMap[r.id] = typeof ai === 'number' ? ai : (md.data.verification_details?.ai_confidence?.score ?? 0);
              detMap[r.id] = md.data.verification_details ?? {};
              got = true;
            }
          }
        } catch {}
        if (!got) {
          try {
            const mdRes = await fetch(`/api/certificates/metadata/${encodeURIComponent(r.id)}`);
            if (mdRes.ok) {
              const md = await mdRes.json();
              if (md?.data) {
                const ai = md.data.ai_confidence_score;
                confMap[r.id] = typeof ai === 'number' ? ai : (md.data.verification_details?.ai_confidence?.score ?? 0);
                detMap[r.id] = md.data.verification_details ?? {};
                got = true;
              }
            }
          } catch {}
        }
        if (!got) {
          confMap[r.id] = 0;
          detMap[r.id] = {};
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

  useEffect(() => { 
    load(); 
    loadProfile();
  }, [load, loadProfile]);

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

  const showDeleteConfirmation = useCallback((certificateId: string, certificateTitle: string) => {
    setDeleteConfirm({ show: true, certId: certificateId, certTitle: certificateTitle });
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm({ show: false, certId: null, certTitle: '' });
  }, []);

  const confirmDelete = useCallback(async () => {
    const certificateId = deleteConfirm.certId;
    const certificateTitle = deleteConfirm.certTitle;
    if (!certificateId) return;

    setDeleting(certificateId);
    setDeleteConfirm({ show: false, certId: null, certTitle: '' });
    setError(null); // Clear any previous errors
    
    try {
      const response = await fetch('/api/certificates/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete certificate');
      }

      // Remove from local state immediately
      setRows(prev => prev.filter(cert => cert.id !== certificateId));
      setRecentUploads(prev => prev.filter(cert => cert.id !== certificateId));
      
      // Remove from confidence and details maps
      setConfidence(prev => {
        const newConf = { ...prev };
        delete newConf[certificateId];
        return newConf;
      });
      setDetails(prev => {
        const newDetails = { ...prev };
        delete newDetails[certificateId];
        return newDetails;
      });

      // Show success message briefly
      console.log(`✅ Successfully deleted: ${certificateTitle}`);

    } catch (error) {
      console.error('❌ Delete certificate error:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete certificate');
      // Re-open modal on error so user can try again
      setDeleteConfirm({ show: true, certId: certificateId, certTitle: certificateTitle });
    } finally {
      setDeleting(null);
    }
  }, [deleteConfirm.certId, deleteConfirm.certTitle]);

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
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white px-6 py-3 rounded-xl font-medium transition-colors shadow-lg hover:shadow-blue-500/25"
          >
            <Download className="w-4 h-4" />
            Upload Certificate
          </a>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Portfolio Preview Section with brand gradient */}
        {rows.length > 0 && (
          <div className="bg-gradient-to-r from-blue-500/10 to-emerald-500/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl">
                  <ExternalLink className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Portfolio Preview</h2>
                  <p className="text-white/70 text-sm">Your public portfolio is ready to share</p>
                </div>
              </div>
              <a
                href={`/public/portfolio/${rows[0]?.id || 'preview'}`}
                target="_blank"
                rel="noreferrer"
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                View Portfolio
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-white/70 text-sm">Verified Certificates</span>
                </div>
                <p className="text-2xl font-bold text-white">
                  {rows.filter(r => r.verification_status === 'verified').length}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-white/70 text-sm">Auto-Approved</span>
                </div>
                <p className="text-2xl font-bold text-white">
                  {rows.filter(r => r.auto_approved).length}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  <span className="text-white/70 text-sm">Trust Score</span>
                </div>
                <p className="text-2xl font-bold text-white">
                  {Math.round((rows.filter(r => r.verification_status === 'verified').length / Math.max(rows.length, 1)) * 100)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recent Uploads Progress - Enhanced */}
        {recentUploads.length > 0 && (
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 md:p-8 mb-8 shadow-2xl group">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-blue-400 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                <div className="relative p-3 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl">
                  <Upload className="w-6 h-6 text-emerald-300" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">Recent Uploads</h2>
                <p className="text-white/80 text-sm font-medium">Track your latest certificate uploads</p>
              </div>
            </div>
            <div className="space-y-4">
              {recentUploads.map((upload, index) => {
                const confScore = confidence[upload.id] || 0;
                const verificationMethod = getVerificationMethod(details[upload.id]);
                
                // Handle date calculation safely
                let timeAgoText = 'Unknown';
                if (upload.created_at) {
                  const timeAgo = new Date(upload.created_at);
                  const now = new Date();
                  
                  // Check if the date is valid
                  if (!isNaN(timeAgo.getTime())) {
                    const diffInHours = Math.floor((now.getTime() - timeAgo.getTime()) / (1000 * 60 * 60));
                    
                    if (diffInHours < 1) {
                      timeAgoText = 'Just now';
                    } else if (diffInHours < 24) {
                      timeAgoText = `${diffInHours}h ago`;
                    } else {
                      timeAgoText = `${Math.floor(diffInHours / 24)}d ago`;
                    }
                  }
                }
                
                return (
                  <div key={upload.id} className="bg-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          upload.verification_status === 'verified' ? 'bg-emerald-400' :
                          upload.verification_status === 'pending' ? 'bg-yellow-400' :
                          'bg-red-400'
                        }`}></div>
                        <h3 className="text-white font-medium truncate">{upload.title}</h3>
                        <span className="text-white/50 text-sm">
                          {timeAgoText}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1 ${verificationMethod.color}`}>
                          {verificationMethod.icon}
                          <span className="text-xs">{verificationMethod.text}</span>
                        </div>
                        <span className={`text-xs font-semibold ${getConfidenceColor(confScore)}`}>
                          {Math.round(confScore * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-white/60 text-sm truncate">{upload.institution}</p>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(upload.verification_status, upload.auto_approved)}
                        <span className={`text-xs ${getStatusColor(upload.verification_status, upload.auto_approved).split(' ')[1]}`}>
                          {getStatusText(upload.verification_status, upload.auto_approved)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary Stats - Enhanced design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 mb-8">
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 md:p-5 hover:scale-105 hover:border-emerald-400/30 transition-all duration-300 group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white/70 text-xs md:text-sm font-medium mb-1">Verified</p>
                <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                  {rows.filter(r => r.verification_status === 'verified').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 md:p-5 hover:scale-105 hover:border-yellow-400/30 transition-all duration-300 group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-yellow-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Clock className="w-5 h-5 md:w-6 md:h-6 text-yellow-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white/70 text-xs md:text-sm font-medium mb-1">Pending</p>
                <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-yellow-400 to-yellow-300 bg-clip-text text-transparent">
                  {rows.filter(r => r.verification_status === 'pending').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 md:p-5 hover:scale-105 hover:border-blue-400/30 transition-all duration-300 group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Zap className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white/70 text-xs md:text-sm font-medium mb-1">Auto-Verified</p>
                <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  {rows.filter(r => r.auto_approved).length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 md:p-5 hover:scale-105 hover:border-purple-400/30 transition-all duration-300 group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Star className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white/70 text-xs md:text-sm font-medium mb-1">Total</p>
                <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{rows.length}</p>
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
                      <button
                        onClick={() => fetchVcStatus(cert.id)}
                        className="ml-1 text-[10px] md:text-xs text-white/70 hover:text-white underline decoration-dotted"
                        title="Check on-chain/registry status"
                      >
                        Check status
                      </button>
                    </div>
                    {vcStatus[cert.id] && (
                      <div className={`px-2 py-1 rounded-full text-[10px] md:text-xs border ${
                        vcStatus[cert.id].status === 'active' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                        vcStatus[cert.id].status === 'revoked' ? 'bg-red-500/10 text-red-300 border-red-500/30' :
                        vcStatus[cert.id].status === 'suspended' ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30' :
                        'bg-gray-500/10 text-gray-300 border-gray-500/30'
                      }`}>
                        VC {vcStatus[cert.id].status}
                      </div>
                    )}
                    
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
                      <button 
                        onClick={() => showDeleteConfirmation(cert.id, cert.title)}
                        disabled={deleting === cert.id}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                        title="Delete Certificate"
                      >
                        {deleting === cert.id ? (
                          <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-red-300" />
                        )}
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
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Animated background - matching landing page */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating particles */}
        <div className="absolute top-20 left-[10%] w-2 h-2 bg-blue-400/40 rounded-full animate-float" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-40 right-[15%] w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-float" style={{ animationDelay: '0.5s', animationDuration: '4s' }} />
        <div className="absolute bottom-32 left-[20%] w-2.5 h-2.5 bg-purple-400/30 rounded-full animate-float" style={{ animationDelay: '1s', animationDuration: '5s' }} />
        <div className="absolute top-[60%] right-[25%] w-1 h-1 bg-blue-300/50 rounded-full animate-float" style={{ animationDelay: '1.5s', animationDuration: '3.5s' }} />
        <div className="absolute bottom-[20%] right-[10%] w-2 h-2 bg-emerald-300/40 rounded-full animate-float" style={{ animationDelay: '2s', animationDuration: '4.5s' }} />
        
        {/* Gradient orbs */}
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-br from-blue-500/30 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-br from-emerald-500/30 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
        
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header with enhanced design */}
        <div className="mb-8 md:mb-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="relative group flex-shrink-0">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                <div className="relative p-3 md:p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:scale-110 transition-transform duration-300">
                  <ScrollText className="w-7 h-7 md:w-9 md:h-9 text-blue-300 drop-shadow-lg" />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h1 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient mb-2 leading-[1.1]">
                  My Certificates
                </h1>
                <p className="text-white/80 text-sm md:text-lg font-medium">Track your verified achievements and credentials</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <a
                href="/student/upload"
                className="relative overflow-hidden bg-gradient-to-r from-blue-400 via-cyan-500 to-emerald-400 hover:from-blue-500 hover:via-cyan-600 hover:to-emerald-500 text-white px-5 md:px-7 py-3 md:py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center gap-2 text-sm md:text-base shadow-xl hover:shadow-2xl hover:shadow-cyan-500/50 transform hover:-translate-y-1 hover:scale-105 group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></span>
                <Upload className="w-4 h-4 md:w-5 md:h-5 relative z-10" />
                <span className="hidden sm:inline relative z-10">Upload Certificate</span>
                <span className="sm:hidden relative z-10">Upload</span>
              </a>
              <LogoutButton variant="minimal" />
            </div>
          </div>
        </div>

        {/* Profile Section - Enhanced glassmorphism */}
        {!profileLoading && profile && (
          <div className="mb-8 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl hover:shadow-blue-500/10 transition-shadow duration-500 group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-blue-400 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                  <div className="relative p-3 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl">
                    <User2 className="w-7 h-7 text-emerald-300" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">My Profile</h2>
                  <p className="text-white/70 text-sm">Manage your personal information</p>
                </div>
              </div>
              <button
                onClick={() => setShowProfileEdit(!showProfileEdit)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                {showProfileEdit ? 'Cancel' : 'Edit Profile'}
              </button>
            </div>

            {showProfileEdit ? (
              <ProfileEditForm 
                profile={profile} 
                onSave={() => {
                  setShowProfileEdit(false);
                  loadProfile();
                }} 
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                  <User2 className="w-5 h-5 text-blue-300" />
                  <div>
                    <p className="text-white/60 text-sm">Full Name</p>
                    <p className="text-white font-medium">{profile.full_name}</p>
                  </div>
                </div>
                
                {profile.university && (
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <Building className="w-5 h-5 text-purple-300" />
                    <div>
                      <p className="text-white/60 text-sm">University</p>
                      <p className="text-white font-medium">{profile.university}</p>
                    </div>
                  </div>
                )}
                
                {profile.graduation_year && (
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <Calendar className="w-5 h-5 text-green-300" />
                    <div>
                      <p className="text-white/60 text-sm">Graduation Year</p>
                      <p className="text-white font-medium">{profile.graduation_year}</p>
                    </div>
                  </div>
                )}
                
                {profile.major && (
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <GraduationCap className="w-5 h-5 text-yellow-300" />
                    <div>
                      <p className="text-white/60 text-sm">Major</p>
                      <p className="text-white font-medium">{profile.major}</p>
                    </div>
                  </div>
                )}
                
                {profile.location && (
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <MapPin className="w-5 h-5 text-red-300" />
                    <div>
                      <p className="text-white/60 text-sm">Location</p>
                      <p className="text-white font-medium">{profile.location}</p>
                    </div>
                  </div>
                )}
                
                {profile.gpa && (
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <Star className="w-5 h-5 text-orange-300" />
                    <div>
                      <p className="text-white/60 text-sm">GPA</p>
                      <p className="text-white font-medium">{profile.gpa}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Stats Cards */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium">Total Certificates</p>
                  <p className="text-2xl font-bold text-white">{rows.length}</p>
                </div>
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <FileText className="w-6 h-6 text-blue-300" />
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium">Verified</p>
                  <p className="text-2xl font-bold text-white">{rows.filter(r => r.verification_status === 'verified').length}</p>
                </div>
                <div className="p-3 bg-green-500/20 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-green-300" />
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium">Pending</p>
                  <p className="text-2xl font-bold text-white">{rows.filter(r => r.verification_status === 'pending').length}</p>
                </div>
                <div className="p-3 bg-yellow-500/20 rounded-xl">
                  <Clock className="w-6 h-6 text-yellow-300" />
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium">Auto-Approved</p>
                  <p className="text-2xl font-bold text-white">{rows.filter(r => r.auto_approved).length}</p>
                </div>
                <div className="p-3 bg-purple-500/20 rounded-xl">
                  <Zap className="w-6 h-6 text-purple-300" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Uploads */}
        {recentUploads.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Uploads
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentUploads.map((upload) => (
                <div key={upload.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate">{upload.title}</h4>
                      <p className="text-white/60 text-sm truncate">{upload.institution}</p>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(upload.verification_status, upload.auto_approved)}`}>
                      {getStatusText(upload.verification_status, upload.auto_approved)}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/50">
                      {upload.created_at ? (() => {
                        const timeAgo = new Date(upload.created_at);
                        const now = new Date();
                        if (!isNaN(timeAgo.getTime())) {
                          const diffInHours = Math.floor((now.getTime() - timeAgo.getTime()) / (1000 * 60 * 60));
                          if (diffInHours < 1) return 'Just now';
                          if (diffInHours < 24) return `${diffInHours}h ago`;
                          return `${Math.floor(diffInHours / 24)}d ago`;
                        }
                        return 'Unknown';
                      })() : 'Unknown'}
                    </span>
                    {upload.confidence_score && (
                      <div className="flex items-center gap-1">
                        <span className={`text-xs ${getConfidenceColor(upload.confidence_score)}`}>
                          {Math.round(upload.confidence_score * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Certificates Table - Enhanced */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="px-6 md:px-8 py-5 md:py-6 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                <div className="relative p-2 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl">
                  <ScrollText className="w-6 h-6 text-blue-300" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white">All Certificates</h3>
            </div>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              <p className="text-white/70 mt-2">Loading certificates...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-red-300">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="relative inline-block mb-6">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-2xl opacity-30" />
                <div className="relative p-6 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10">
                  <ScrollText className="w-16 h-16 text-blue-300" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">No certificates yet</h3>
              <p className="text-white/70 mb-6 text-lg">Upload your first certificate to get started</p>
              <a
                href="/student/upload"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-400 via-cyan-500 to-emerald-400 hover:from-blue-500 hover:via-cyan-600 hover:to-emerald-500 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 shadow-xl hover:shadow-cyan-500/50 hover:scale-105"
              >
                <Upload className="w-5 h-5" />
                Upload Certificate
              </a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">Certificate</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">Institution</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">Confidence</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">Date Issued</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white/80 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-white/5 transition-all duration-300 group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500/30 to-emerald-500/30 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
                              <ScrollText className="w-5 h-5 text-blue-300" />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-semibold truncate">{row.title}</p>
                            <p className="text-white/60 text-sm truncate">{row.institution}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-white/90 font-medium">{row.institution}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <div className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${getStatusColor(row.verification_status, row.auto_approved)}`}>
                            {getStatusText(row.verification_status, row.auto_approved)}
                          </div>
                          <button
                            onClick={() => fetchVcStatus(row.id)}
                            className="text-[10px] text-blue-300 hover:text-blue-200 underline decoration-dotted transition-colors"
                            title="Check VC status"
                          >
                            Check
                          </button>
                          {vcStatus[row.id] && (
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-medium border ${
                              vcStatus[row.id].status === 'active' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                              vcStatus[row.id].status === 'revoked' ? 'bg-red-500/10 text-red-300 border-red-500/30' :
                              vcStatus[row.id].status === 'suspended' ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30' :
                              'bg-gray-500/10 text-gray-300 border-gray-500/30'
                            }`}>
                              VC {vcStatus[row.id].status}
                            </span>
                          )}
                          {row.auto_approved && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 rounded-lg text-xs text-emerald-300 font-medium border border-emerald-400/30">
                              <Zap className="w-3 h-3" />
                              Auto
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {row.confidence_score ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20">
                              {getConfidenceBar(row.confidence_score)}
                            </div>
                            <span className={`text-sm font-bold ${getConfidenceColor(row.confidence_score)}`}>
                              {Math.round(row.confidence_score * 100)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-white/50 text-sm font-medium">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-white/90 text-sm font-medium">
                        {row.date_issued ? new Date(row.date_issued).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          {row.file_url && (
                            <a
                              href={row.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-blue-300 hover:text-blue-200 hover:bg-blue-500/20 rounded-lg transition-all duration-300 border border-transparent hover:border-blue-400/30 hover:scale-110"
                              title="View Certificate"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => showDeleteConfirmation(row.id, row.title)}
                            disabled={deleting === row.id}
                            className="p-2 text-red-300 hover:text-red-200 hover:bg-red-500/20 rounded-lg transition-all duration-300 disabled:opacity-50 border border-transparent hover:border-red-400/30 hover:scale-110"
                            title="Delete Certificate"
                          >
                            {deleting === row.id ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-red-500/30 rounded-3xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-orange-500 rounded-xl blur-lg opacity-50" />
                <div className="relative p-3 bg-red-500/20 rounded-xl border border-red-400/30">
                  <Trash2 className="w-6 h-6 text-red-300" />
                </div>
              </div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">Delete Certificate?</h3>
            </div>
            
            <p className="text-white/80 mb-8 text-base">
              Are you sure you want to delete <span className="font-bold text-white">&quot;{deleteConfirm.certTitle}&quot;</span>? This action cannot be undone.
            </p>
            
            <div className="flex gap-4 justify-end">
              <button
                onClick={cancelDelete}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all duration-300 border border-white/20 hover:border-white/30 hover:scale-105"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="relative overflow-hidden px-6 py-3 bg-gradient-to-r from-red-500 via-red-600 to-orange-500 hover:from-red-600 hover:via-red-700 hover:to-orange-600 text-white rounded-xl font-semibold transition-all duration-300 shadow-xl hover:shadow-red-500/50 hover:scale-105 group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></span>
                <span className="relative z-10">Delete Certificate</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Profile Edit Form Component
function ProfileEditForm({ profile, onSave }: { profile: Profile; onSave: () => void }) {
  const [formData, setFormData] = useState({
    full_name: profile.full_name,
    university: profile.university || '',
    graduation_year: profile.graduation_year?.toString() || '',
    major: profile.major || '',
    location: profile.location || '',
    gpa: profile.gpa?.toString() || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profile/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name.trim(),
          university: formData.university.trim() || undefined,
          graduation_year: formData.graduation_year ? Number(formData.graduation_year) : undefined,
          major: formData.major.trim() || undefined,
          location: formData.location.trim() || undefined,
          gpa: formData.gpa ? Number(formData.gpa) : undefined,
        }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error || 'Failed to save profile');
      }

      onSave();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-white/70 text-sm font-medium mb-2">Full Name *</label>
          <input
            type="text"
            value={formData.full_name}
            onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Enter your full name"
            required
          />
        </div>

        <div>
          <label className="block text-white/70 text-sm font-medium mb-2">University</label>
          <input
            type="text"
            value={formData.university}
            onChange={(e) => setFormData(prev => ({ ...prev, university: e.target.value }))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Enter your university"
          />
        </div>

        <div>
          <label className="block text-white/70 text-sm font-medium mb-2">Graduation Year</label>
          <input
            type="number"
            min="1900"
            max="2100"
            value={formData.graduation_year}
            onChange={(e) => setFormData(prev => ({ ...prev, graduation_year: e.target.value }))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Enter graduation year"
          />
        </div>

        <div>
          <label className="block text-white/70 text-sm font-medium mb-2">Major</label>
          <input
            type="text"
            value={formData.major}
            onChange={(e) => setFormData(prev => ({ ...prev, major: e.target.value }))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Enter your major"
          />
        </div>

        <div>
          <label className="block text-white/70 text-sm font-medium mb-2">Location</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Enter your location"
          />
        </div>

        <div>
          <label className="block text-white/70 text-sm font-medium mb-2">GPA</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="10"
            value={formData.gpa}
            onChange={(e) => setFormData(prev => ({ ...prev, gpa: e.target.value }))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Enter your GPA"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={loading || !formData.full_name.trim()}
          className="px-6 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-blue-500/25"
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => onSave()}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}


