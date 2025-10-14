import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const { user, role } = await getServerUserWithRole();
    
    // Check if user is recruiter or admin
    if (!user || (role !== 'recruiter' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client to bypass RLS for reading student data
    const adminSupabase = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();

    // Get total students count (use admin client)
    const { count: totalStudents } = await adminSupabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'student');

    // Get certification counts by status (use admin client)
    const { data: statusCounts } = await adminSupabase
      .from('certificates')
      .select('verification_status')
      .in('verification_status', ['verified', 'pending', 'rejected']);

    const verifiedCount = statusCounts?.filter(c => c.verification_status === 'verified').length || 0;
    const pendingCount = statusCounts?.filter(c => c.verification_status === 'pending').length || 0;
    const rejectedCount = statusCounts?.filter(c => c.verification_status === 'rejected').length || 0;

    // Get average confidence score (use admin client)
    const { data: confidenceData } = await adminSupabase
      .from('certificates')
      .select('confidence_score')
      .not('confidence_score', 'is', null);

    const averageConfidence = confidenceData?.length > 0 
      ? confidenceData.reduce((sum, cert) => sum + (cert.confidence_score || 0), 0) / confidenceData.length
      : 0;

    // Get top skills (extracted from certificate titles) - use admin client
    const { data: certificates } = await adminSupabase
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

    // Get top universities - use admin client
    const { data: universityData } = await adminSupabase
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

    // Get daily activity for the last 30 days - use admin client
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: dailyActivity } = await adminSupabase
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

    // Get recruiter-specific metrics from database
    const { count: contactedCount } = await supabase
      .from('recruiter_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('recruiter_id', user.id);

    const { count: responseCount } = await supabase
      .from('recruiter_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('recruiter_id', user.id)
      .eq('response_received', true);

    const { count: pipelineCount } = await supabase
      .from('recruiter_pipeline')
      .select('*', { count: 'exact', head: true })
      .eq('recruiter_id', user.id)
      .neq('stage', 'rejected');

    const contactedStudents = contactedCount || 0;
    const responseRate = contactedStudents > 0 ? Math.round((responseCount || 0) / contactedStudents * 100) : 0;
    
    // Calculate engagement rate as percentage of students in active pipeline vs total students
    const activePipelineCount = pipelineCount || 0;
    const engagementRate = totalStudents && totalStudents > 0 
      ? Math.round((activePipelineCount / totalStudents) * 100) 
      : 0;

    return NextResponse.json({
      total_students: totalStudents || 0,
      verified_certifications: verifiedCount,
      pending_certifications: pendingCount,
      rejected_certifications: rejectedCount,
      average_confidence: averageConfidence,
      top_skills: topSkills,
      top_universities: topUniversities,
      daily_activity: dailyActivityData,
      // Recruiter-specific metrics
      contacted_students: contactedStudents,
      active_pipeline_count: activePipelineCount,
      engagement_rate: engagementRate,
      response_rate: responseRate
    });

  } catch (error) {
    console.error('Recruiter analytics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

