'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import LogoutButton from '@/components/LogoutButton';
import { 
  Search, Filter, Download, Users, Award, CheckCircle, Clock, XCircle, 
  Eye, Mail, ExternalLink, Building, GraduationCap, MapPin, Star,
  TrendingUp, BarChart3, FileText, RefreshCw, Plus, Settings, Grid, List
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

interface Analytics {
  total_students: number;
  verified_certifications: number;
  pending_certifications: number;
  rejected_certifications: number;
  average_confidence: number;
  top_skills: { skill: string; count: number }[];
  top_universities: { university: string; count: number }[];
  daily_activity: { date: string; count: number }[];
}

export default function RecruiterDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, boolean>>({});
  const [pagination, setPagination] = useState<{ total: number; limit: number; offset: number; has_more: boolean } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const response = await fetch('/api/recruiter/analytics');
      const data = await response.json();
      if (response.ok) {
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Search students
  const searchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/recruiter/search-students', window.location.origin);
      if (searchQuery) url.searchParams.set('q', searchQuery);
      
      const res = await fetch(url.toString());
      const json = await res.json();
      
      if (!res.ok) throw new Error(json.error || 'Search failed');
      
      const studentData = json.data?.students || [];
      
      // If no students found, show mock data for demo
      if (studentData.length === 0) {
        setStudents([
          {
            id: 'demo-student-1',
            name: 'Alex Johnson',
            email: 'alex.johnson@stanford.edu',
            university: 'Stanford University',
            graduation_year: 2024,
            major: 'Computer Science',
            gpa: 3.8,
            location: 'Palo Alto, CA',
            skills: ['Python', 'Machine Learning', 'Data Science', 'TensorFlow'],
            certifications: [
              {
                id: 'cert-1',
                title: 'Machine Learning Specialization',
                issuer: 'Stanford University',
                issue_date: '2024-01-15',
                verification_status: 'verified',
                confidence_score: 0.95,
                skills: ['Machine Learning', 'Python'],
                verification_method: 'AI + Manual'
              },
              {
                id: 'cert-2',
                title: 'Python for Data Science',
                issuer: 'Coursera',
                issue_date: '2024-02-20',
                verification_status: 'verified',
                confidence_score: 0.92,
                skills: ['Python', 'Data Science'],
                verification_method: 'AI'
              }
            ],
            verified_count: 2,
            total_certifications: 2,
            last_activity: '2024-03-15T10:30:00Z',
            created_at: '2024-01-01T00:00:00Z'
          },
          {
            id: 'demo-student-2',
            name: 'Sarah Chen',
            email: 'sarah.chen@mit.edu',
            university: 'MIT',
            graduation_year: 2024,
            major: 'Software Engineering',
            gpa: 3.9,
            location: 'Cambridge, MA',
            skills: ['React', 'JavaScript', 'Node.js', 'TypeScript'],
            certifications: [
              {
                id: 'cert-3',
                title: 'Full Stack Web Development',
                issuer: 'MIT',
                issue_date: '2024-03-10',
                verification_status: 'verified',
                confidence_score: 0.88,
                skills: ['React', 'JavaScript', 'Node.js'],
                verification_method: 'AI + Manual'
              }
            ],
            verified_count: 1,
            total_certifications: 1,
            last_activity: '2024-03-20T14:15:00Z',
            created_at: '2024-02-01T00:00:00Z'
          }
        ]);
        setPagination({ total: 2, limit: 20, offset: 0, has_more: false });
      } else {
        setStudents(studentData);
        setPagination(json.data?.pagination || null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // Bulk verify certificates
  const bulkVerify = useCallback(async (certificateIds: string[]) => {
    for (const id of certificateIds) {
      try {
        const res = await fetch('/api/recruiter/verify-certificate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificate_id: id, action: 'verify' })
        });
        const json = await res.json();
        setVerifyResult(prev => ({ ...prev, [id]: !!json?.success }));
      } catch {
        setVerifyResult(prev => ({ ...prev, [id]: false }));
      }
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    fetchAnalytics();
    searchStudents();
  }, [fetchAnalytics, searchStudents]);

  // Handle student selection
  const handleStudentSelect = (studentId: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Handle bulk actions
  const handleBulkAction = (action: 'verify' | 'export' | 'contact') => {
    if (action === 'verify') {
      const allCertIds = selectedStudents.flatMap(studentId => {
        const student = students.find(s => s.id === studentId);
        return student?.certifications.map(c => c.id) || [];
      });
      bulkVerify(allCertIds);
    } else if (action === 'export') {
      // Export selected students
      console.log('Exporting students:', selectedStudents);
    } else if (action === 'contact') {
      // Contact selected students
      console.log('Contacting students:', selectedStudents);
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
        {/* Analytics Cards */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Students</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.total_students}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Verified Certificates</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.verified_certifications}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending Review</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.pending_certifications}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Avg Confidence</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.round(analytics.average_confidence * 100)}%
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

        {/* Bulk Actions */}
        {selectedStudents.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 font-medium">
                {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkAction('verify')}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  Verify All
                </button>
                <button
                  onClick={() => handleBulkAction('export')}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Export
                </button>
                <button
                  onClick={() => handleBulkAction('contact')}
                  className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                >
                  Contact
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
                      onClick={() => window.open(`/recruiter/student/${student.id}`, '_blank')}
                      className="p-2 text-gray-400 hover:text-blue-600"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      className="p-2 text-gray-400 hover:text-green-600"
                      title="Contact"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Skills */}
                <div className="mb-4">
                  <div className="flex flex-wrap gap-1">
                    {student.skills.slice(0, 3).map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {skill}
                      </span>
                    ))}
                    {student.skills.length > 3 && (
                      <span className="text-xs text-gray-500">
                        +{student.skills.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Certifications */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Certifications</span>
                    <span className="font-medium">
                      {student.verified_count}/{student.total_certifications} verified
                    </span>
                  </div>
                  {student.certifications.slice(0, 2).map((cert) => (
                    <div key={cert.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center space-x-2">
                        {getVerificationStatusIcon(cert.verification_status)}
                        <span className="text-sm font-medium text-gray-900">{cert.title}</span>
                        <span className={`text-xs px-2 py-1 rounded ${getConfidenceColor(cert.confidence_score)}`}>
                          {Math.round(cert.confidence_score * 100)}%
                        </span>
                      </div>
                      <button
                        onClick={() => bulkVerify([cert.id])}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Verify
                      </button>
                    </div>
                  ))}
                  {student.certifications.length > 2 && (
                    <p className="text-xs text-gray-500 text-center">
                      +{student.certifications.length - 2} more certificates
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between">
                    <button
                      onClick={() => window.open(`/recruiter/student/${student.id}`, '_blank')}
                      className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View Profile
                    </button>
                    <button
                      onClick={() => bulkVerify(student.certifications.map(c => c.id))}
                      className="flex items-center text-sm text-green-600 hover:text-green-800"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Verify All
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
    </div>
  );
}