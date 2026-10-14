import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { success, apiError } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute } from '@/lib/privacy/recruiterAccess';
import { extractSkills } from '@/lib/privacy/studentView';

const SAMPLE_LIMIT = 1000;

async function countRows(
  admin: SupabaseClient,
  table: string,
  apply: (q: ReturnType<ReturnType<SupabaseClient['from']>['select']>) => ReturnType<ReturnType<SupabaseClient['from']>['select']>
): Promise<number> {
  const query = apply(admin.from(table).select('*', { count: 'exact', head: true }));
  const { count, error } = await query;
  if (error) throw new Error(`count on ${table} failed: ${error.message ?? 'unknown'}`);
  return count ?? 0;
}

/**
 * Recruiter analytics for the caller's approved organisations.
 *
 * Every figure is computed from real rows. Counts are exact; "top" lists and the
 * average are computed over at most 1000 rows and flagged in `sampled`.
 * Response (envelope): { data: { ...metrics } }
 */
export const GET = recruiterRoute(
  { scope: 'recruiter-analytics', rateLimit: RateLimitPresets.relaxed },
  async (_req: NextRequest, { admin, user, orgIds }) => {
    try {
      const totalStudents = await countRows(admin, 'user_roles', (q) =>
        q.eq('role', 'student').eq('approval_status', 'approved').in('organization_id', orgIds)
      );
      const [verifiedCount, pendingCount, rejectedCount] = await Promise.all(
        (['verified', 'pending', 'rejected'] as const).map((status) =>
          countRows(admin, 'certificates', (q) => q.eq('verification_status', status).in('organization_id', orgIds))
        )
      );

      // Verified certificate sample (titles + confidence) for skills / average.
      const { data: verifiedSample, error: verifiedError } = await admin
        .from('certificates')
        .select('title, institution, confidence_score')
        .eq('verification_status', 'verified')
        .in('organization_id', orgIds)
        .limit(SAMPLE_LIMIT);
      if (verifiedError) throw new Error(`certificate sample failed: ${verifiedError.message}`);
      const verifiedRows = (verifiedSample ?? []) as Array<{ title: string | null; confidence_score: number | null }>;

      const scores = verifiedRows.map((c) => c.confidence_score).filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
      const averageConfidence = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

      const skillCounts = new Map<string, number>();
      for (const row of verifiedRows) {
        for (const skill of extractSkills([row.title])) skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
      }
      const topSkills = Array.from(skillCounts.entries())
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const { data: profileSample, error: profileError } = await admin
        .from('profiles')
        .select('university')
        .in('organization_id', orgIds)
        .not('university', 'is', null)
        .limit(SAMPLE_LIMIT);
      if (profileError) throw new Error(`profile sample failed: ${profileError.message}`);
      const universityCounts = new Map<string, number>();
      for (const row of (profileSample ?? []) as Array<{ university: string | null }>) {
        if (row.university) universityCounts.set(row.university, (universityCounts.get(row.university) ?? 0) + 1);
      }
      const topUniversities = Array.from(universityCounts.entries())
        .map(([university, count]) => ({ university, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data: activityRows, error: activityError } = await admin
        .from('certificates')
        .select('created_at')
        .in('organization_id', orgIds)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(SAMPLE_LIMIT);
      if (activityError) throw new Error(`activity sample failed: ${activityError.message}`);
      const activity = new Map<string, number>();
      for (const row of (activityRows ?? []) as Array<{ created_at: string }>) {
        const day = new Date(row.created_at).toISOString().split('T')[0];
        activity.set(day, (activity.get(day) ?? 0) + 1);
      }
      const dailyActivity = Array.from(activity.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Recruiter-specific metrics (this recruiter, accessible orgs only)
      const contactedStudents = await countRows(admin, 'recruiter_contacts', (q) =>
        q.eq('recruiter_id', user.id).in('organization_id', orgIds)
      );
      const respondedStudents = await countRows(admin, 'recruiter_contacts', (q) =>
        q.eq('recruiter_id', user.id).in('organization_id', orgIds).eq('response_received', true)
      );
      const activePipeline = await countRows(admin, 'recruiter_pipeline', (q) =>
        q.eq('recruiter_id', user.id).in('organization_id', orgIds).neq('stage', 'rejected')
      );

      return success({
        total_students: totalStudents,
        verified_certifications: verifiedCount,
        pending_certifications: pendingCount,
        rejected_certifications: rejectedCount,
        average_confidence: averageConfidence,
        top_skills: topSkills,
        top_universities: topUniversities,
        daily_activity: dailyActivity,
        contacted_students: contactedStudents,
        active_pipeline_count: activePipeline,
        engagement_rate: totalStudents > 0 ? Math.round((activePipeline / totalStudents) * 100) : 0,
        response_rate: contactedStudents > 0 ? Math.round((respondedStudents / contactedStudents) * 100) : 0,
        sampled: {
          top_skills: verifiedRows.length >= SAMPLE_LIMIT,
          average_confidence: verifiedRows.length >= SAMPLE_LIMIT,
          top_universities: (profileSample?.length ?? 0) >= SAMPLE_LIMIT,
          daily_activity: (activityRows?.length ?? 0) >= SAMPLE_LIMIT,
        },
      });
    } catch (err) {
      console.error('[recruiter-analytics] failed', err);
      return apiError.internal('Failed to load analytics');
    }
  }
);
