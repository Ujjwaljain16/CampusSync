import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute, readJsonObject, getApprovedStudentOrgs } from '@/lib/privacy/recruiterAccess';
import { isUuid } from '@/lib/privacy/sanitize';

const RATE = { scope: 'recruiter-favorites', rateLimit: RateLimitPresets.relaxed };

// GET: student ids favourited by the current recruiter. Response: { data: { favorites: string[] } }
export const GET = recruiterRoute(RATE, async (_req: NextRequest, access) => {
  const { data, error } = await access.admin
    .from('recruiter_favorites')
    .select('student_id, created_at')
    .eq('recruiter_id', access.user.id)
    .in('organization_id', access.orgIds)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    console.error('[recruiter-favorites] fetch failed', error);
    return apiError.internal('Failed to fetch favorites');
  }
  return success({ favorites: (data ?? []).map((f: { student_id: string }) => f.student_id) });
});

// POST: add a favourite (stored against the student's own organisation)
export const POST = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const { studentId } = parsed.body;
  if (!isUuid(studentId)) return apiError.badRequest('A valid studentId is required');

  const studentOrgId = (await getApprovedStudentOrgs(access.admin, [studentId], access.orgIds)).get(studentId);
  if (!studentOrgId) return apiError.notFound('Student not found');

  const { data, error } = await access.admin
    .from('recruiter_favorites')
    .insert({ recruiter_id: access.user.id, student_id: studentId, organization_id: studentOrgId })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return success({ message: 'Already in favorites', favorite: { student_id: studentId } });
    }
    console.error('[recruiter-favorites] insert failed', error);
    return apiError.internal('Failed to add favorite');
  }
  return success({ message: 'Added to favorites', favorite: data });
});

// DELETE: remove a favourite (?studentId=)
export const DELETE = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const studentId = new URL(req.url).searchParams.get('studentId');
  if (!isUuid(studentId)) return apiError.badRequest('A valid studentId is required');

  const { error } = await access.admin
    .from('recruiter_favorites')
    .delete()
    .eq('recruiter_id', access.user.id)
    .eq('student_id', studentId)
    .in('organization_id', access.orgIds);
  if (error) {
    console.error('[recruiter-favorites] delete failed', error);
    return apiError.internal('Failed to remove favorite');
  }
  return success({ message: 'Removed from favorites' });
});
