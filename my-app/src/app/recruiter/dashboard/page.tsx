'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Search, Filter, Users, CheckCircle, Clock, XCircle, 
  Eye, Mail, Star, TrendingUp, RefreshCw, Grid, List,
  MapPin, Award, Download, AlertCircle, 
  FileCheck, UserCheck, MessageSquare, Briefcase,
  Target, ChevronRight, UserCircle2, Building2
} from 'lucide-react';
import OrganizationSwitcher from '@/components/OrganizationSwitcher';
import LogoutButton from '@/components/LogoutButton';
import { apiFetch } from '@/lib/apiClient';
import { logger } from '@/lib/logger';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  university: string;
  graduation_year: number;
  major: string;
  gpa: number;
  location: string;
  skills: string[];
  certifications: Certification[];
  verified_count: number;
  total_certifications: number;
  last_activity: string;
  created_at: string;
}

interface Certification {
  id: string;
  title: string;
  issuer: string;
  issue_date: string;
  verification_status: 'verified' | 'pending' | 'rejected';
  confidence_score: number;
  skills: string[];
  verification_method: string;
}

interface ContactLog {
  id: string;
  recruiter_id: string;
  student_id: string;
  contacted_at: string;
  method: 'email' | 'phone' | 'linkedin' | 'other';
  notes: string | null;
  response_received: boolean;
  response_at: string | null;
  created_at: string;
}

interface Analytics {
  total_students: number;
  verified_certifications: number;
  pending_certifications: number;
  rejected_certifications: number;
  average_confidence: number;
  top_skills: { skill: string; count: number }[];
  top_universities: { university: string; count: number }[];
  daily_activity: { date: string; count: number }[];
  contacted_students?: number;
  active_pipeline_count?: number;
  engagement_rate?: number;
  response_rate?: number;
}

type PipelineStage = 'none' | 'shortlisted' | 'contacted' | 'interviewed' | 'offered' | 'rejected';

export default function RecruiterDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<{ total: number; limit: number; offset: number; has_more: boolean } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [pipelineStages, setPipelineStages] = useState<Record<string, PipelineStage>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  const [showContactHistory, setShowContactHistory] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<StudentRow | null>(null);
  const [contactHistory, setContactHistory] = useState<ContactLog[]>([]);

  // Load persisted data from database
  const loadPersistedData = useCallback(async () => {
    try {
      const favRes = await fetch('/api/recruiter/favorites');
      if (favRes.ok) {
        const favData = await favRes.json();
        setFavorites(new Set(favData.favorites || []));
      }
      
      const pipeRes = await fetch('/api/recruiter/pipeline');
      if (pipeRes.ok) {
        const pipeData = await pipeRes.json();
        setPipelineStages(pipeData.pipeline || {});
      }
    } catch (err) {
      logger.error('Failed to load persisted data', err);
    }
  }, []);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    try {
      // Using apiFetch - automatically includes X-Organization-ID header
      const response = await apiFetch('/api/recruiter/analytics');
      const data = await response.json();
      if (response.ok) {
        setAnalytics(data.data);
      }
    } catch (err) {
      logger.error('Failed to fetch analytics', err);
    }
  }, []);

  // Search students
  const searchStudents = useCallback(async () => {
    logger.debug('[DASHBOARD] searchStudents called', { searchQuery });
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/recruiter/search-students', window.location.origin);
      if (searchQuery) url.searchParams.set('q', searchQuery);
      
      logger.debug('[DASHBOARD] Fetching URL', { url: url.toString() });
      // Using apiFetch - automatically includes X-Organization-ID header
      const res = await apiFetch(url.toString());
      const json = await res.json();
      
      logger.debug('[DASHBOARD] API response', {
        ok: res.ok,
        status: res.status,
        data: json
      });
      
      if (!res.ok) throw new Error(json.error || 'Search failed');
      
      const studentData = json.data?.students || [];
      logger.debug('[DASHBOARD] Extracted studentData', { count: studentData.length });
      
      setStudents(studentData);
      setPagination(json.data?.pagination || null);
      
      logger.debug('[DASHBOARD] State updated with students', { count: studentData.length });
    } catch (e: unknown) {
      logger.error('[DASHBOARD] Error', e);
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // Track which student contact actions are in-flight to prevent duplicate clicks
  const [contactingIds, setContactingIds] = useState<Set<string>>(new Set());

  const addContacting = (id: string) => setContactingIds(prev => new Set(prev).add(id));
  const removeContacting = (id: string) => setContactingIds(prev => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });

  // Contact student via email
  const contactStudent = useCallback(async (student: StudentRow) => {
    // prevent duplicate rapid clicks
    if (contactingIds.has(student.id)) return;
    addContacting(student.id);

    try {
      const subject = encodeURIComponent(`Opportunity from ${student.university || 'Our Company'}`);
      const body = encodeURIComponent(`Hi ${student.name},\n\nI came across your profile and verified certifications on CampusSync. I'd like to discuss potential opportunities.\n\nBest regards`);
      // Open mail client once
      window.open(`mailto:${student.email}?subject=${subject}&body=${body}`);

      const response = await fetch('/api/recruiter/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          studentId: student.id,
          method: 'email',
          notes: `Email sent via mailto link at ${new Date().toLocaleString()}`
        })
      });

      if (response.ok) {
        logger.debug('Contact logged successfully');
      }

      fetchAnalytics();
    } catch (err) {
      logger.error('Failed to log contact', err);
    } finally {
      // allow actions again after request completes
      removeContacting(student.id);
    }
  }, [fetchAnalytics, contactingIds]);
  
  // View contact history for a student
  const viewContactHistory = useCallback(async (student: StudentRow) => {
    setSelectedStudentForHistory(student);
    setShowContactHistory(true);
    
    try {
      const response = await fetch(`/api/recruiter/contacts?studentId=${student.id}`);
      if (response.ok) {
        const data = await response.json();
        setContactHistory(data.contacts || []);
      }
    } catch (err) {
      logger.error('Failed to fetch contact history', err);
    }
  }, []);
  
  // Mark contact as responded
  const markContactResponse = useCallback(async (contactId: string, responseReceived: boolean) => {
    try {
      await fetch('/api/recruiter/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, responseReceived })
      });
      
      if (selectedStudentForHistory) {
        viewContactHistory(selectedStudentForHistory);
      }
      
      fetchAnalytics();
    } catch (err) {
      logger.error('Failed to update contact response', err);
    }
  }, [selectedStudentForHistory, viewContactHistory, fetchAnalytics]);

  // Toggle favorite
  const toggleFavorite = useCallback(async (studentId: string) => {
    const isFavorite = favorites.has(studentId);
    
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (isFavorite) {
        newFavorites.delete(studentId);
      } else {
        newFavorites.add(studentId);
      }
      return newFavorites;
    });
    
    try {
      if (isFavorite) {
        await fetch(`/api/recruiter/favorites?studentId=${studentId}`, {
          method: 'DELETE'
        });
      } else {
        await fetch('/api/recruiter/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId })
        });
      }
    } catch (err) {
      logger.error('Failed to update favorite', err);
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (isFavorite) {
          newFavorites.add(studentId);
        } else {
          newFavorites.delete(studentId);
        }
        return newFavorites;
      });
    }
  }, [favorites]);

  // Update pipeline stage
  const updatePipelineStage = useCallback(async (studentId: string, stage: PipelineStage) => {
    if (stage === 'none') return;
    
    setPipelineStages(prev => ({ ...prev, [studentId]: stage }));
    
    try {
      await fetch('/api/recruiter/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, stage })
      });
      
      fetchAnalytics();
    } catch (err) {
      logger.error('Failed to update pipeline', err);
    }
  }, [fetchAnalytics]);

  // Load data on mount
  useEffect(() => {
    loadPersistedData();
    fetchAnalytics();
    searchStudents();
  }, [loadPersistedData, fetchAnalytics, searchStudents]);

  // Handle student selection
  const handleStudentSelect = (studentId: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Handle bulk actions
  const handleBulkAction = (action: 'export' | 'contact' | 'favorite') => {
    if (action === 'export') {
      exportStudentsPDF(selectedStudents);
    } else if (action === 'contact') {
      const selectedEmails = students
        .filter(s => selectedStudents.includes(s.id))
        .map(s => s.email)
        .join(',');
      window.open(`mailto:${selectedEmails}`);
    } else if (action === 'favorite') {
      setFavorites(prev => {
        const newSet = new Set(prev);
        selectedStudents.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  // Export students to PDF
  const exportStudentsPDF = async (studentIds: string[]) => {
    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      
      const selectedStudentsList = students.filter(s => studentIds.includes(s.id));
      
      if (selectedStudentsList.length === 0) {
        alert('No students selected for export');
        return;
      }

      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.setTextColor(79, 70, 229);
      doc.text('Student Talent Report', 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
      doc.text(`Total Students: ${selectedStudentsList.length}`, 14, 33);
      
      const tableData = selectedStudentsList.map(student => {
        const stage = pipelineStages[student.id] || 'none';
        const isFav = favorites.has(student.id);
        
        return [
          student.name,
          student.university,
          student.major,
          student.graduation_year.toString(),
          `${student.verified_count}/${student.total_certifications}`,
          stage === 'none' ? '-' : stage,
          isFav ? '⭐' : '-'
        ];
      });
      
      autoTable(doc, {
        startY: 40,
        head: [['Name', 'University', 'Major', 'Grad Year', 'Verified Certs', 'Stage', 'Favorite']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 40 },
          2: { cellWidth: 30 },
          3: { cellWidth: 20 },
          4: { cellWidth: 25 },
          5: { cellWidth: 25 },
          6: { cellWidth: 15 }
        }
      });
      
      const filename = `talent_report_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      alert(`[SUCCESS] Exported ${selectedStudentsList.length} student(s) to PDF`);
      
    } catch (error) {
      logger.error('PDF export error', error);
      alert('Failed to export PDF. Please try again.');
    }
  };

  const getVerificationStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
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

  const getPipelineIcon = (stage: PipelineStage) => {
    switch (stage) {
      case 'shortlisted':
        return <FileCheck className="w-3 h-3" />;
      case 'contacted':
        return <Mail className="w-3 h-3" />;
      case 'interviewed':
        return <MessageSquare className="w-3 h-3" />;
      case 'offered':
        return <Target className="w-3 h-3" />;
      case 'rejected':
        return <XCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Animated background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-[10%] w-2 h-2 bg-blue-400/40 rounded-full animate-float" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-40 right-[15%] w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-float" style={{ animationDelay: '0.5s', animationDuration: '4s' }} />
        <div className="absolute bottom-32 left-[20%] w-2.5 h-2.5 bg-purple-400/30 rounded-full animate-float" style={{ animationDelay: '1s', animationDuration: '5s' }} />
        <div className="absolute top-[60%] right-[25%] w-1 h-1 bg-blue-300/50 rounded-full animate-float" style={{ animationDelay: '1.5s', animationDuration: '3.5s' }} />
        <div className="absolute bottom-[20%] right-[10%] w-2 h-2 bg-emerald-300/40 rounded-full animate-float" style={{ animationDelay: '2s', animationDuration: '4.5s' }} />
        
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-br from-blue-500/30 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-br from-emerald-500/30 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
        
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header */}
        <div className="mb-8 md:mb-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="relative group flex-shrink-0">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                <div className="relative p-3 md:p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:scale-110 transition-transform duration-300">
                  <Briefcase className="w-7 h-7 md:w-9 md:h-9 text-blue-300 drop-shadow-lg" />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient mb-2 leading-tight">
                  Recruiter Dashboard
                </h1>
                <p className="text-white/80 text-xs sm:text-sm md:text-base lg:text-lg font-medium">Find and manage talented students</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              {/* Organization Switcher */}
              <OrganizationSwitcher />
              
              <button 
                onClick={() => exportStudentsPDF(selectedStudents.length > 0 ? selectedStudents : students.map(s => s.id))}
                className="relative overflow-hidden bg-gradient-to-r from-blue-400 via-cyan-500 to-emerald-400 hover:from-blue-500 hover:via-cyan-600 hover:to-emerald-500 text-white px-5 md:px-7 py-3 md:py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center gap-2 text-sm md:text-base shadow-xl hover:shadow-2xl hover:shadow-cyan-500/50 transform hover:-translate-y-1 hover:scale-105 group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></span>
                <Download className="w-4 h-4 md:w-5 md:h-5 relative z-10" />
                <span className="hidden sm:inline relative z-10">Export Report</span>
              </button>
              
              <LogoutButton variant="minimal" />
            </div>
          </div>
        </div>

        {/* Analytics Cards */}
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 mb-8">
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 md:p-5 hover:scale-105 hover:border-blue-400/30 transition-all duration-300 group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-white/70 text-xs md:text-sm font-medium mb-1">Talent Pool</p>
                  <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    {analytics.total_students || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 md:p-5 hover:scale-105 hover:border-emerald-400/30 transition-all duration-300 group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Mail className="w-5 h-5 md:w-6 md:h-6 text-emerald-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-white/70 text-xs md:text-sm font-medium mb-1">Contacted</p>
                  <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                    {analytics.contacted_students || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 md:p-5 hover:scale-105 hover:border-yellow-400/30 transition-all duration-300 group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-yellow-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-yellow-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-white/70 text-xs md:text-sm font-medium mb-1">Engagement</p>
                  <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-yellow-400 to-yellow-300 bg-clip-text text-transparent">
                    {analytics.engagement_rate || 0}%
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 md:p-5 hover:scale-105 hover:border-purple-400/30 transition-all duration-300 group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-purple-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-white/70 text-xs md:text-sm font-medium mb-1">Response Rate</p>
                  <p className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    {analytics.response_rate || 0}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Request Organization Access CTA */}
        <Link
          href="/recruiter/organizations"
          className="block mb-6 group"
        >
          <div className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 backdrop-blur-2xl border border-emerald-500/30 rounded-3xl shadow-2xl p-6 hover:shadow-emerald-500/20 transition-all duration-300 hover:scale-[1.02]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Building2 className="w-8 h-8 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-white text-xl font-bold mb-1">Need Access to More Organizations?</h3>
                  <p className="text-gray-400 text-sm">
                    Browse universities and companies to connect with talented students
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ChevronRight className="w-6 h-6 text-emerald-300 group-hover:translate-x-2 transition-transform duration-300" />
              </div>
            </div>
          </div>
        </Link>

        {/* Search Bar */}
        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 mb-6 shadow-2xl">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/50 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search students by name, skills, or university..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-all hover:scale-105"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </button>
              <button
                onClick={searchStudents}
                disabled={loading}
                className="flex items-center px-5 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 hover:scale-105 shadow-lg"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Search
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">University</label>
                  <select className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50">
                    <option>All Universities</option>
                    <option>Stanford University</option>
                    <option>MIT</option>
                    <option>Harvard University</option>
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">Graduation Year</label>
                  <select className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50">
                    <option>All Years</option>
                    <option>2024</option>
                    <option>2025</option>
                    <option>2026</option>
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">Skills</label>
                  <input
                    type="text"
                    placeholder="e.g., Python, React"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedStudents.length > 0 && (
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 backdrop-blur-xl border border-purple-400/30 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">
                {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleBulkAction('contact')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-colors flex items-center"
                >
                  <Mail className="w-4 h-4 mr-1" />
                  Contact All
                </button>
                <button 
                  onClick={() => handleBulkAction('favorite')}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm transition-colors"
                >
                  Add to Favorites
                </button>
                <button 
                  onClick={() => handleBulkAction('export')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                >
                  Export PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex bg-white/10 backdrop-blur-xl rounded-xl p-1 border border-white/20">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white/20 shadow-lg' : 'hover:bg-white/10'}`}
              >
                <Grid className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white/20 shadow-lg' : 'hover:bg-white/10'}`}
              >
                <List className="w-4 h-4 text-white" />
              </button>
            </div>
            <span className="text-sm text-white/70 font-medium">
              {students.length} student{students.length !== 1 ? 's' : ''} found
            </span>
          </div>
        </div>

        {/* Students Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
              <p className="text-white/70">Loading students...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-3" />
            <p className="text-red-300 font-medium">{error}</p>
          </div>
        ) : students.length === 0 ? (
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-12 text-center">
            <Users className="w-16 h-16 text-white/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No students found</h3>
            <p className="text-white/60">Try adjusting your search criteria or filters.</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' 
            : 'space-y-4'
          }>
            {students.map((student) => (
              <div
                key={student.id}
                className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 hover:bg-white/15 hover:border-blue-400/30 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/20 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={() => handleStudentSelect(student.id)}
                      className="mr-3 h-4 w-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-400/50"
                    />
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500/30 to-emerald-500/30 backdrop-blur-sm border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <span className="text-lg font-bold text-white">
                        {student.name ? student.name.split(' ').map(n => n[0]).join('') : 'U'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-white truncate">{student.name || 'Unknown Student'}</h3>
                      <p className="text-sm text-white/70 truncate">{student.university || 'Unknown University'}</p>
                      <p className="text-xs text-white/50">{student.major || 'Unknown'} • Class of {student.graduation_year || 'Unknown'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleFavorite(student.id)}
                      className={`p-2 rounded-lg transition-all ${favorites.has(student.id) ? 'text-yellow-400 bg-yellow-500/20' : 'text-white/50 hover:text-yellow-400 hover:bg-yellow-500/10'}`}
                      title={favorites.has(student.id) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className={`w-4 h-4 ${favorites.has(student.id) ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={() => contactStudent(student)}
                      disabled={contactingIds.has(student.id)}
                      className={`p-2 rounded-lg transition-all ${contactingIds.has(student.id) ? 'opacity-50 pointer-events-none' : 'text-white/50 hover:text-purple-400 hover:bg-purple-500/20'}`}
                      title={contactingIds.has(student.id) ? 'Contacting...' : 'Contact Student'}
                      aria-busy={contactingIds.has(student.id) ? 'true' : 'false'}
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => window.open(`/recruiter/student/${student.id}`, '_blank')}
                      className="p-2 text-white/50 hover:text-blue-400 hover:bg-blue-500/20 rounded-lg transition-all"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Pipeline Stage Badge */}
                {pipelineStages[student.id] && (
                  <div className="mb-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                      pipelineStages[student.id] === 'shortlisted' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                      pipelineStages[student.id] === 'contacted' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                      pipelineStages[student.id] === 'interviewed' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                      pipelineStages[student.id] === 'offered' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                      'bg-red-500/20 text-red-300 border-red-500/30'
                    }`}>
                      {getPipelineIcon(pipelineStages[student.id])}
                      {pipelineStages[student.id].charAt(0).toUpperCase() + pipelineStages[student.id].slice(1)}
                    </span>
                  </div>
                )}

                {/* Skills */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-white/70 mb-2 uppercase tracking-wider">Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {student.skills.slice(0, 5).map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30 hover:bg-blue-500/30 transition-colors"
                      >
                        {skill}
                      </span>
                    ))}
                    {student.skills.length > 5 && (
                      <span className="text-xs text-white/50 px-2 py-1">
                        +{student.skills.length - 5} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Student Info */}
                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Award className="w-4 h-4 text-emerald-400" />
                    <span className="font-medium">GPA:</span>
                    <span className="text-white">{student.gpa || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <MapPin className="w-4 h-4 text-red-400" />
                    <span className="font-medium">Location:</span>
                    <span className="text-white">{student.location || 'N/A'}</span>
                  </div>
                </div>

                {/* Certifications Summary */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/70 font-medium">Verified Certifications</span>
                    <span className="font-bold text-emerald-400">
                      {student.verified_count}/{student.total_certifications}
                    </span>
                  </div>
                  {student.certifications.slice(0, 2).map((cert) => (
                    <div key={cert.id} className="p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all">
                      <div className="flex items-start gap-2">
                        {getVerificationStatusIcon(cert.verification_status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{cert.title}</p>
                          <p className="text-xs text-white/60">{cert.issuer}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${
                          cert.confidence_score >= 0.9 ? 'bg-emerald-500/20 text-emerald-300' :
                          cert.confidence_score >= 0.7 ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-red-500/20 text-red-300'
                        }`}>
                          {Math.round(cert.confidence_score * 100)}%
                        </span>
                      </div>
                      <div className="mt-2">
                        {getConfidenceBar(cert.confidence_score)}
                      </div>
                    </div>
                  ))}
                  {student.certifications.length > 2 && (
                    <p className="text-xs text-white/50 text-center py-1">
                      +{student.certifications.length - 2} more certificates
                    </p>
                  )}
                </div>

                {/* Pipeline Management */}
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs font-semibold text-white/70 mb-2 uppercase tracking-wider">Pipeline Stage</p>
                  <select
                    value={pipelineStages[student.id] || 'none'}
                    onChange={(e) => updatePipelineStage(student.id, e.target.value as PipelineStage)}
                    className="w-full text-sm bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50 hover:bg-white/15 transition-all"
                  >
                    <option value="none">No Stage</option>
                    <option value="shortlisted">Shortlisted</option>
                    <option value="contacted">Contacted</option>
                    <option value="interviewed">Interviewed</option>
                    <option value="offered">Offered</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => contactStudent(student)}
                      disabled={contactingIds.has(student.id)}
                      className={`flex items-center justify-center text-sm text-white px-3 py-2.5 rounded-xl transition-all font-medium shadow-lg ${contactingIds.has(student.id) ? 'bg-purple-600/60 opacity-70 pointer-events-none' : 'bg-purple-600 hover:bg-purple-700 hover:shadow-purple-500/50 hover:scale-105'}`}
                      title={contactingIds.has(student.id) ? 'Contacting...' : 'Send email'}
                      aria-busy={contactingIds.has(student.id) ? 'true' : 'false'}
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => viewContactHistory(student)}
                      className="flex items-center justify-center text-sm text-white bg-white/10 hover:bg-white/20 px-3 py-2.5 rounded-xl transition-all border border-white/20"
                      title="View contact history"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => window.open(`/recruiter/student/${student.id}`, '_blank')}
                      className="flex items-center justify-center text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-2.5 rounded-xl transition-all font-medium shadow-lg hover:shadow-blue-500/50 hover:scale-105"
                      title="View full profile"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.total > pagination.limit && (
          <div className="flex justify-center mt-8">
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-xl rounded-xl p-2 border border-white/20">
              <button
                disabled={pagination.offset <= 0}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all font-medium"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-white/80 font-medium">
                Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
              </span>
              <button
                disabled={!pagination.has_more}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Contact History Modal */}
      {showContactHistory && selectedStudentForHistory && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900/95 to-blue-900/95 border border-white/20 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden backdrop-blur-2xl">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600/80 to-emerald-600/80 backdrop-blur-xl text-white p-6 relative overflow-hidden border-b border-white/10">
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 animate-pulse"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                    <UserCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{selectedStudentForHistory.name}</h2>
                    <p className="text-blue-100 text-sm">{selectedStudentForHistory.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowContactHistory(false)}
                  className="text-white/80 hover:text-white transition-colors hover:scale-110 p-2 hover:bg-white/10 rounded-lg"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh] bg-gradient-to-br from-slate-900/95 to-blue-900/95">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                Contact History
              </h3>
              
              {contactHistory.length === 0 ? (
                <div className="text-center py-8">
                  <div className="relative inline-block mb-4">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-30" />
                    <div className="relative p-6 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10">
                      <Mail className="w-12 h-12 text-blue-300" />
                    </div>
                  </div>
                  <p className="text-white/70">No contact history yet</p>
                  <p className="text-white/50 text-sm mt-1">Click &quot;Contact&quot; to send your first email</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contactHistory.map((contact) => (
                    <div key={contact.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Mail className="w-4 h-4 text-blue-400" />
                          </div>
                          <div>
                            <span className="font-medium text-white capitalize flex items-center gap-2">
                              {contact.method}
                              <ChevronRight className="w-3 h-3 text-white/50" />
                            </span>
                            <p className="text-xs text-white/50">
                              {new Date(contact.contacted_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {contact.response_received ? (
                            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full font-medium border border-emerald-400/30 flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />
                              Responded
                            </span>
                          ) : (
                            <button
                              onClick={() => markContactResponse(contact.id, true)}
                              className="text-xs bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 px-3 py-1 rounded-full font-medium border border-yellow-400/30 transition-colors flex items-center gap-1"
                            >
                              <Clock className="w-3 h-3" />
                              Mark Responded
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {contact.notes && (
                        <p className="text-sm text-white/70 ml-11 mt-2 p-2 bg-white/5 rounded-lg border border-white/10">{contact.notes}</p>
                      )}
                      
                      {contact.response_received && contact.response_at && (
                        <p className="text-xs text-emerald-400 ml-11 mt-2 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Responded on {new Date(contact.response_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="bg-white/5 backdrop-blur-xl px-6 py-4 flex justify-between items-center border-t border-white/10">
              <p className="text-sm text-white/70">
                Total Contacts: <span className="font-semibold text-white">{contactHistory.length}</span>
                {contactHistory.length > 0 && (
                  <>
                    {' '} | Responses: <span className="font-semibold text-emerald-400">
                      {contactHistory.filter(c => c.response_received).length}
                    </span>
                  </>
                )}
              </p>
              <button
                onClick={() => contactStudent(selectedStudentForHistory)}
                className="flex items-center text-sm text-white bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 px-4 py-2 rounded-xl transition-all font-medium shadow-lg hover:shadow-blue-500/50 hover:scale-105"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send New Email
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}