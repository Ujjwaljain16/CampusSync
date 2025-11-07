import { NextRequest } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';

// GET: Fetch contact history for current recruiter
export async function GET(req: NextRequest) {
  const userWithRole = await getServerUserWithRole();
  
  if (!userWithRole) {
    throw apiError.unauthorized();
  }
  
  const { user, role } = userWithRole;
  
  if (role !== 'recruiter' && role !== 'admin') {
    throw apiError.unauthorized();
  }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');

    const supabase = await createSupabaseAdminClient();
    const requestedOrgId = getRequestedOrgId(req);
    const orgContext = await getOrganizationContext(user, requestedOrgId);
    const targetOrgIds = getTargetOrganizationIds(orgContext);
    
    let query = supabase
      .from('recruiter_contacts')
      .select('*')
      .eq('recruiter_id', user.id)
      .in('organization_id', targetOrgIds)
      .order('contacted_at', { ascending: false });

    // Filter by student if provided
    if (studentId) {
      query = query.eq('student_id', studentId);
    }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching contacts:', error);
    throw apiError.internal('Failed to fetch contacts');
  }

  return success({ contacts: data || [] });
}

// POST: Log a new contact attempt
export async function POST(req: NextRequest) {
  const userWithRole = await getServerUserWithRole();
  
  if (!userWithRole) {
    throw apiError.unauthorized();
  }
  
  const { user, role } = userWithRole;
  
  if (role !== 'recruiter' && role !== 'admin') {
    throw apiError.unauthorized();
  }

  const { studentId, method, notes } = await req.json();
  
  if (!studentId) {
    throw apiError.badRequest('Student ID required');
  }

  const validMethods = ['email', 'phone', 'linkedin', 'other'];
  const contactMethod = method && validMethods.includes(method) ? method : 'email';

  const supabase = await createSupabaseAdminClient();
  const requestedOrgId = getRequestedOrgId(req);
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  const targetOrgId = requestedOrgId || ('organizationId' in orgContext ? orgContext.organizationId : targetOrgIds[0]);
    
  // Prevent duplicate rapid clicks: if the same recruiter already logged a contact
  // for the same student and method within the last 60 seconds, return that
  // existing record instead of inserting a new one.
  const recentThresholdMs = 60 * 1000; // 1 minute
  const recentSince = new Date(Date.now() - recentThresholdMs).toISOString();

  const { data: recent, error: recentErr } = await supabase
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
    console.error('Error checking recent contacts:', recentErr);
    throw apiError.internal('Failed to check recent contacts');
  }

  let data = recent;

  if (!recent) {
    // Insert contact log
    const { data: inserted, error } = await supabase
      .from('recruiter_contacts')
      .insert({
        recruiter_id: user.id,
        student_id: studentId,
        organization_id: targetOrgId,
        method: contactMethod,
        notes: notes || null,
        contacted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error logging contact:', error);
      throw apiError.internal('Failed to log contact');
    }

    data = inserted;
  }

  // Also update pipeline to 'contacted' if not already at a later stage
  const { data: pipelineData } = await supabase
    .from('recruiter_pipeline')
    .select('stage')
    .eq('recruiter_id', user.id)
    .eq('student_id', studentId)
    .single();

  const currentStage = pipelineData?.stage;
  const stageOrder = ['shortlisted', 'contacted', 'interviewed', 'offered', 'rejected'];
  
  // Only update if current stage is earlier than 'contacted' or doesn't exist
  if (!currentStage || stageOrder.indexOf(currentStage) < stageOrder.indexOf('contacted')) {
    await supabase
      .from('recruiter_pipeline')
      .upsert({
        recruiter_id: user.id,
        student_id: studentId,
        organization_id: targetOrgId,
        stage: 'contacted',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'recruiter_id,student_id'
      });
  }

  return success({ 
    message: 'Contact logged',
    contact: data
  });
}

// PATCH: Mark contact as responded
export async function PATCH(req: NextRequest) {
  const userWithRole = await getServerUserWithRole();
  
  if (!userWithRole) {
    throw apiError.unauthorized();
  }
  
  const { user, role } = userWithRole;
  
  if (role !== 'recruiter' && role !== 'admin') {
    throw apiError.unauthorized();
  }

  const { contactId, responseReceived } = await req.json();
  
  if (!contactId) {
    throw apiError.badRequest('Contact ID required');
  }

  const supabase = await createSupabaseAdminClient();
  
  const { data, error } = await supabase
    .from('recruiter_contacts')
    .update({
      response_received: responseReceived,
      response_at: responseReceived ? new Date().toISOString() : null
    })
    .eq('id', contactId)
    .eq('recruiter_id', user.id) // Ensure only owner can update
    .select()
    .single();

  if (error) {
    console.error('Error updating contact:', error);
    throw apiError.internal('Failed to update contact');
  }

  return success({ 
    message: 'Contact updated',
    contact: data
  });
}

