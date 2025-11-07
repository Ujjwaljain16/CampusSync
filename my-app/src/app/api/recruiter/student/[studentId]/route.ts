import { NextRequest } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const userWithRole = await getServerUserWithRole();
  
  // Check if user is recruiter or admin
  if (!userWithRole) {
    throw apiError.unauthorized();
  }
  
  const { user, role } = userWithRole;
  
  if (role !== 'recruiter' && role !== 'admin') {
    throw apiError.unauthorized();
  }

  const { studentId } = await params;
  
  // Get requested organization from header
  const requestedOrgId = getRequestedOrgId(request);
  
  // Get organization context for multi-tenancy (handles recruiter multi-org)
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  
  // Get target org IDs
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  // Use admin client to bypass RLS policies
  const supabase = await createSupabaseAdminClient();

  // Get student profile (must belong to recruiter's accessible organizations)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', studentId)
    .in('organization_id', targetOrgIds) // Multi-org filter for recruiter access
    .single();

    if (profileError || !profile) {
      throw apiError.notFound('Student not found');
    }

    // If profile.university is missing, try to infer it from the student's email domain
    // by matching against organizations' allowed_email_domains (multi-org-aware).
    let inferredUniversity: string | null = profile.university || null;
    if (!inferredUniversity) {
      try {
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name, settings')
          .in('id', targetOrgIds);

        const orgDomainToName = new Map<string, string>();
        (orgs || []).forEach((o: unknown) => {
          try {
            const orgRec = o as Record<string, unknown>;
            const settings = (orgRec?.settings as Record<string, unknown>) || {};
            const domains = Array.isArray(settings?.allowed_email_domains)
              ? (settings.allowed_email_domains as string[])
              : [];
            domains.forEach((d: string) => {
              if (typeof d === 'string' && d.length) {
                const orgName = typeof orgRec.name === 'string' ? String(orgRec.name) : '';
                orgDomainToName.set(d.toLowerCase(), orgName);
              }
            });
          } catch {
            // ignore malformed org settings
          }
        });

        const email = (profile.email || '').toLowerCase();
        const domain = email.split('@')[1] || '';
        if (domain) {
          // Exact match
          if (orgDomainToName.has(domain)) {
            inferredUniversity = orgDomainToName.get(domain) || null;
          } else {
            // Try subdomain match: e.g., student@dept.uni.edu should match uni.edu
            for (const [d, name] of orgDomainToName.entries()) {
              if (domain === d || domain.endsWith('.' + d)) {
                inferredUniversity = name;
                break;
              }
            }
          }
        }
      } catch (e) {
        // If org lookup fails, leave inferredUniversity as null
        console.error('Error inferring university from email domain', e);
      }
    }

    // Get student's certificates (filtered by accessible organizations)
    const { data: certificates, error: certError } = await supabase
      .from('certificates')
      .select(`
        id,
        title,
        institution,
        date_issued,
        verification_status,
        confidence_score,
        verification_method,
        description,
        file_url,
        qr_code_data,
        digital_signature,
        issuer_verified
      `)
      .eq('student_id', studentId)
      .in('organization_id', targetOrgIds) // Multi-org filter for recruiter access
      .order('created_at', { ascending: false });

    if (certError) {
      console.error('Error fetching certificates:', certError);
      throw apiError.internal('Failed to fetch certificates');
    }

    // Process certificates
    interface CertificateData { id: string; title: string; institution: string; date_issued: string; verification_status: string; confidence_score?: number; verification_method?: string; description?: string; file_url?: string; qr_code_data?: string; digital_signature?: string; issuer_verified?: boolean; }
    
    const processedCertificates = certificates?.map((cert: CertificateData) => {
      const aiConfidence = typeof cert.confidence_score === 'number' && !isNaN(cert.confidence_score) ? cert.confidence_score : 0;

      return {
        id: cert.id,
        title: cert.title,
        issuer: cert.institution,
        // frontend expects `issue_date` property
        issue_date: cert.date_issued || null,
        verification_status: cert.verification_status,
        // keep numeric confidence_score for backward compat
        confidence_score: aiConfidence,
        skills: [], // Extract from title/institution or from a skills table
        verification_method: cert.verification_method || 'Unknown',
        description: cert.description,
        // frontend expects `certificate_url` when downloading
        certificate_url: cert.file_url || null,
        verification_details: {
          qr_verified: !!cert.qr_code_data,
          // best-effort mappings; if data not present, default to false
          logo_verified: !!((cert as unknown as Record<string, unknown>)['logo_verified']) || false,
          template_verified: !!((cert as unknown as Record<string, unknown>)['template_verified']) || false,
          // AI confidence used by frontend as a fractional value (0-1)
          ai_confidence: aiConfidence
        }
      };
    }) || [];

    // Calculate stats
  const verifiedCount = processedCertificates.filter((cert: { verification_status: string }) => cert.verification_status === 'verified').length;
  const totalCertifications = processedCertificates.length;

    // Extract skills from certificates (basic implementation)
    const skillsSet = new Set<string>();
    processedCertificates.forEach((cert: { title: string; institution?: string }) => {
      // Simple skill extraction - in production, you'd have a proper skills table
      const title = cert.title.toLowerCase();
      const institution = cert.institution?.toLowerCase() || '';
      
      const commonSkills = [
        'python', 'javascript', 'java', 'react', 'node.js', 'aws', 'docker', 'kubernetes',
        'machine learning', 'data science', 'ai', 'blockchain', 'cybersecurity',
        'frontend', 'backend', 'full stack', 'mobile', 'ios', 'android', 'typescript',
        'vue.js', 'angular', 'spring boot', 'express', 'mongodb', 'postgresql', 'mysql'
      ];
      
      commonSkills.forEach(skill => {
        if (title.includes(skill) || institution.includes(skill)) {
          skillsSet.add(skill);
        }
      });
    });

    const student = {
      id: profile.id,
      name: profile.full_name || profile.name || 'Unknown Student',
      email: profile.email,
  university: inferredUniversity || profile.university || null,
      graduation_year: profile.graduation_year,
      major: profile.major,
      gpa: profile.gpa,
      location: profile.location,
      phone: profile.phone,
      linkedin: profile.linkedin,
      github: profile.github,
      portfolio: profile.portfolio,
      skills: Array.from(skillsSet),
      certifications: processedCertificates,
      verified_count: verifiedCount,
      total_certifications: totalCertifications,
      // use issue_date (frontend expects issue_date) for last_activity if available
      last_activity: processedCertificates[0]?.issue_date || profile.created_at,
      created_at: profile.created_at
    };

  return success(student);
}
