import { NextRequest } from 'next/server';
import { withRole, success, apiError } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export const GET = withRole(['recruiter', 'admin'], async (request: NextRequest) => {

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const search = searchParams.get('search') || '';
  const skills = searchParams.get('skills')?.split(',') || [];
  const verification_status = searchParams.get('verification_status')?.split(',') || [];
  const confidence_min = parseFloat(searchParams.get('confidence_min') || '0');

    const supabase = await createSupabaseServerClient();
    const offset = (page - 1) * limit;

    // Fetch student user_ids from user_roles
    const { data: studentRoleRows, error: roleErr } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'student');

    if (roleErr) {
      console.error('Error fetching student roles:', roleErr);
      throw apiError.internal('Failed to fetch students');
    }

  const studentIds = (studentRoleRows || []).map((r: { user_id: string }) => r.user_id);
    if (studentIds.length === 0) {
      return success({ 
        students: [], 
        pagination: { page, limit, total: 0, totalPages: 0 } 
      });
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
      throw apiError.internal('Failed to fetch students');
    }

    if (!certificates || certificates.length === 0) {
      return success({ 
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
    
  certificates.forEach((cert: Record<string, unknown>) => {
      const studentId = cert.student_id;
      const profile = profileMap.get(studentId) || {
        id: studentId,
        full_name: 'Unknown Student',
        role: 'student',
        created_at: new Date().toISOString()
      };

      if (!studentsMap.has(studentId)) {
        let gradYear = new Date().getFullYear();
        if (typeof cert.date_issued === 'string') {
          const parsedDate = new Date(cert.date_issued);
          if (!isNaN(parsedDate.getTime())) {
            gradYear = parsedDate.getFullYear();
          }
        }
        studentsMap.set(studentId, {
          id: studentId,
          name: profile.full_name || 'Unknown Student',
          email: `${studentId}@example.com`, // Generate email from ID
          university: cert.institution || 'Unknown University', // Use certificate institution
          graduation_year: gradYear,
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
      if (typeof cert.created_at === 'string' && new Date(cert.created_at) > new Date(student.last_activity)) {
        student.last_activity = cert.created_at;
      }
    });

  // Convert to array and apply skills filter
  let students: Record<string, unknown>[] = Array.from(studentsMap.values());

  // Apply skills filter (basic implementation)
  if (skills.length > 0) {
    students = students.filter((student: Record<string, unknown>) =>
      (student.certifications as Record<string, unknown>[]).some((cert: Record<string, unknown>) =>
        skills.some((skill: string) => {
          const title = typeof cert.title === 'string' ? cert.title : '';
          const issuer = typeof cert.issuer === 'string' ? cert.issuer : '';
          return (
            title.toLowerCase().includes(skill.toLowerCase()) ||
            issuer.toLowerCase().includes(skill.toLowerCase())
          );
        })
      )
    );
  }

    // Get total count for pagination
  const { count } = await supabase
    .from('certificates')
    .select('*', { count: 'exact', head: true })
    .in('student_id', studentIds);

  return success({
    students,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  });
});

