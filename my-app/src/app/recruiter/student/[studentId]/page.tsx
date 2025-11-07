'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, CheckCircle, XCircle, Clock, Award, MapPin, Calendar, Building, GraduationCap, Mail, Phone, ExternalLink } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  email: string;
  university: string;
  graduation_year: number;
  major: string;
  gpa: number;
  location: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
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
  issue_date?: string | null;
  verification_status: 'verified' | 'pending' | 'rejected';
  confidence_score: number;
  skills: string[];
  verification_method: string;
  description?: string;
  certificate_url?: string;
  verification_details?: {
    qr_verified: boolean;
    logo_verified: boolean;
    template_verified: boolean;
    ai_confidence: number;
  };
}

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.studentId as string;
  
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contacting, setContacting] = useState(false);

  useEffect(() => {
    if (studentId) {
      fetchStudentDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]); // fetchStudentDetails is stable and only depends on studentId which is in deps

  const fetchStudentDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/recruiter/student/${studentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch student details');
      }
      
      const json = await response.json();
      // API responses use the standardized { data: T } envelope
      // unwrap if present, otherwise fall back to the raw body
      const payload = json && typeof json === 'object' && 'data' in json ? json.data : json;
      setStudent(payload as Student);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCertificate = async (certificateId: string) => {
    try {
      const response = await fetch('/api/recruiter/verify-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          certificate_id: certificateId,
          action: 'verify'
        })
      });

      if (response.ok) {
        // Refresh student data
        fetchStudentDetails();
      }
    } catch (err) {
      console.error('Error verifying certificate:', err);
    }
  };

  const handleRejectCertificate = async (certificateId: string) => {
    try {
      const response = await fetch('/api/recruiter/verify-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          certificate_id: certificateId,
          action: 'reject'
        })
      });

      if (response.ok) {
        // Refresh student data
        fetchStudentDetails();
      }
    } catch (err) {
      console.error('Error rejecting certificate:', err);
    }
  };

  const handleDownloadCertificate = (certificate: Certification) => {
    if (certificate.certificate_url) {
      window.open(certificate.certificate_url, '_blank');
    } else {
      // Generate download link or show message
      console.log('Certificate download not available');
    }
  };

  const getVerificationStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading student details...</p>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
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

  // (removed unused loadScript helper; using dynamic imports instead)
  // Prefer server-side PDF export for robustness; fall back to client-side html2canvas
  // if the server route isn't available.
  const exportProfileAsPDF = async () => {
    if (typeof window === 'undefined') return;

    // First try the server-side PDF endpoint (more reliable, avoids CSS parsing issues)
    try {
      const res = await fetch('/api/portfolio/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: student?.id, includePersonalInfo: true })
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/pdf')) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(student?.name || 'student').replace(/\s+/g, '_')}_profile.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return;
        }
      }
    } catch (err) {
      console.warn('Server-side PDF export failed or unavailable, falling back to client-side export:', err);
    }

    // Client-side fallback using html2canvas + jsPDF
    try {
      const html2canvasModule = await import('html2canvas');
      const jspdfModule = await import('jspdf');
      type Html2CanvasFn = (el: Element, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
      const html2canvasFn = ((html2canvasModule as unknown) as { default?: Html2CanvasFn }).default ?? ((html2canvasModule as unknown) as Html2CanvasFn);
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const jsPDF = (jspdfModule as unknown as any).jsPDF ?? (jspdfModule as unknown as any).default ?? (jspdfModule as unknown as any);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      if (!html2canvasFn || !jsPDF) throw new Error('PDF libraries not available');

      const element = document.getElementById('profile-root') || document.body;
      const canvas = await html2canvasFn(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const pdf = typeof jsPDF === 'function' ? new jsPDF('p', 'pt', 'a4') : new (jsPDF as any).jsPDF('p', 'pt', 'a4');
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgProps = { width: canvas.width, height: canvas.height };
      const ratio = imgProps.width / imgProps.height;
      const imgWidth = pageWidth;
      const imgHeight = pageWidth / ratio;

      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      position -= pageHeight;
      while (Math.abs(position) < imgHeight - pageHeight) {
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        position -= pageHeight;
      }

      const filename = `${(student?.name || 'student').replace(/\s+/g, '_')}_profile.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('Failed to export PDF (client fallback)', err);
      console.debug('PDF export failed, falling back to JSON. Error:', err);
      if (student) {
        const dataStr = JSON.stringify(student, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(student.name || 'student').replace(/\s+/g, '_')}_profile.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    }
  };

  return (
    <div id="profile-root" className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <button
                onClick={() => window.history.back()}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{student.name}</h1>
                <p className="mt-2 text-gray-600">{student.university} • Class of {student.graduation_year}</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => exportProfileAsPDF()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Profile
              </button>
              <button
                onClick={async () => {
                  if (contacting) return;
                  if (!student || !student.email) return;

                  setContacting(true);
                  try {
                    const subject = encodeURIComponent(`Opportunity to connect`);
                    const body = encodeURIComponent(`Hi ${student.name || ''},%0D%0A%0D%0AI found your profile on CampusSync and would like to discuss opportunities with you.%0D%0A%0D%0ARegards,`);
                    // open mail client once
                    window.location.href = `mailto:${student.email}?subject=${subject}&body=${body}`;

                    // Log contact server-side (debounced server-side as well)
                    await fetch('/api/recruiter/contacts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ studentId: student.id, method: 'email', notes: `Email sent via mailto on ${new Date().toLocaleString()}` })
                    });
                  } catch (err) {
                    console.error('Failed to log contact from student page', err);
                  } finally {
                    // allow again after the request completes
                    setTimeout(() => setContacting(false), 500);
                  }
                }}
                disabled={contacting}
                aria-busy={contacting}
                className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${contacting ? 'bg-blue-600/70 opacity-80 pointer-events-none' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                <Mail className="w-4 h-4 mr-2" />
                {contacting ? 'Contacting...' : 'Contact Student'}
              </button>
            </div>
          </div>
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
                    {student.name?.split(' ').map(n => n[0]).join('') || 'ST'}
                  </span>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">{student.name || 'Unknown Student'}</h3>
                    <p className="text-sm text-gray-500">{student.major || 'N/A'}</p>
                    {/* Add student's institution/university on the profile card */}
                    {student.university && (
                      <p className="text-sm text-gray-500 mt-1 flex items-center">
                        <Building className="w-4 h-4 mr-2 text-gray-400" />
                        <span>{student.university}</span>
                      </p>
                    )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center text-sm text-gray-600">
                  <Mail className="w-4 h-4 mr-3" />
                  {student.email}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Building className="w-4 h-4 mr-3" />
                  {student.university}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <GraduationCap className="w-4 h-4 mr-3" />
                  Class of {student.graduation_year}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-3" />
                  {student.location}
                </div>
                {student.gpa && (
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

              {/* Social Links */}
              {(student.linkedin || student.github || student.portfolio) && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Links</h4>
                  <div className="space-y-2">
                    {student.linkedin && (
                      <a
                        href={student.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        LinkedIn
                      </a>
                    )}
                    {student.github && (
                      <a
                        href={student.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        GitHub
                      </a>
                    )}
                    {student.portfolio && (
                      <a
                        href={student.portfolio}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Portfolio
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {(student.skills ?? []).map((skill, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Certifications */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Certifications ({student.total_certifications})
                  </h3>
                  <div className="text-sm text-gray-500">
                    {student.verified_count} verified
                  </div>
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {(student.certifications ?? []).map((cert) => {
                  const conf = typeof cert.confidence_score === 'number' && !isNaN(cert.confidence_score)
                    ? cert.confidence_score
                    : (cert.verification_details?.ai_confidence ?? 0);
                  
                  return (
                  <div key={cert.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          {getVerificationStatusIcon(cert.verification_status)}
                          <h4 className="ml-2 text-lg font-medium text-gray-900">
                            {cert.title}
                          </h4>
                          {cert.verification_status === 'verified' ? (
                            <span className="ml-3 text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-semibold">
                              Approved
                            </span>
                          ) : (
                            <span className={`ml-3 text-xs px-2 py-1 rounded-full ${getConfidenceColor(conf)}`}>
                              {Number.isFinite(conf) ? `${(conf * 100).toFixed(0)}%` : 'N/A'}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-sm text-gray-600 mb-2">
                          <div className="flex items-center">
                            <Building className="w-4 h-4 mr-1" />
                            {cert.issuer}
                          </div>
                          <div className="flex items-center mt-1">
                            <Calendar className="w-4 h-4 mr-1" />
                            Issued: {cert.issue_date ? new Date(cert.issue_date).toLocaleDateString() : 'Not available'}
                          </div>
                        </div>

                        {cert.description && (
                          <p className="text-sm text-gray-600 mb-3">{cert.description}</p>
                        )}

                        {/* Simplified verification UI: hide granular verification details and method.
                            Show only Approved badge when certificate is verified (e.g., approved by faculty). */}
                      </div>

                      <div className="ml-4 flex flex-col space-y-2">
                        {cert.verification_status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleVerifyCertificate(cert.id)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verify
                            </button>
                            <button
                              onClick={() => handleRejectCertificate(cert.id)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700"
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDownloadCertificate(cert)}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
