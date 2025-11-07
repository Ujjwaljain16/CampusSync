import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';
import { Certificate } from '@/types/index';
import { logger } from '@/lib/logger';
import { getBaseUrl } from '@/lib/envValidator';

// Hybrid approach: Profile-first with certificate filtering
export async function GET(req: NextRequest) {
  try {
    const userWithRole = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!userWithRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { user, role } = userWithRole;
    
    if (role !== 'recruiter' && role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get organization context for multi-tenancy
    const requestedOrgId = getRequestedOrgId(req);
    const orgContext = await getOrganizationContext(user, requestedOrgId);
    const targetOrgIds = getTargetOrganizationIds(orgContext);
    
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const skill = searchParams.get('skill') || '';
    const certification = searchParams.get('certification') || '';
    const institution = searchParams.get('institution') || '';
    const hasCertificates = searchParams.get('has_certificates') === 'true'; // NEW: filter toggle
    const minGpa = parseFloat(searchParams.get('min_gpa') || '0');
    const graduationYear = searchParams.get('graduation_year') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    logger.debug('[SEARCH-STUDENTS] Starting hybrid search', { 
      query, skill, certification, institution, hasCertificates, minGpa, graduationYear, limit, offset 
    });

    const adminSupabase = await createSupabaseAdminClient(); // For bypassing RLS

    // ========================================================================
    // STEP 1: Get ALL approved students from accessible organizations (Profile-First!)
    // ========================================================================
    logger.debug('[SEARCH-STUDENTS] Step 1: Fetching students from orgs', { targetOrgIds });

    let profileQuery = adminSupabase
      .from('profiles')
      .select('id, full_name, email, university, graduation_year, major, gpa, location, organization_id, created_at')
      .in('organization_id', targetOrgIds);

    // Apply profile-based search filters
    if (query) {
      profileQuery = profileQuery.or(`full_name.ilike.%${query}%,email.ilike.%${query}%,major.ilike.%${query}%`);
    }

    if (minGpa > 0) {
      profileQuery = profileQuery.gte('gpa', minGpa);
    }

    if (graduationYear) {
      profileQuery = profileQuery.eq('graduation_year', parseInt(graduationYear));
    }

    if (institution) {
      profileQuery = profileQuery.ilike('university', `%${institution}%`);
    }

    const { data: allProfiles, error: profilesError } = await profileQuery;

    if (profilesError) {
      logger.error('[SEARCH-STUDENTS] Profile query error', profilesError);
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
    }

    logger.debug('[SEARCH-STUDENTS] Profiles found', { count: allProfiles?.length || 0 });

    if (!allProfiles || allProfiles.length === 0) {
      logger.debug('[SEARCH-STUDENTS] No profiles found, returning empty');
      return NextResponse.json({
        data: {
          students: [],
          pagination: { total: 0, limit, offset, has_more: false },
          filters: { query, skill, certification, institution, has_certificates: hasCertificates }
        }
      });
    }

    // ========================================================================
    // STEP 2: Filter for approved students only
    // ========================================================================
    const allUserIds = allProfiles.map((p: { id: string }) => p.id);
    logger.debug('[SEARCH-STUDENTS] Step 2: Checking user roles', { userCount: allUserIds.length });

    const { data: userRoles, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('user_id, role, approval_status, organization_id')
      .in('user_id', allUserIds)
      .eq('role', 'student')
      .eq('approval_status', 'approved');

    if (roleError) {
      logger.error('[SEARCH-STUDENTS] Role query error', roleError);
      return NextResponse.json({ error: 'Failed to filter students' }, { status: 500 });
    }

    const approvedStudentIds = new Set(userRoles?.map((ur: { user_id: string }) => ur.user_id) || []);
    const approvedProfiles = allProfiles.filter((p: { id: string }) => approvedStudentIds.has(p.id));
    logger.debug('[SEARCH-STUDENTS] Approved students', { count: approvedProfiles.length });

    // ========================================================================
    // STEP 3: Fetch certificates for these students (optional enhancement)
    // ========================================================================
    logger.debug('[SEARCH-STUDENTS] Step 3: Fetching certificates');

    let certQuery = adminSupabase
      .from('certificates')
      .select('id, title, institution, date_issued, verification_status, student_id')
      .in('student_id', Array.from(approvedStudentIds))
      .eq('verification_status', 'verified')
      .in('organization_id', targetOrgIds);

    // Apply certificate-based skill filters if provided
    if (skill) {
      certQuery = certQuery.ilike('title', `%${skill}%`);
    }

    if (certification) {
      certQuery = certQuery.ilike('title', `%${certification}%`);
    }

    const { data: certificates, error: certError } = await certQuery;

    if (certError) {
      logger.error('[SEARCH-STUDENTS] Certificate query error', certError);
    }

    logger.debug('[SEARCH-STUDENTS] Certificates found', { count: certificates?.length || 0 });

    // ========================================================================
    // STEP 4: Build certificate map for each student
    // ========================================================================
    const certificatesByStudent = new Map<string, Array<{ id: string; title: string; institution: string; date_issued: string; verification_status: string; student_id: string; [key: string]: unknown }>>();
    
    certificates?.forEach((cert: { student_id: string; [key: string]: unknown }) => {
      if (!certificatesByStudent.has(cert.student_id)) {
        certificatesByStudent.set(cert.student_id, []);
      }
      certificatesByStudent.get(cert.student_id)?.push(cert as { id: string; title: string; institution: string; date_issued: string; verification_status: string; student_id: string; [key: string]: unknown });
    });

    // ========================================================================
    // STEP 5: Apply has_certificates filter if enabled
    // ========================================================================
    let filteredProfiles = approvedProfiles;

    if (hasCertificates) {
      filteredProfiles = approvedProfiles.filter((p: { id: string }) => certificatesByStudent.has(p.id));
      logger.debug('[SEARCH-STUDENTS] After has_certificates filter', { count: filteredProfiles.length });
    }

    // If skill/certification filter is applied, only show students with matching certificates
    if (skill || certification) {
      const studentsWithMatchingCerts = new Set(certificates?.map((c: { student_id: string }) => c.student_id) || []);
      filteredProfiles = filteredProfiles.filter((p: { id: string }) => studentsWithMatchingCerts.has(p.id));
      logger.debug('[SEARCH-STUDENTS] After skill/cert filter', { count: filteredProfiles.length });
    }

    // ========================================================================
    // STEP 6: Pagination
    // ========================================================================
    const totalCount = filteredProfiles.length;
    const paginatedProfiles = filteredProfiles.slice(offset, offset + limit);
    
    logger.debug('[SEARCH-STUDENTS] Pagination', { total: totalCount, offset, limit, returned: paginatedProfiles.length });

    // ========================================================================
    // STEP 7: Build final student response with certificates
    // ========================================================================
    logger.debug('[SEARCH-STUDENTS] Step 7: Building student response');

    interface ProfileType { id: string; full_name?: string; email?: string; university?: string; graduation_year?: number; major?: string; gpa?: number; location?: string; created_at?: string; }
    interface CertType { id: string; title: string; institution: string; date_issued: string; verification_status: string; student_id: string; }

    // Build a map of allowed domains -> organization name so we can infer university from email when profile.university is empty
    const orgDomainToName = new Map<string, string>();
    try {
      const { data: allOrgs } = await adminSupabase
        .from('organizations')
        .select('id, name, slug, settings')
        .eq('is_active', true);

      (allOrgs || []).forEach((org: Record<string, unknown>) => {
        const settings = org && typeof org === 'object' && 'settings' in org ? (org as Record<string, unknown>).settings : undefined;
        const domains: string[] = (settings && typeof settings === 'object' && 'allowed_email_domains' in (settings as Record<string, unknown>))
          ? ((settings as Record<string, unknown>).allowed_email_domains as string[])
          : [];
        const orgName = typeof (org as Record<string, unknown>).name === 'string' ? (org as Record<string, unknown>).name : String((org as Record<string, unknown>).name || '');
        if (Array.isArray(domains)) {
          domains.forEach(d => {
            const norm = String(d).toLowerCase().trim();
            if (norm.startsWith('*.')) {
              orgDomainToName.set(String(norm.substring(2)), String(orgName));
            } else {
              orgDomainToName.set(String(norm), String(orgName));
            }
          });
        }
      });
    } catch (e) {
      // non-fatal
      console.warn('[SEARCH-STUDENTS] Could not build organization domain map', e);
    }

    const students = paginatedProfiles.map((profile: ProfileType) => {
      const studentCerts = certificatesByStudent.get(profile.id) || [];

      // Extract skills from certificates
      const skills = new Set<string>();
      studentCerts.forEach((cert: CertType) => {
        const title = (cert.title || '').toLowerCase();
        if (title.includes('python')) skills.add('Python');
        if (title.includes('javascript')) skills.add('JavaScript');
        if (title.includes('react')) skills.add('React');
        if (title.includes('node')) skills.add('Node.js');
        if (title.includes('machine learning')) skills.add('Machine Learning');
        if (title.includes('data science')) skills.add('Data Science');
        if (title.includes('web development')) skills.add('Web Development');
        if (title.includes('mobile')) skills.add('Mobile Development');
        if (title.includes('cloud')) skills.add('Cloud Computing');
        if (title.includes('aws')) skills.add('AWS');
        if (title.includes('docker')) skills.add('Docker');
        if (title.includes('kubernetes')) skills.add('Kubernetes');
      });

      // Derive university: prefer profile.university, then try domain-based mapping, otherwise fall back to 'Unknown University'
      let university = profile.university || '';
      if (!university && profile.email) {
        const emailDomain = (profile.email.split('@').pop() || '').toLowerCase();
        if (emailDomain) {
          const direct = orgDomainToName.get(emailDomain);
          if (direct) {
            university = direct;
          } else {
            for (const [dom, name] of orgDomainToName.entries()) {
              if (emailDomain === dom || emailDomain.endsWith('.' + dom)) {
                university = name;
                break;
              }
            }
          }
        }
      }

      return {
        id: profile.id,
        name: profile.full_name || 'Unknown Student',
        email: profile.email || `${profile.id}@example.com`,
        university: university || 'Unknown University',
        graduation_year: profile.graduation_year || new Date().getFullYear(),
        major: profile.major || 'Unknown',
        gpa: profile.gpa || 0,
        location: profile.location || 'Unknown',
        skills: Array.from(skills),
        certifications: studentCerts.map((cert: CertType) => ({
          id: cert.id,
          title: cert.title,
          issuer: cert.institution,
          issue_date: cert.date_issued,
          verification_status: cert.verification_status,
          confidence_score: 0.9,
          skills: [],
          verification_method: 'AI + Manual'
        })),
        verified_count: studentCerts.filter((c: CertType) => c.verification_status === 'verified').length,
        total_certifications: studentCerts.length,
        last_activity: studentCerts[0]?.date_issued || profile.created_at || new Date().toISOString(),
        created_at: profile.created_at || new Date().toISOString(),
        portfolio_url: `${getBaseUrl()}/public/portfolio/${profile.id}`
      };
    });

    logger.debug('[SEARCH-STUDENTS] ✅ FINAL RESULT', { 
      total: totalCount, 
      returned: students.length,
      firstStudent: students[0] ? {
        name: students[0].name,
        email: students[0].email,
        certCount: students[0].total_certifications
      } : 'NONE'
    });

    return NextResponse.json({
      data: {
        students,
        pagination: {
          total: totalCount,
          limit,
          offset,
          has_more: (offset + limit) < totalCount
        },
        filters: {
          query,
          skill,
          certification,
          institution,
          has_certificates: hasCertificates,
          min_gpa: minGpa,
          graduation_year: graduationYear
        }
      }
    });

  } catch (error) {
    console.error('Student search error:', error);
    return NextResponse.json({ 
      error: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST endpoint for advanced search with multiple criteria
export async function POST(req: NextRequest) {
  try {
    const userWithRole = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!userWithRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { user, role } = userWithRole;
    
    if (role !== 'recruiter' && role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get organization context for multi-tenancy
    const requestedOrgId = getRequestedOrgId(req);
    const orgContext = await getOrganizationContext(user, requestedOrgId);
    const targetOrgIds = getTargetOrganizationIds(orgContext);
    
    const body = await req.json().catch(() => null) as {
      skills?: string[];
      certifications?: string[];
      institutions?: string[];
      graduation_year?: number;
      min_gpa?: number;
      date_range?: {
        start: string;
        end: string;
      };
      min_certificates?: number;
      has_certificates?: boolean;
      limit?: number;
      offset?: number;
    } | null;

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const {
      skills = [],
      certifications = [],
      institutions = [],
      graduation_year,
      min_gpa = 0,
      date_range,
      min_certificates = 0,
      has_certificates = false,
      limit = 20,
      offset = 0
    } = body;

    const adminSupabase2 = await createSupabaseAdminClient();

    // Use same hybrid logic as GET endpoint
    // Get all profiles first with filters
    let profileQuery2 = adminSupabase2
      .from('profiles')
      .select('id, full_name, email, university, graduation_year, major, gpa, location, organization_id, created_at')
      .in('organization_id', targetOrgIds);

    if (institutions.length > 0) {
      const instConditions = institutions.map(inst => `university.ilike.%${inst}%`).join(',');
      profileQuery2 = profileQuery2.or(instConditions);
    }

    if (min_gpa > 0) {
      profileQuery2 = profileQuery2.gte('gpa', min_gpa);
    }

    if (graduation_year) {
      profileQuery2 = profileQuery2.eq('graduation_year', graduation_year);
    }

    const { data: allProfiles2, error: profilesError2 } = await profileQuery2;

    if (profilesError2) {
      return NextResponse.json({ error: 'Failed to search profiles' }, { status: 500 });
    }

    if (!allProfiles2 || allProfiles2.length === 0) {
      return NextResponse.json({ 
        data: {
          students: [],
          pagination: { total: 0, limit, offset, has_more: false },
          search_criteria: { skills, certifications, institutions, date_range, min_certificates, has_certificates, min_gpa, graduation_year }
        }
      });
    }

    // Filter for approved students
    const allUserIds2 = allProfiles2.map((p: { id: string }) => p.id);
    const { data: userRoles2, error: roleError2 } = await adminSupabase2
      .from('user_roles')
      .select('user_id')
      .in('user_id', allUserIds2)
      .eq('role', 'student')
      .eq('approval_status', 'approved');

    if (roleError2) {
      return NextResponse.json({ error: 'Failed to filter students' }, { status: 500 });
    }

    const approvedIds2 = new Set(userRoles2?.map((ur: { user_id: string }) => ur.user_id) || []);
    let filteredProfiles2 = allProfiles2.filter((p: { id: string }) => approvedIds2.has(p.id));

    // Fetch certificates with filters
    let certQuery2 = adminSupabase2
      .from('certificates')
      .select('id, title, institution, date_issued, verification_status, student_id')
      .in('student_id', Array.from(approvedIds2))
      .eq('verification_status', 'verified')
      .in('organization_id', targetOrgIds);

    if (skills.length > 0) {
      const skillConditions = skills.map(skill => `title.ilike.%${skill}%`).join(',');
      certQuery2 = certQuery2.or(skillConditions);
    }

    if (certifications.length > 0) {
      const certConditions = certifications.map(cert => `title.ilike.%${cert}%`).join(',');
      certQuery2 = certQuery2.or(certConditions);
    }

    if (date_range?.start && date_range?.end) {
      certQuery2 = certQuery2
        .gte('date_issued', date_range.start)
        .lte('date_issued', date_range.end);
    }

    const { data: certificates2 } = await certQuery2;

    // Build certificate map
    const certsByStudent2 = new Map();
    certificates2?.forEach((cert: { student_id: string; [key: string]: unknown }) => {
      if (!certsByStudent2.has(cert.student_id)) {
        certsByStudent2.set(cert.student_id, []);
      }
      certsByStudent2.get(cert.student_id).push(cert);
    });

    // Apply filters
    if (has_certificates || skills.length > 0 || certifications.length > 0) {
      filteredProfiles2 = filteredProfiles2.filter((p: { id: string }) => certsByStudent2.has(p.id));
    }

    if (min_certificates > 0) {
      filteredProfiles2 = filteredProfiles2.filter((p: { id: string }) => (certsByStudent2.get(p.id) || []).length >= min_certificates);
    }

    // Pagination
    const total2 = filteredProfiles2.length;
    const paginated2 = filteredProfiles2.slice(offset, offset + limit);

    // Build response
    const students2 = paginated2.map((profile: { id: string; full_name?: string; email?: string; university?: string; graduation_year?: number; major?: string; gpa?: number; location?: string; created_at?: string; }) => {
      const studentCerts2 = certsByStudent2.get(profile.id) || [];
      const skills2 = new Set<string>();
      
      studentCerts2.forEach((cert: { title: string }) => {
        const title = cert.title.toLowerCase();
        if (title.includes('python')) skills2.add('Python');
        if (title.includes('javascript')) skills2.add('JavaScript');
        if (title.includes('react')) skills2.add('React');
        if (title.includes('node')) skills2.add('Node.js');
        if (title.includes('machine learning')) skills2.add('Machine Learning');
        if (title.includes('data science')) skills2.add('Data Science');
      });

      return {
        id: profile.id,
        name: profile.full_name || 'Unknown Student',
        email: profile.email || '',
        university: profile.university || '',
        graduation_year: profile.graduation_year || 0,
        major: profile.major || '',
        gpa: profile.gpa || 0,
        location: profile.location || '',
        skills: Array.from(skills2),
        certifications: studentCerts2.map((cert: Certificate) => ({
          id: cert.id,
          title: cert.title,
          issuer: cert.institution,
          issue_date: cert.date_issued,
          verification_status: cert.verification_status,
          confidence_score: 0.9,
          skills: [],
          verification_method: 'AI + Manual'
        })),
        verified_count: studentCerts2.length,
        total_certifications: studentCerts2.length,
        last_activity: studentCerts2[0]?.date_issued || profile.created_at || new Date().toISOString(),
        created_at: profile.created_at || new Date().toISOString(),
        portfolio_url: `${getBaseUrl()}/public/portfolio/${profile.id}`
      };
    });

    return NextResponse.json({
      data: {
        students: students2,
        pagination: {
          total: total2,
          limit,
          offset,
          has_more: (offset + limit) < total2
        },
        search_criteria: {
          skills,
          certifications,
          institutions,
          date_range,
          min_certificates,
          has_certificates,
          min_gpa,
          graduation_year
        }
      }
    });

  } catch (error) {
    console.error('Advanced student search error:', error);
    return NextResponse.json({ 
      error: 'Advanced search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


