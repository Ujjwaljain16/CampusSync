import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUserWithRole } from '../../../../../lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();

    // Get total students count
    const { count: totalStudents } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'student');

    // Get certification counts by status
    const { data: statusCounts } = await supabase
      .from('certificates')
      .select('verification_status')
      .in('verification_status', ['verified', 'pending', 'rejected']);

    const verifiedCount = statusCounts?.filter(c => c.verification_status === 'verified').length || 0;
    const pendingCount = statusCounts?.filter(c => c.verification_status === 'pending').length || 0;
    const rejectedCount = statusCounts?.filter(c => c.verification_status === 'rejected').length || 0;

    // Get average confidence score
    const { data: confidenceData } = await supabase
      .from('certificates')
      .select('confidence_score')
      .not('confidence_score', 'is', null);

    const averageConfidence = confidenceData?.length > 0 
      ? confidenceData.reduce((sum, cert) => sum + (cert.confidence_score || 0), 0) / confidenceData.length
      : 0;

    // Get top skills (extracted from certificate titles)
    const { data: certificates } = await supabase
      .from('certificates')
      .select('title, issuer')
      .eq('verification_status', 'verified');

    const skillCounts = new Map<string, number>();
    certificates?.forEach(cert => {
      // Simple skill extraction - in production, you'd have a proper skills table
      const title = cert.title.toLowerCase();
      const issuer = cert.issuer.toLowerCase();
      
      const commonSkills = [
        'python', 'javascript', 'java', 'react', 'node.js', 'aws', 'docker', 'kubernetes',
        'machine learning', 'data science', 'ai', 'blockchain', 'cybersecurity',
        'frontend', 'backend', 'full stack', 'mobile', 'ios', 'android'
      ];
      
      commonSkills.forEach(skill => {
        if (title.includes(skill) || issuer.includes(skill)) {
          skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
        }
      });
    });

    const topSkills = Array.from(skillCounts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get top universities
    const { data: universityData } = await supabase
      .from('user_roles')
      .select(`
        profiles!inner(
          university
        )
      `)
      .eq('role', 'student');

    const universityCounts = new Map<string, number>();
    universityData?.forEach(item => {
      const university = item.profiles?.university;
      if (university) {
        universityCounts.set(university, (universityCounts.get(university) || 0) + 1);
      }
    });

    const topUniversities = Array.from(universityCounts.entries())
      .map(([university, count]) => ({ university, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get daily activity for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: dailyActivity } = await supabase
      .from('certificates')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const activityMap = new Map<string, number>();
    dailyActivity?.forEach(cert => {
      const date = new Date(cert.created_at).toISOString().split('T')[0];
      activityMap.set(date, (activityMap.get(date) || 0) + 1);
    });

    const dailyActivityData = Array.from(activityMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      total_students: totalStudents || 0,
      verified_certifications: verifiedCount,
      pending_certifications: pendingCount,
      rejected_certifications: rejectedCount,
      average_confidence: averageConfidence,
      top_skills: topSkills,
      top_universities: topUniversities,
      daily_activity: dailyActivityData
    });

  } catch (error) {
    console.error('Recruiter analytics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
