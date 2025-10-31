import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { Certificate } from '@/types/index';

// Fixed: Now properly handles student_id field from certificates table
export async function GET(req: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const skill = searchParams.get('skill') || '';
    const certification = searchParams.get('certification') || '';
    const institution = searchParams.get('institution') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    console.log('[SEARCH-STUDENTS] Starting search with params:', { query, skill, certification, institution, limit, offset });

    const supabase = await createSupabaseServerClient();
    const adminSupabase = createSupabaseAdminClient(); // For user_roles queries that need to bypass RLS

    // Build the search query (documents first, fallback to certificates)
    let docs: Certificate[] = [];
    try {
      let docsQuery = supabase
        .from('documents')
        .select(`
          id,
          title,
          institution,
          issue_date,
          verification_status,
          user_id:student_id,
          document_type
        `)
        .eq('verification_status', 'verified')
        .limit(limit)
        .range(offset, offset + limit - 1);

      if (query) docsQuery = docsQuery.or(`title.ilike.%${query}%,institution.ilike.%${query}%`);
      if (institution) docsQuery = docsQuery.ilike('institution', `%${institution}%`);

      const { data: d, error: dErr } = await docsQuery;
      if (!dErr && d) docs = d as unknown as Certificate[];
    } catch {}

    let certificates: Certificate[] = [];
    if (!docs || docs.length === 0) {
      let queryBuilder = supabase
        .from('certificates')
        .select(`
          id,
          title,
          institution,
          date_issued,
          verification_status,
          student_id
        `)
        .eq('verification_status', 'verified')
        .limit(limit)
        .range(offset, offset + limit - 1);

    // Apply filters
    if (query) {
      queryBuilder = queryBuilder.or(`title.ilike.%${query}%,institution.ilike.%${query}%`);
    }

    if (skill) {
      queryBuilder = queryBuilder.ilike('title', `%${skill}%`);
    }

    if (certification) {
      queryBuilder = queryBuilder.ilike('title', `%${certification}%`);
    }

    if (institution) {
      queryBuilder = queryBuilder.ilike('institution', `%${institution}%`);
    }

      const { data: certs, error: certError } = await queryBuilder;
      if (certError) {
        console.log('[SEARCH-STUDENTS] Certificate query error:', certError);
        return NextResponse.json({ error: 'Failed to search certificates' }, { status: 500 });
      }
      certificates = (certs as unknown as Certificate[]) || [];
      console.log('[SEARCH-STUDENTS] Certificates found:', certificates.length);
      if (certificates.length > 0) {
        const firstCert = certs?.[0] as { id: string; student_id?: string };
        console.log('[SEARCH-STUDENTS] First cert:', {
          id: firstCert.id,
          student_id: firstCert.student_id
        });
      }
    }

    // Get user IDs and filter for students only
    type BaseCert = { id: string; title: string; institution: string; date_issued: string; verification_status: string; student_id: string; document_type: string };
    type DocRecord = { id: string; title: string; institution: string; issue_date?: string; date_issued?: string; verification_status: string; user_id: string; document_type: string };
    type CertRecord = { id: string; title: string; institution: string; date_issued: string; verification_status: string; student_id?: string; user_id?: string };
    
    const base: BaseCert[] = (docs && docs.length > 0) ? (docs as unknown as DocRecord[]).map((d): BaseCert => ({
      id: d.id,
      title: d.title,
      institution: d.institution,
      date_issued: d.issue_date || d.date_issued || '',
      verification_status: d.verification_status,
      student_id: d.user_id, // documents table uses user_id field
      document_type: 'document',
    })) : (certificates as unknown as CertRecord[]).map((cert): BaseCert => ({
      id: cert.id,
      title: cert.title,
      institution: cert.institution,
      date_issued: cert.date_issued,
      verification_status: cert.verification_status,
      student_id: cert.student_id || cert.user_id || '',
      document_type: 'certificate'
    }));

    console.log('[SEARCH-STUDENTS] Mapped base items:', base.length);
    if (base.length > 0) {
      console.log('[SEARCH-STUDENTS] First mapped student_id:', base[0].student_id);
    }

    // If no certificates found, return empty result
    if (base.length === 0) {
      console.log('[SEARCH-STUDENTS] No base items, returning empty');

      return NextResponse.json({
        data: {
          students: [],
          pagination: {
            total: 0,
            limit,
            offset,
            has_more: false
          },
          filters: {
            query,
            skill,
            certification,
            institution
          }
        }
      });
    }

    const userIds = [...new Set(base.map(cert => cert.student_id))];
    console.log('[SEARCH-STUDENTS] Querying user_roles for', userIds.length, 'user IDs:', userIds);
    
    // Use admin client to bypass RLS policies on user_roles table
    const { data: userRoles, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds)
      .eq('role', 'student');

    console.log('[SEARCH-STUDENTS] User roles found:', userRoles?.length || 0);
    console.log('[SEARCH-STUDENTS] User roles data:', userRoles);
    console.log('[SEARCH-STUDENTS] Role error:', roleError);

    if (roleError) {
      return NextResponse.json({ error: 'Failed to filter students' }, { status: 500 });
    }

    const studentUserIds = new Set(userRoles?.map(ur => ur.user_id) || []);
    console.log('[SEARCH-STUDENTS] Student user IDs after filtering:', Array.from(studentUserIds));
    
    const studentCertificates = base.filter(cert => studentUserIds.has(cert.student_id));
    console.log('[SEARCH-STUDENTS] Student certificates after role filter:', studentCertificates.length);

    // Group certificates by user
    const userMap = new Map();
    
    studentCertificates?.forEach(cert => {
      if (!userMap.has(cert.student_id)) {
        userMap.set(cert.student_id, {
          user_id: cert.student_id,
          certificates: [],
          total_certificates: 0,
          verified_certificates: 0,
          skills: new Set(),
          institutions: new Set()
        });
      }

      const user = userMap.get(cert.student_id);
      user.certificates.push({
        id: cert.id,
        title: cert.title,
        institution: cert.institution,
        date_issued: cert.date_issued,
        verification_status: cert.verification_status
      });

      user.total_certificates++;
      if (cert.verification_status === 'verified') {
        user.verified_certificates++;
      }

      // Extract skills from certificate title
      const title = (cert.title || '').toLowerCase();
      if (title.includes('python')) user.skills.add('Python');
      if (title.includes('javascript')) user.skills.add('JavaScript');
      if (title.includes('react')) user.skills.add('React');
      if (title.includes('node')) user.skills.add('Node.js');
      if (title.includes('machine learning')) user.skills.add('Machine Learning');
      if (title.includes('data science')) user.skills.add('Data Science');
      if (title.includes('web development')) user.skills.add('Web Development');
      if (title.includes('mobile')) user.skills.add('Mobile Development');
      if (title.includes('cloud')) user.skills.add('Cloud Computing');
      if (title.includes('aws')) user.skills.add('AWS');
      if (title.includes('docker')) user.skills.add('Docker');
      if (title.includes('kubernetes')) user.skills.add('Kubernetes');

      user.institutions.add(cert.institution);
    });

    // Get profiles for these students
    const studentUserIdsArray = Array.from(userMap.keys());
    const { data: profiles, error: profilesError } = await adminSupabase
      .from('profiles')
      .select('id, full_name, role, created_at, email, university, graduation_year, major, gpa, location')
      .in('id', studentUserIdsArray);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    }

    // Create a map for quick profile lookup
    const profileMap = new Map();
    profiles?.forEach(profile => {
      profileMap.set(profile.id, profile);
    });

    // Convert to array and format response with proper structure
    console.log('[SEARCH-STUDENTS] Building student list from', userMap.size, 'users');
    console.log('[SEARCH-STUDENTS] studentUserIdsArray:', studentUserIdsArray);
    
    const students = Array.from(userMap.values()).map(user => {
      const profile = profileMap.get(user.user_id) || {
        id: user.user_id,
        full_name: 'Unknown Student',
        role: 'student',
        created_at: new Date().toISOString(),
        email: null,
        university: null,
        graduation_year: null,
        major: null,
        gpa: null,
        location: null
      };

      // Get the first certificate for basic info
      const firstCert = user.certificates[0];
      
      return {
        id: user.user_id, // Dashboard expects 'id' not 'user_id'
        name: profile.full_name || 'Unknown Student',
        email: profile.email || `${user.user_id}@example.com`, // Use real email from profile
        university: profile.university || firstCert?.institution || 'Unknown University',
        graduation_year: profile.graduation_year || (firstCert?.date_issued ? new Date(firstCert.date_issued).getFullYear() : new Date().getFullYear()),
        major: profile.major || 'Unknown',
        gpa: profile.gpa || 0,
        location: profile.location || 'Unknown',
        skills: Array.from(user.skills),
        certifications: user.certificates.map((cert: Certificate) => ({
          id: cert.id,
          title: cert.title,
          issuer: cert.institution,
          issue_date: cert.date_issued,
          verification_status: cert.verification_status,
          confidence_score: 0.9, // Default confidence
          skills: [], // Will be populated from title
          verification_method: 'AI + Manual'
        })),
        verified_count: user.verified_certificates,
        total_certifications: user.total_certificates,
        last_activity: firstCert?.date_issued || new Date().toISOString(),
        created_at: profile.created_at,
        portfolio_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/public/portfolio/${user.user_id}`
      };
    });

    // Get total count for pagination (only verified certificates from students)
    const { count: totalCount } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'verified')
      .in('student_id', Array.from(studentUserIds));

    console.log('[SEARCH-STUDENTS] ✅ FINAL RESULT:', students.length, 'students');
    console.log('[SEARCH-STUDENTS] First student:', students[0] ? {
      name: students[0].name,
      email: students[0].email,
      certCount: students[0].total_certifications
    } : 'NONE');

    return NextResponse.json({
      data: {
        students,
        pagination: {
          total: totalCount || 0,
          limit,
          offset,
          has_more: (offset + limit) < (totalCount || 0)
        },
        filters: {
          query,
          skill,
          certification,
          institution
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
    const { user, role } = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => null) as {
      skills?: string[];
      certifications?: string[];
      institutions?: string[];
      date_range?: {
        start: string;
        end: string;
      };
      min_certificates?: number;
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
      date_range,
      min_certificates = 1,
      limit = 20,
      offset = 0
    } = body;

    const supabase = await createSupabaseServerClient();

    // Build complex search query
    let queryBuilder = supabase
      .from('certificates')
      .select(`
        id,
        title,
        institution,
        date_issued,
        verification_status,
        student_id
      `)
      .eq('verification_status', 'verified')
      .limit(limit)
      .range(offset, offset + limit - 1);

    // Apply skill filters
    if (skills.length > 0) {
      const skillConditions = skills.map(skill => `title.ilike.%${skill}%`).join(',');
      queryBuilder = queryBuilder.or(skillConditions);
    }

    // Apply certification filters
    if (certifications.length > 0) {
      const certConditions = certifications.map(cert => `title.ilike.%${cert}%`).join(',');
      queryBuilder = queryBuilder.or(certConditions);
    }

    // Apply institution filters
    if (institutions.length > 0) {
      const instConditions = institutions.map(inst => `institution.ilike.%${inst}%`).join(',');
      queryBuilder = queryBuilder.or(instConditions);
    }

    // Apply date range filter
    if (date_range?.start && date_range?.end) {
      queryBuilder = queryBuilder
        .gte('date_issued', date_range.start)
        .lte('date_issued', date_range.end);
    }

    const { data: certificates, error: certError } = await queryBuilder;

    if (certError) {
      return NextResponse.json({ error: 'Failed to search certificates' }, { status: 500 });
    }

    if (!certificates || certificates.length === 0) {
      return NextResponse.json({ error: 'No certificates found' }, { status: 404 });
    }

    // Get user IDs and filter for students only
    type CertRecord = { id: string; title: string; institution: string; date_issued: string; verification_status: string; student_id: string };
    const userIds = [...new Set((certificates as unknown as CertRecord[]).map(cert => cert.student_id))];
    const adminSupabase = createSupabaseAdminClient();
    const { data: userRoles, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds)
      .eq('role', 'student');

    if (roleError) {
      return NextResponse.json({ error: 'Failed to filter students' }, { status: 500 });
    }

    const studentUserIds = new Set(userRoles?.map(ur => ur.user_id) || []);
    const studentCertificates = (certificates as unknown as CertRecord[]).filter(cert => studentUserIds.has(cert.student_id));

    // Group certificates by user and apply minimum certificate filter
    const userMap = new Map();
    
    studentCertificates?.forEach(cert => {
      if (!userMap.has(cert.student_id)) {
        userMap.set(cert.student_id, {
          user_id: cert.student_id,
          certificates: [],
          total_certificates: 0,
          verified_certificates: 0,
          skills: new Set(),
          institutions: new Set()
        });
      }

      const user = userMap.get(cert.student_id);
      user.certificates.push({
        id: cert.id,
        title: cert.title,
        institution: cert.institution,
        date_issued: cert.date_issued,
        verification_status: cert.verification_status
      });

      user.total_certificates++;
      if (cert.verification_status === 'verified') {
        user.verified_certificates++;
      }

      // Extract skills from certificate title
      const title = cert.title.toLowerCase();
      if (title.includes('python')) user.skills.add('Python');
      if (title.includes('javascript')) user.skills.add('JavaScript');
      if (title.includes('react')) user.skills.add('React');
      if (title.includes('node')) user.skills.add('Node.js');
      if (title.includes('machine learning')) user.skills.add('Machine Learning');
      if (title.includes('data science')) user.skills.add('Data Science');
      if (title.includes('web development')) user.skills.add('Web Development');
      if (title.includes('mobile')) user.skills.add('Mobile Development');
      if (title.includes('cloud')) user.skills.add('Cloud Computing');
      if (title.includes('aws')) user.skills.add('AWS');
      if (title.includes('docker')) user.skills.add('Docker');
      if (title.includes('kubernetes')) user.skills.add('Kubernetes');

      user.institutions.add(cert.institution);
    });

    // Get profiles for these students
    const studentUserIdsArray = Array.from(userMap.keys());
    const { data: profiles, error: profilesError } = await adminSupabase
      .from('profiles')
      .select('id, full_name, role, created_at, email, university, graduation_year, major, gpa, location')
      .in('id', studentUserIdsArray);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    }

    // Create a map for quick profile lookup
    const profileMap = new Map();
    profiles?.forEach(profile => {
      profileMap.set(profile.id, profile);
    });

    // Filter users by minimum certificate count and format response
    const filteredStudents = Array.from(userMap.values())
      .filter(user => user.verified_certificates >= min_certificates)
      .map(user => {
        const profile = profileMap.get(user.user_id) || {
          id: user.user_id,
          full_name: 'Unknown Student',
          role: 'student',
          created_at: new Date().toISOString(),
          email: null,
          university: null,
          graduation_year: null,
          major: null,
          gpa: null,
          location: null
        };

        // Get the first certificate for basic info
        const firstCert = user.certificates[0];
        
        return {
          id: user.user_id, // Dashboard expects 'id' not 'user_id'
          name: profile.full_name || 'Unknown Student',
          email: profile.email || `${user.user_id}@example.com`, // Use real email from profile
          university: profile.university || firstCert?.institution || 'Unknown University',
          graduation_year: profile.graduation_year || (firstCert?.date_issued ? new Date(firstCert.date_issued).getFullYear() : new Date().getFullYear()),
          major: profile.major || 'Unknown',
          gpa: profile.gpa || 0,
          location: profile.location || 'Unknown',
          skills: Array.from(user.skills),
          certifications: user.certificates.map((cert: Certificate) => ({
            id: cert.id,
            title: cert.title,
            issuer: cert.institution,
            issue_date: cert.date_issued,
            verification_status: cert.verification_status,
            confidence_score: 0.9, // Default confidence
            skills: [], // Will be populated from title
            verification_method: 'AI + Manual'
          })),
          verified_count: user.verified_certificates,
          total_certifications: user.total_certificates,
          last_activity: firstCert?.date_issued || new Date().toISOString(),
          created_at: profile.created_at,
          portfolio_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/public/portfolio/${user.user_id}`
        };
      });

    return NextResponse.json({
      data: {
        students: filteredStudents,
        pagination: {
          total: filteredStudents.length,
          limit,
          offset,
          has_more: (offset + limit) < filteredStudents.length
        },
        search_criteria: {
          skills,
          certifications,
          institutions,
          date_range,
          min_certificates
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

