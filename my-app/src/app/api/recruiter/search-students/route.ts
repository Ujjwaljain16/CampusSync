import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabaseServer';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const skill = searchParams.get('skill') || '';
    const certification = searchParams.get('certification') || '';
    const institution = searchParams.get('institution') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = await createSupabaseServerClient();

    // Build the search query
    let queryBuilder = supabase
      .from('certificates')
      .select(`
        id,
        title,
        institution,
        date_issued,
        verification_status,
        user_id
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

    const { data: certificates, error: certError } = await queryBuilder;

    if (certError) {
      return NextResponse.json({ error: 'Failed to search certificates' }, { status: 500 });
    }

    if (!certificates || certificates.length === 0) {
      return NextResponse.json({ error: 'No certificates found' }, { status: 404 });
    }

    // Get user IDs and filter for students only
    const userIds = [...new Set(certificates.map(cert => cert.user_id))];
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds)
      .eq('role', 'student');

    if (roleError) {
      return NextResponse.json({ error: 'Failed to filter students' }, { status: 500 });
    }

    const studentUserIds = new Set(userRoles?.map(ur => ur.user_id) || []);
    const studentCertificates = certificates.filter(cert => studentUserIds.has(cert.user_id));

    // Group certificates by user
    const userMap = new Map();
    
    studentCertificates?.forEach(cert => {
      if (!userMap.has(cert.user_id)) {
        userMap.set(cert.user_id, {
          user_id: cert.user_id,
          certificates: [],
          total_certificates: 0,
          verified_certificates: 0,
          skills: new Set(),
          institutions: new Set()
        });
      }

      const user = userMap.get(cert.user_id);
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

    // Convert to array and format response
    const students = Array.from(userMap.values()).map(user => ({
      user_id: user.user_id,
      total_certificates: user.total_certificates,
      verified_certificates: user.verified_certificates,
      skills: Array.from(user.skills),
      institutions: Array.from(user.institutions),
      certificates: user.certificates,
      portfolio_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/public/portfolio/${user.user_id}`
    }));

    // Get total count for pagination (only verified certificates from students)
    const { count: totalCount } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'verified')
      .in('user_id', Array.from(studentUserIds));

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
        user_id
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
    const userIds = [...new Set(certificates.map(cert => cert.user_id))];
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds)
      .eq('role', 'student');

    if (roleError) {
      return NextResponse.json({ error: 'Failed to filter students' }, { status: 500 });
    }

    const studentUserIds = new Set(userRoles?.map(ur => ur.user_id) || []);
    const studentCertificates = certificates.filter(cert => studentUserIds.has(cert.user_id));

    // Group certificates by user and apply minimum certificate filter
    const userMap = new Map();
    
    studentCertificates?.forEach(cert => {
      if (!userMap.has(cert.user_id)) {
        userMap.set(cert.user_id, {
          user_id: cert.user_id,
          certificates: [],
          total_certificates: 0,
          verified_certificates: 0,
          skills: new Set(),
          institutions: new Set()
        });
      }

      const user = userMap.get(cert.user_id);
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

    // Filter users by minimum certificate count
    const filteredStudents = Array.from(userMap.values())
      .filter(user => user.verified_certificates >= min_certificates)
      .map(user => ({
        user_id: user.user_id,
        total_certificates: user.total_certificates,
        verified_certificates: user.verified_certificates,
        skills: Array.from(user.skills),
        institutions: Array.from(user.institutions),
        certificates: user.certificates,
        portfolio_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/public/portfolio/${user.user_id}`
      }));

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
