import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { studentId } = await params;
    // Use admin client to bypass RLS policies
    const supabase = createSupabaseAdminClient();

    // Get student profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', studentId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Get student's certificates
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
      .order('created_at', { ascending: false });

    if (certError) {
      console.error('Error fetching certificates:', certError);
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 });
    }

    // Process certificates
    const processedCertificates = certificates?.map(cert => ({
      id: cert.id,
      title: cert.title,
      institution: cert.institution,
      date_issued: cert.date_issued,
      verification_status: cert.verification_status,
      confidence_score: cert.confidence_score,
      skills: [], // Extract from title/institution or from a skills table
      verification_method: cert.verification_method,
      description: cert.description,
      file_url: cert.file_url,
      verification_details: {
        qr_verified: !!cert.qr_code_data,
        digital_signature: !!cert.digital_signature,
        issuer_verified: cert.issuer_verified || false,
        confidence: cert.confidence_score || 0
      }
    })) || [];

    // Calculate stats
    const verifiedCount = processedCertificates.filter(cert => cert.verification_status === 'verified').length;
    const totalCertifications = processedCertificates.length;

    // Extract skills from certificates (basic implementation)
    const skillsSet = new Set<string>();
    processedCertificates.forEach(cert => {
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
      university: profile.university,
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
      last_activity: processedCertificates[0]?.date_issued || profile.created_at,
      created_at: profile.created_at
    };

    return NextResponse.json(student);

  } catch (error) {
    console.error('Student detail API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
