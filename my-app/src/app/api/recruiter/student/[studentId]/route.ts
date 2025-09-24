import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '@/lib/supabaseServer';

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
    const supabase = await createSupabaseServerClient();

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
        issuer,
        issue_date,
        verification_status,
        confidence_score,
        verification_method,
        description,
        certificate_url,
        verification_results
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
      issuer: cert.issuer,
      issue_date: cert.issue_date,
      verification_status: cert.verification_status,
      confidence_score: cert.confidence_score,
      skills: [], // Extract from title/issuer or from a skills table
      verification_method: cert.verification_method,
      description: cert.description,
      certificate_url: cert.certificate_url,
      verification_details: cert.verification_results ? {
        qr_verified: cert.verification_results.qr_verified || false,
        logo_verified: cert.verification_results.logo_verified || false,
        template_verified: cert.verification_results.template_verified || false,
        ai_confidence: cert.verification_results.ai_confidence || 0
      } : undefined
    })) || [];

    // Calculate stats
    const verifiedCount = processedCertificates.filter(cert => cert.verification_status === 'verified').length;
    const totalCertifications = processedCertificates.length;

    // Extract skills from certificates (basic implementation)
    const skillsSet = new Set<string>();
    processedCertificates.forEach(cert => {
      // Simple skill extraction - in production, you'd have a proper skills table
      const title = cert.title.toLowerCase();
      const issuer = cert.issuer.toLowerCase();
      
      const commonSkills = [
        'python', 'javascript', 'java', 'react', 'node.js', 'aws', 'docker', 'kubernetes',
        'machine learning', 'data science', 'ai', 'blockchain', 'cybersecurity',
        'frontend', 'backend', 'full stack', 'mobile', 'ios', 'android', 'typescript',
        'vue.js', 'angular', 'spring boot', 'express', 'mongodb', 'postgresql', 'mysql'
      ];
      
      commonSkills.forEach(skill => {
        if (title.includes(skill) || issuer.includes(skill)) {
          skillsSet.add(skill);
        }
      });
    });

    const student = {
      id: profile.id,
      name: profile.name,
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
      last_activity: processedCertificates[0]?.issue_date || profile.created_at,
      created_at: profile.created_at
    };

    return NextResponse.json(student);

  } catch (error) {
    console.error('Student detail API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
