'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import LogoutButton from '@/components/LogoutButton';
import { 
  Search, Filter, Users, CheckCircle, Clock, XCircle, 
  Eye, Mail, Star,
  TrendingUp, RefreshCw, Grid, List
} from 'lucide-react';

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

interface StudentPipelineData {
  studentId: string;
  stage: PipelineStage;
  isFavorite: boolean;
  contactedAt?: string;
}

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
  
  // Recruiter-specific states (now persisted in database)
  const [pipelineStages, setPipelineStages] = useState<Record<string, PipelineStage>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [contactedStudents, setContactedStudents] = useState<Set<string>>(new Set());
  const [loadingPersistence, setLoadingPersistence] = useState(true);
  
  // Contact tracking modal
  const [showContactHistory, setShowContactHistory] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<StudentRow | null>(null);
  const [contactHistory, setContactHistory] = useState<ContactLog[]>([]);

  // Load persisted data from database
  const loadPersistedData = useCallback(async () => {
    try {
      setLoadingPersistence(true);
      
      // Load favorites
      const favRes = await fetch('/api/recruiter/favorites');
      if (favRes.ok) {
        const favData = await favRes.json();
        setFavorites(new Set(favData.favorites || []));
      }
      
      // Load pipeline stages
      const pipeRes = await fetch('/api/recruiter/pipeline');
      if (pipeRes.ok) {
        const pipeData = await pipeRes.json();
        setPipelineStages(pipeData.pipeline || {});
      }
      
      // Load contact history
      const contactRes = await fetch('/api/recruiter/contacts');
      if (contactRes.ok) {
        const contactData = await contactRes.json();
        const contactedIds = new Set<string>(contactData.contacts?.map((c: { student_id: string }) => c.student_id) || []);
        setContactedStudents(contactedIds);
      }
    } catch (err) {
      console.error('Failed to load persisted data:', err);
    } finally {
      setLoadingPersistence(false);
    }
  }, []);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch('/api/recruiter/analytics');
      const data = await response.json();
      if (response.ok) {
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  }, []);

  // Search students
  const searchStudents = useCallback(async () => {
    console.log('[DASHBOARD] searchStudents called, searchQuery:', searchQuery);
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/recruiter/search-students', window.location.origin);
      if (searchQuery) url.searchParams.set('q', searchQuery);
      
      console.log('[DASHBOARD] Fetching URL:', url.toString());
      const res = await fetch(url.toString());
      const json = await res.json();
      
      console.log('[DASHBOARD] API response:', {
        ok: res.ok,
        status: res.status,
        data: json
      });
      
      if (!res.ok) throw new Error(json.error || 'Search failed');
      
      const studentData = json.data?.students || [];
      console.log('[DASHBOARD] Extracted studentData:', studentData.length, 'students');
      
      // Set the real student data - removed dummy data fallback
      setStudents(studentData);
      setPagination(json.data?.pagination || null);
      
      console.log('[DASHBOARD] State updated with', studentData.length, 'students');
    } catch (e: unknown) {
      console.error('[DASHBOARD] Error:', e);
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // Contact student via email
  const contactStudent = useCallback(async (student: StudentRow) => {
    const subject = encodeURIComponent(`Opportunity from ${student.university || 'Our Company'}`);
    const body = encodeURIComponent(`Hi ${student.name},\n\nI came across your profile and verified certifications on CampusSync. I'd like to discuss potential opportunities.\n\nBest regards`);
    window.open(`mailto:${student.email}?subject=${subject}&body=${body}`);
    
    // Optimistically update UI
    setContactedStudents(prev => new Set(prev).add(student.id));
    
    // Persist to database and log contact
    try {
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
        console.log('✅ Contact logged successfully');
      }
      
      // Refresh analytics to show updated contacted count
      fetchAnalytics();
    } catch (err) {
      console.error('Failed to log contact:', err);
    }
  }, [fetchAnalytics]);
  
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
      console.error('Failed to fetch contact history:', err);
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
      
      // Refresh history
      if (selectedStudentForHistory) {
        viewContactHistory(selectedStudentForHistory);
      }
      
      // Refresh analytics
      fetchAnalytics();
    } catch (err) {
      console.error('Failed to update contact response:', err);
    }
  }, [selectedStudentForHistory, viewContactHistory, fetchAnalytics]);

  // Toggle favorite
  const toggleFavorite = useCallback(async (studentId: string) => {
    const isFavorite = favorites.has(studentId);
    
    // Optimistically update UI
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (isFavorite) {
        newFavorites.delete(studentId);
      } else {
        newFavorites.add(studentId);
      }
      return newFavorites;
    });
    
    // Persist to database
    try {
      if (isFavorite) {
        // Remove from favorites
        await fetch(`/api/recruiter/favorites?studentId=${studentId}`, {
          method: 'DELETE'
        });
      } else {
        // Add to favorites
        await fetch('/api/recruiter/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId })
        });
      }
    } catch (err) {
      console.error('Failed to update favorite:', err);
      // Revert on error
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
    // Skip 'none' stage
    if (stage === 'none') return;
    
    // Optimistically update UI
    setPipelineStages(prev => ({ ...prev, [studentId]: stage }));
    
    // Persist to database
    try {
      await fetch('/api/recruiter/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, stage })
      });
      
      // Refresh analytics
      fetchAnalytics();
    } catch (err) {
      console.error('Failed to update pipeline:', err);
    }
  }, [fetchAnalytics]);

  // Load data on mount
  useEffect(() => {
    loadPersistedData(); // Load favorites, pipeline, contacts
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
      // Export selected students as PDF
      exportStudentsPDF(selectedStudents);
    } else if (action === 'contact') {
      // Open email client for multiple students
      const selectedEmails = students
        .filter(s => selectedStudents.includes(s.id))
        .map(s => s.email)
        .join(',');
      window.open(`mailto:${selectedEmails}`);
      
      // Mark all as contacted
      setContactedStudents(prev => {
        const newSet = new Set(prev);
        selectedStudents.forEach(id => newSet.add(id));
        return newSet;
      });
    } else if (action === 'favorite') {
      // Add all to favorites
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
      // Dynamically import jsPDF
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      
      const selectedStudentsList = students.filter(s => studentIds.includes(s.id));
      
      if (selectedStudentsList.length === 0) {
        alert('No students selected for export');
        return;
      }

      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(18);
      doc.setTextColor(79, 70, 229); // Indigo
      doc.text('Student Talent Report', 14, 20);
      
      // Metadata
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
      doc.text(`Total Students: ${selectedStudentsList.length}`, 14, 33);
      
      // Table data
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
      
      // Add table
      autoTable(doc, {
        startY: 40,
        head: [['Name', 'University', 'Major', 'Grad Year', 'Verified Certs', 'Stage', 'Favorite']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] }, // Indigo
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
      
      // Save PDF
      const filename = `talent_report_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      alert(`✅ Exported ${selectedStudentsList.length} student(s) to PDF`);
      
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    }
  };

  // Get verification status icon
  const getVerificationStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  // Get confidence color
  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Recruiter Dashboard</h1>
              <p className="mt-2 text-gray-600">Find and manage talented students</p>
            </div>
            <div className="flex items-center space-x-4">
              <LogoutButton variant="danger" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Analytics Cards - Recruiter Metrics */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Talent Pool</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.total_students || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Mail className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Contacted</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.contacted_students || 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Engagement Rate</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analytics.engagement_rate || 0}%
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Response Rate</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analytics.response_rate || 0}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search students by name, skills, or university..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </button>
                <button
                  onClick={searchStudents}
                  disabled={loading}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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

            {/* Advanced Filters */}
            {showFilters && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">University</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
                      <option>All Universities</option>
                      <option>Stanford University</option>
                      <option>MIT</option>
                      <option>Harvard University</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Graduation Year</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
                      <option>All Years</option>
                      <option>2024</option>
                      <option>2025</option>
                      <option>2026</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
                    <input
                      type="text"
                      placeholder="e.g., Python, React"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bulk Actions - Recruiter Specific */}
        {selectedStudents.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-indigo-800 font-medium">
                {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkAction('contact')}
                  className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 flex items-center"
                >
                  <Mail className="w-4 h-4 mr-1" />
                  Contact All
                </button>
                <button
                  onClick={() => handleBulkAction('favorite')}
                  className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                >
                  Add to Favorites
                </button>
                <button
                  onClick={() => handleBulkAction('export')}
                  className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
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
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white shadow' : ''}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-white shadow' : ''}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <span className="text-sm text-gray-600">
              {students.length} student{students.length !== 1 ? 's' : ''} found
            </span>
          </div>
        </div>

        {/* Students Grid/List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading students...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800">{error}</p>
          </div>
        ) : students.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-12 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
            <p className="text-gray-600">Try adjusting your search criteria or filters.</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' 
            : 'space-y-4'
          }>
            {students.map((student) => (
              <div
                key={student.id}
                className={`bg-white rounded-lg shadow hover:shadow-lg transition-shadow ${
                  viewMode === 'list' ? 'p-6' : 'p-6'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={() => handleStudentSelect(student.id)}
                      className="mr-3 h-4 w-4 text-blue-600 rounded"
                    />
                    <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-lg font-medium text-blue-600">
                        {student.name ? student.name.split(' ').map(n => n[0]).join('') : 'U'}
                      </span>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900">{student.name || 'Unknown Student'}</h3>
                      <p className="text-sm text-gray-600">{student.university || 'Unknown University'}</p>
                      <p className="text-xs text-gray-500">{student.major || 'Unknown'} • Class of {student.graduation_year || 'Unknown'}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => toggleFavorite(student.id)}
                      className={`p-2 ${favorites.has(student.id) ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-500`}
                      title={favorites.has(student.id) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className={`w-4 h-4 ${favorites.has(student.id) ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={() => contactStudent(student)}
                      className="p-2 text-gray-400 hover:text-purple-600"
                      title="Contact Student"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => window.open(`/recruiter/student/${student.id}`, '_blank')}
                      className="p-2 text-gray-400 hover:text-indigo-600"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Pipeline Stage Indicator */}
                {pipelineStages[student.id] && (
                  <div className="mb-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      pipelineStages[student.id] === 'shortlisted' ? 'bg-blue-100 text-blue-800' :
                      pipelineStages[student.id] === 'contacted' ? 'bg-purple-100 text-purple-800' :
                      pipelineStages[student.id] === 'interviewed' ? 'bg-yellow-100 text-yellow-800' :
                      pipelineStages[student.id] === 'offered' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {pipelineStages[student.id].charAt(0).toUpperCase() + pipelineStages[student.id].slice(1)}
                    </span>
                  </div>
                )}

                {/* Skills */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">SKILLS</p>
                  <div className="flex flex-wrap gap-1">
                    {student.skills.slice(0, 5).map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        {skill}
                      </span>
                    ))}
                    {student.skills.length > 5 && (
                      <span className="text-xs text-gray-500">
                        +{student.skills.length - 5} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Student Info */}
                <div className="mb-4 space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="font-medium mr-2">GPA:</span>
                    <span>{student.gpa || 'N/A'}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span className="font-medium mr-2">Location:</span>
                    <span>{student.location || 'N/A'}</span>
                  </div>
                </div>

                {/* Certifications Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 font-medium">Verified Certifications</span>
                    <span className="font-bold text-green-600">
                      {student.verified_count}/{student.total_certifications}
                    </span>
                  </div>
                  {student.certifications.slice(0, 2).map((cert) => (
                    <div key={cert.id} className="p-2 bg-gray-50 rounded border border-gray-200">
                      <div className="flex items-start space-x-2">
                        {getVerificationStatusIcon(cert.verification_status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{cert.title}</p>
                          <p className="text-xs text-gray-500">{cert.issuer}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded font-medium ${getConfidenceColor(cert.confidence_score)}`}>
                          {Math.round(cert.confidence_score * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                  {student.certifications.length > 2 && (
                    <p className="text-xs text-gray-500 text-center">
                      +{student.certifications.length - 2} more certificates
                    </p>
                  )}
                </div>

                {/* Pipeline Management */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-2">PIPELINE STAGE</p>
                  <select
                    value={pipelineStages[student.id] || 'none'}
                    onChange={(e) => updatePipelineStage(student.id, e.target.value as PipelineStage)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="none">No Stage</option>
                    <option value="shortlisted">📋 Shortlisted</option>
                    <option value="contacted">📧 Contacted</option>
                    <option value="interviewed">🎤 Interviewed</option>
                    <option value="offered">🎉 Offered</option>
                    <option value="rejected">❌ Rejected</option>
                  </select>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => contactStudent(student)}
                      className="flex items-center justify-center text-sm text-white bg-purple-600 hover:bg-purple-700 px-2 py-2 rounded-lg transition-colors"
                      title="Send email"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => viewContactHistory(student)}
                      className="flex items-center justify-center text-sm text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2 py-2 rounded-lg transition-colors"
                      title="View contact history"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => window.open(`/recruiter/student/${student.id}`, '_blank')}
                      className="flex items-center justify-center text-sm text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-2 rounded-lg transition-colors"
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
            <div className="flex space-x-2">
              <button
                disabled={pagination.offset <= 0}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-gray-600">
                Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
              </span>
              <button
                disabled={!pagination.has_more}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Contact History Modal */}
      {showContactHistory && selectedStudentForHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{selectedStudentForHistory.name}</h2>
                  <p className="text-purple-100 text-sm">{selectedStudentForHistory.email}</p>
                </div>
                <button
                  onClick={() => setShowContactHistory(false)}
                  className="text-white hover:text-gray-200 transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-purple-600" />
                Contact History
              </h3>
              
              {contactHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No contact history yet</p>
                  <p className="text-sm mt-1">Click &quot;Contact&quot; to send your first email</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contactHistory.map((contact) => (
                    <div key={contact.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Mail className="w-4 h-4 text-purple-600" />
                          <span className="font-medium text-gray-900 capitalize">{contact.method}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(contact.contacted_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {contact.response_received ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                              ✓ Responded
                            </span>
                          ) : (
                            <button
                              onClick={() => markContactResponse(contact.id, true)}
                              className="text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-2 py-1 rounded-full font-medium transition-colors"
                            >
                              Mark as Responded
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {contact.notes && (
                        <p className="text-sm text-gray-600 ml-6">{contact.notes}</p>
                      )}
                      
                      {contact.response_received && contact.response_at && (
                        <p className="text-xs text-green-600 ml-6 mt-1">
                          Responded on {new Date(contact.response_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
              <p className="text-sm text-gray-600">
                Total Contacts: <span className="font-semibold">{contactHistory.length}</span>
                {contactHistory.length > 0 && (
                  <>
                    {' '} | Responses: <span className="font-semibold text-green-600">
                      {contactHistory.filter(c => c.response_received).length}
                    </span>
                  </>
                )}
              </p>
              <button
                onClick={() => contactStudent(selectedStudentForHistory)}
                className="flex items-center text-sm text-white bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send New Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}