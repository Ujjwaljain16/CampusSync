import { withRole, success } from '@/lib/api';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabaseServer';

export const GET = withRole(['recruiter', 'admin'], async (_req, { user }) => {
  // Use admin client to bypass RLS for reading student data
  const adminSupabase = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();

  // Get all user_ids from user_roles (as in search-students logic)
  const { data: userRoles, error: userRolesError } = await adminSupabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'student');

  const userIds = (userRoles || []).map(r => r.user_id);

  // Get unique student_ids who have at least one verified certificate
  const { data: verifiedCerts, error: verifiedCertsError } = await adminSupabase
    .from('certificates')
    .select('student_id')
    .eq('verification_status', 'verified');

  const verifiedStudentIds = new Set((verifiedCerts || []).map(c => c.student_id));

  // Only count students who are in both lists (user_id in user_roles, student_id in certificates)
  const totalStudents = userIds.filter(id => verifiedStudentIds.has(id)).length;

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

  const averageConfidence = (confidenceData && confidenceData.length > 0)
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
  universityData?.forEach((item: Record<string, unknown>) => {
    const profiles = item.profiles as Array<{ university?: string }> | undefined;
    const university = profiles?.[0]?.university;
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

  return success({
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
});

