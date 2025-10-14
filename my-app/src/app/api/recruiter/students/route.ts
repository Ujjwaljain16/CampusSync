import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const skills = searchParams.get('skills')?.split(',') || [];
    const universities = searchParams.get('universities')?.split(',') || [];
    const graduation_years = searchParams.get('graduation_years')?.split(',').map(y => parseInt(y)).filter(y => !isNaN(y)) || [];
    const verification_status = searchParams.get('verification_status')?.split(',') || [];
    const confidence_min = parseFloat(searchParams.get('confidence_min') || '0');
    const location = searchParams.get('location') || '';
    const gpa_min = parseFloat(searchParams.get('gpa_min') || '0');

    const supabase = await createSupabaseServerClient();
    const offset = (page - 1) * limit;

    // Fetch student user_ids from user_roles
    const { data: studentRoleRows, error: roleErr } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'student');

    if (roleErr) {
      console.error('Error fetching student roles:', roleErr);
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
    }

    const studentIds = (studentRoleRows || []).map((r: any) => r.user_id);
    if (studentIds.length === 0) {
      return NextResponse.json({ students: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    // First get certificates for students
    let query = supabase
      .from('certificates')
      .select(`
        id,
        title,
        issuer,
        issue_date,
        verification_status,
        confidence_score,
        verification_method,
        student_id,
        created_at
      `)
      .in('student_id', studentIds);

    // Apply filters
    if (search) {
      query = query.or(`title.ilike.%${search}%,issuer.ilike.%${search}%`);
    }

    if (verification_status.length > 0) {
      query = query.in('verification_status', verification_status);
    }

    if (confidence_min > 0) {
      query = query.gte('confidence_score', confidence_min);
    }

    // Add pagination
    query = query.range(offset, offset + limit - 1);

    const { data: certificates, error } = await query;

    if (error) {
      console.error('Error fetching certificates:', error);
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
    }

    if (!certificates || certificates.length === 0) {
      return NextResponse.json({ 
        students: [], 
        pagination: { page, limit, total: 0, totalPages: 0 } 
      });
    }

    // Get unique student IDs from certificates
    const uniqueStudentIds = [...new Set(certificates.map(cert => cert.student_id))];

    // Fetch profiles for these students (using actual schema)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .in('id', uniqueStudentIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      // Continue without profiles
    }

    // Create a map for quick profile lookup
    const profileMap = new Map();
    profiles?.forEach(profile => {
      profileMap.set(profile.id, profile);
    });

    // Group certificates by student
    const studentsMap = new Map();
    
    certificates.forEach((cert: any) => {
      const studentId = cert.student_id;
      const profile = profileMap.get(studentId) || {
        id: studentId,
        full_name: 'Unknown Student',
        role: 'student',
        created_at: new Date().toISOString()
      };

      if (!studentsMap.has(studentId)) {
        studentsMap.set(studentId, {
          id: studentId,
          name: profile.full_name || 'Unknown Student',
          email: `${studentId}@example.com`, // Generate email from ID
          university: cert.institution || 'Unknown University', // Use certificate institution
          graduation_year: new Date(cert.date_issued).getFullYear() || new Date().getFullYear(),
          location: 'Unknown', // Not in profiles schema
          gpa: 0, // Not in profiles schema
          major: 'Unknown', // Not in profiles schema
          skills: [],
          certifications: [],
          verified_count: 0,
          total_certifications: 0,
          last_activity: cert.created_at
        });
      }

      const student = studentsMap.get(studentId);
      
      // Add certification
      student.certifications.push({
        id: cert.id,
        title: cert.title,
        issuer: cert.issuer,
        issue_date: cert.issue_date,
        verification_status: cert.verification_status,
        confidence_score: cert.confidence_score,
        skills: [],
        verification_method: cert.verification_method
      });

      // Update counts
      student.total_certifications++;
      if (cert.verification_status === 'verified') {
        student.verified_count++;
      }

      // Update last activity
      if (new Date(cert.created_at) > new Date(student.last_activity)) {
        student.last_activity = cert.created_at;
      }
    });

    // Convert to array and apply skills filter
    let students: any[] = Array.from(studentsMap.values());

    // Apply skills filter (basic implementation)
    if (skills.length > 0) {
      students = students.filter((student: any) =>
        student.certifications.some((cert: any) =>
          skills.some((skill: string) =>
            (cert.title || '').toLowerCase().includes(skill.toLowerCase()) ||
            (cert.issuer || '').toLowerCase().includes(skill.toLowerCase())
          )
        )
      );
    }

    // Get total count for pagination
    const { count } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .in('student_id', studentIds);

    return NextResponse.json({
      students,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Recruiter students API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

