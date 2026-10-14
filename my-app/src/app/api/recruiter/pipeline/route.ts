import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute, readJsonObject, getApprovedStudentOrgs } from '@/lib/privacy/recruiterAccess';
import { isUuid } from '@/lib/privacy/sanitize';

type PipelineStage = 'shortlisted' | 'contacted' | 'interviewed' | 'offered' | 'rejected';
const VALID_STAGES: PipelineStage[] = ['shortlisted', 'contacted', 'interviewed', 'offered', 'rejected'];
const MAX_NOTES = 2000;

const RATE = { scope: 'recruiter-pipeline', rateLimit: RateLimitPresets.relaxed };

// GET: pipeline as a map { studentId: stage }. Response (envelope): { data: { pipeline } }
export const GET = recruiterRoute(RATE, async (_req: NextRequest, access) => {
  const { data, error } = await access.admin
    .from('recruiter_pipeline')
    .select('student_id, stage, notes, updated_at')
    .eq('recruiter_id', access.user.id)
    .in('organization_id', access.orgIds)
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (error) {
    console.error('[recruiter-pipeline] fetch failed', error);
    return apiError.internal('Failed to fetch pipeline');
  }

  const pipeline: Record<string, PipelineStage> = {};
  for (const entry of (data ?? []) as Array<{ student_id: string; stage: PipelineStage }>) {
    pipeline[entry.student_id] = entry.stage;
  }
  return success({ pipeline });
});

// POST: set the stage for a student (stored against the student's own organisation)
export const POST = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const { studentId, stage, notes } = parsed.body;

  if (!isUuid(studentId)) return apiError.badRequest('A valid studentId is required');
  if (typeof stage !== 'string' || !VALID_STAGES.includes(stage as PipelineStage)) {
    return apiError.badRequest('Invalid stage');
  }
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > MAX_NOTES)) {
    return apiError.badRequest(`notes must be a string of at most ${MAX_NOTES} characters`);
  }

  const studentOrgId = (await getApprovedStudentOrgs(access.admin, [studentId], access.orgIds)).get(studentId);
  if (!studentOrgId) return apiError.notFound('Student not found');

  const { data, error } = await access.admin
    .from('recruiter_pipeline')
    .upsert(
      {
        recruiter_id: access.user.id,
        student_id: studentId,
        organization_id: studentOrgId,
        stage,
        notes: typeof notes === 'string' && notes ? notes : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'recruiter_id,student_id' }
    )
    .select()
    .single();
  if (error) {
    console.error('[recruiter-pipeline] upsert failed', error);
    return apiError.internal('Failed to update pipeline');
  }
  return success({ message: 'Pipeline updated', pipeline: data });
});

// DELETE: remove a student from the pipeline (?studentId=)
export const DELETE = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const studentId = new URL(req.url).searchParams.get('studentId');
  if (!isUuid(studentId)) return apiError.badRequest('A valid studentId is required');

  const { error } = await access.admin
    .from('recruiter_pipeline')
    .delete()
    .eq('recruiter_id', access.user.id)
    .eq('student_id', studentId)
    .in('organization_id', access.orgIds);
  if (error) {
    console.error('[recruiter-pipeline] delete failed', error);
    return apiError.internal('Failed to remove from pipeline');
  }
  return success({ message: 'Removed from pipeline' });
});
