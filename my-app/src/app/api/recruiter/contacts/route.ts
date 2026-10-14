import { NextRequest } from 'next/server';
import { success, apiError } from '@/lib/api/utils/response';
import { RateLimitPresets } from '@/lib/rateLimit';
import { recruiterRoute, readJsonObject, getApprovedStudentOrgs } from '@/lib/privacy/recruiterAccess';
import { isUuid } from '@/lib/privacy/sanitize';

const RATE = { scope: 'recruiter-contacts', rateLimit: RateLimitPresets.relaxed };
const VALID_METHODS = ['email', 'phone', 'linkedin', 'other'];
const MAX_NOTES = 2000;
const STAGE_ORDER = ['shortlisted', 'contacted', 'interviewed', 'offered', 'rejected'];

// GET: contact history of the current recruiter. Response: { data: { contacts } }
export const GET = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const studentId = new URL(req.url).searchParams.get('studentId');
  if (studentId !== null && !isUuid(studentId)) return apiError.badRequest('Invalid student id');

  let query = access.admin
    .from('recruiter_contacts')
    .select('*')
    .eq('recruiter_id', access.user.id)
    .in('organization_id', access.orgIds)
    .order('contacted_at', { ascending: false })
    .limit(500);
  if (studentId) query = query.eq('student_id', studentId);

  const { data, error } = await query;
  if (error) {
    console.error('[recruiter-contacts] fetch failed', error);
    return apiError.internal('Failed to fetch contacts');
  }
  return success({ contacts: data ?? [] });
});

// POST: log a contact attempt. The log is recorded against the student's own organisation.
export const POST = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const { studentId, method, notes } = parsed.body;

  if (!isUuid(studentId)) return apiError.badRequest('A valid studentId is required');
  if (method !== undefined && (typeof method !== 'string' || !VALID_METHODS.includes(method))) {
    return apiError.badRequest(`method must be one of: ${VALID_METHODS.join(', ')}`);
  }
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > MAX_NOTES)) {
    return apiError.badRequest(`notes must be a string of at most ${MAX_NOTES} characters`);
  }
  const contactMethod = (method as string | undefined) ?? 'email';

  const { admin, user, orgIds } = access;
  const studentOrgId = (await getApprovedStudentOrgs(admin, [studentId], orgIds)).get(studentId);
  if (!studentOrgId) return apiError.notFound('Student not found');

  // Avoid duplicate rapid clicks: reuse a contact logged in the last 60 seconds.
  const recentSince = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from('recruiter_contacts')
    .select('*')
    .eq('recruiter_id', user.id)
    .eq('student_id', studentId)
    .eq('method', contactMethod)
    .gte('contacted_at', recentSince)
    .order('contacted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentErr) {
    console.error('[recruiter-contacts] recent lookup failed', recentErr);
    return apiError.internal('Failed to check recent contacts');
  }

  let contact = recent;
  if (!recent) {
    const { data: inserted, error } = await admin
      .from('recruiter_contacts')
      .insert({
        recruiter_id: user.id,
        student_id: studentId,
        organization_id: studentOrgId,
        method: contactMethod,
        notes: typeof notes === 'string' && notes ? notes : null,
        contacted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) {
      console.error('[recruiter-contacts] insert failed', error);
      return apiError.internal('Failed to log contact');
    }
    contact = inserted;
  }

  // Move the pipeline to 'contacted' unless it is already further along.
  const { data: pipelineRow, error: pipelineReadErr } = await admin
    .from('recruiter_pipeline')
    .select('stage')
    .eq('recruiter_id', user.id)
    .eq('student_id', studentId)
    .maybeSingle();
  if (pipelineReadErr) {
    console.error('[recruiter-contacts] pipeline lookup failed', pipelineReadErr);
  } else {
    const currentStage = (pipelineRow as { stage?: string } | null)?.stage;
    if (!currentStage || STAGE_ORDER.indexOf(currentStage) < STAGE_ORDER.indexOf('contacted')) {
      const { error: upsertErr } = await admin.from('recruiter_pipeline').upsert(
        {
          recruiter_id: user.id,
          student_id: studentId,
          organization_id: studentOrgId,
          stage: 'contacted',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'recruiter_id,student_id' }
      );
      if (upsertErr) console.error('[recruiter-contacts] pipeline update failed', upsertErr);
    }
  }

  return success({ message: 'Contact logged', contact });
});

// PATCH: mark a contact as responded (owner only)
export const PATCH = recruiterRoute(RATE, async (req: NextRequest, access) => {
  const parsed = await readJsonObject(req);
  if (!parsed.ok) return parsed.response;
  const { contactId, responseReceived } = parsed.body;

  if (typeof contactId !== 'string' || contactId.length === 0 || contactId.length > 64) {
    return apiError.badRequest('Contact ID required');
  }
  if (typeof responseReceived !== 'boolean') {
    return apiError.badRequest('responseReceived must be a boolean');
  }

  const { data, error } = await access.admin
    .from('recruiter_contacts')
    .update({
      response_received: responseReceived,
      response_at: responseReceived ? new Date().toISOString() : null,
    })
    .eq('id', contactId)
    .eq('recruiter_id', access.user.id)
    .in('organization_id', access.orgIds)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[recruiter-contacts] update failed', error);
    return apiError.internal('Failed to update contact');
  }
  if (!data) return apiError.notFound('Contact not found');

  return success({ message: 'Contact updated', contact: data });
});
