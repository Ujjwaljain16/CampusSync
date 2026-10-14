'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, CheckCircle, Award, MapPin, Calendar, Building, GraduationCap, Mail, Phone, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { safeEmail, safeHttpUrl } from '@/lib/privacy/safeUrl';

/**
 * Recruiter view of one student. The API (GET /api/recruiter/student/:id) returns
 * { data: Student }. Only VERIFIED certificates are returned; contact details and
 * GPA are present only when the student opted in (`contact_shared`).
 */
interface Student {
  id: string;
  name: string;
  email?: string;
  university: string | null;
  graduation_year: number | null;
  major: string | null;
  gpa?: number | null;
  location: string | null;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  contact_shared: boolean;
  skills: string[];
  certifications: Certification[];
  verified_count: number;
  total_certifications: number;
  last_activity: string | null;
  created_at: string | null;
}

interface Certification {
  id: string;
  title: string;
  institution: string | null;
  date_issued: string | null;
  verification_status: 'verified';
}

function ExternalLinkItem({ href, label }: { href: string | undefined; label: string }) {
  const safe = safeHttpUrl(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center text-sm text-blue-600 hover:text-blue-800"
    >
      <ExternalLink className="w-4 h-4 mr-2" />
      {label}
    </a>
  );
}

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.studentId as string;

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contacting, setContacting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchStudentDetails = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiFetch(`/api/recruiter/student/${encodeURIComponent(studentId)}`, { signal });

        if (!response.ok) {
          if (response.status === 404) throw new Error('Student not found');
          if (response.status === 401 || response.status === 403) throw new Error('You do not have access to this student');
          if (response.status === 429) throw new Error('Too many requests. Please try again in a moment.');
          throw new Error('Failed to fetch student details');
        }

        const json = await response.json();
        // API responses use the standardized { data: T } envelope
        const payload = json && typeof json === 'object' && 'data' in json ? json.data : json;
        setStudent(payload as Student);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    if (!studentId) return;
    const controller = new AbortController();
    void fetchStudentDetails(controller.signal);
    return () => controller.abort();
  }, [studentId, fetchStudentDetails]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading student details...</p>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center" role="alert">
          <div className="text-red-500 text-xl mb-4">Error</div>
          <p className="text-gray-600">{error || 'Student not found'}</p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const contactEmail = safeEmail(student.email);

  // Server-side PDF only: the endpoint enforces who may export and what is included.
  const exportProfileAsPDF = async () => {
    setExportError(null);
    try {
      const res = await apiFetch('/api/portfolio/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: student.id, includePersonalInfo: student.contact_shared }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setExportError((json && typeof json.error === 'string' && json.error) || 'Could not export this profile');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(student.name || 'student').replace(/[^\w-]+/g, '_')}_profile.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export PDF', err);
      setExportError('Could not export this profile');
    }
  };

  const contactStudent = async () => {
    if (contacting || !contactEmail) return;
    setContacting(true);
    try {
      const subject = encodeURIComponent('Opportunity to connect');
      const body = encodeURIComponent(
        `Hi ${student.name || ''},\r\n\r\nI found your profile on CampusSync and would like to discuss opportunities with you.\r\n\r\nRegards,`
      );
      window.location.assign(`mailto:${contactEmail}?subject=${subject}&body=${body}`);

      // Log contact server-side (de-duplicated server-side as well)
      await apiFetch('/api/recruiter/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          method: 'email',
          notes: `Email sent via mailto on ${new Date().toLocaleString()}`,
        }),
      });
    } catch (err) {
      console.error('Failed to log contact from student page', err);
    } finally {
      setTimeout(() => setContacting(false), 500);
    }
  };

  return (
    <div id="profile-root" className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <button onClick={() => window.history.back()} className="mr-4 p-2 text-gray-400 hover:text-gray-600" aria-label="Go back">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{student.name}</h1>
                <p className="mt-2 text-gray-600">
                  {student.university || 'University not provided'}
                  {student.graduation_year ? ` • Class of ${student.graduation_year}` : ''}
                </p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => void exportProfileAsPDF()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Profile
              </button>
              <button
                onClick={() => void contactStudent()}
                disabled={contacting || !contactEmail}
                aria-busy={contacting}
                title={contactEmail ? 'Contact student by email' : 'This student has not shared contact details'}
                className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  contacting || !contactEmail ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Mail className="w-4 h-4 mr-2" />
                {contacting ? 'Contacting...' : contactEmail ? 'Contact Student' : 'Contact not shared'}
              </button>
            </div>
          </div>
          {exportError && (
            <p role="alert" className="pb-4 text-sm text-red-600">
              {exportError}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Student Info */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <div className="flex items-center mb-6">
                <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-2xl font-medium text-blue-600">
                    {student.name?.split(' ').map((n) => n[0]).join('') || 'ST'}
                  </span>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">{student.name || 'Unknown Student'}</h3>
                  <p className="text-sm text-gray-500">{student.major || 'N/A'}</p>
                  {student.university && (
                    <p className="text-sm text-gray-500 mt-1 flex items-center">
                      <Building className="w-4 h-4 mr-2 text-gray-400" />
                      <span>{student.university}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {contactEmail ? (
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="w-4 h-4 mr-3" />
                    {contactEmail}
                  </div>
                ) : (
                  <div className="flex items-center text-sm text-gray-500">
                    <Mail className="w-4 h-4 mr-3" />
                    Contact details not shared by the student
                  </div>
                )}
                {student.graduation_year && (
                  <div className="flex items-center text-sm text-gray-600">
                    <GraduationCap className="w-4 h-4 mr-3" />
                    Class of {student.graduation_year}
                  </div>
                )}
                {student.location && (
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="w-4 h-4 mr-3" />
                    {student.location}
                  </div>
                )}
                {typeof student.gpa === 'number' && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Award className="w-4 h-4 mr-3" />
                    GPA: {student.gpa}
                  </div>
                )}
                {student.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="w-4 h-4 mr-3" />
                    {student.phone}
                  </div>
                )}
              </div>

              {(safeHttpUrl(student.linkedin) || safeHttpUrl(student.github) || safeHttpUrl(student.portfolio)) && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Links</h4>
                  <div className="space-y-2">
                    <ExternalLinkItem href={student.linkedin} label="LinkedIn" />
                    <ExternalLinkItem href={student.github} label="GitHub" />
                    <ExternalLinkItem href={student.portfolio} label="Portfolio" />
                  </div>
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {(student.skills ?? []).map((skill) => (
                  <span key={skill} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {skill}
                  </span>
                ))}
                {(student.skills ?? []).length === 0 && <p className="text-sm text-gray-500">No skills derived yet</p>}
              </div>
            </div>
          </div>

          {/* Certifications */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Verified certifications ({student.verified_count})</h3>
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {(student.certifications ?? []).length === 0 && (
                  <p className="p-6 text-sm text-gray-500">This student has no verified certifications yet.</p>
                )}
                {(student.certifications ?? []).map((cert) => (
                  <div key={cert.id} className="p-6">
                    <div className="flex items-center mb-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <h4 className="ml-2 text-lg font-medium text-gray-900">{cert.title}</h4>
                      <span className="ml-3 text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-semibold">Verified</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <div className="flex items-center">
                        <Building className="w-4 h-4 mr-1" />
                        {cert.institution || 'Institution not provided'}
                      </div>
                      <div className="flex items-center mt-1">
                        <Calendar className="w-4 h-4 mr-1" />
                        Issued: {cert.date_issued && !Number.isNaN(Date.parse(cert.date_issued)) ? new Date(cert.date_issued).toLocaleDateString() : 'Not available'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
