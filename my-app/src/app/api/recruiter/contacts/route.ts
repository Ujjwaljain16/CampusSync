import { NextRequest } from 'next/server';
import { createSupabaseAdminClient, getServerUserWithRole } from '@/lib/supabaseServer';
import { success, apiError } from '@/lib/api';

// GET: Fetch contact history for current recruiter
export async function GET(req: NextRequest) {
  const { user, role } = await getServerUserWithRole();
  
  if (!user || (role !== 'recruiter' && role !== 'admin')) {
    throw apiError.unauthorized();
  }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');

    const supabase = createSupabaseAdminClient();
    
    let query = supabase
      .from('recruiter_contacts')
      .select('*')
      .eq('recruiter_id', user.id)
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
  const { user, role } = await getServerUserWithRole();
  
  if (!user || (role !== 'recruiter' && role !== 'admin')) {
    throw apiError.unauthorized();
  }

  const { studentId, method, notes } = await req.json();
  
  if (!studentId) {
    throw apiError.badRequest('Student ID required');
  }

  const validMethods = ['email', 'phone', 'linkedin', 'other'];
  const contactMethod = method && validMethods.includes(method) ? method : 'email';

  const supabase = createSupabaseAdminClient();
    
    // Insert contact log
  const { data, error } = await supabase
    .from('recruiter_contacts')
    .insert({
      recruiter_id: user.id,
      student_id: studentId,
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
  const { user, role } = await getServerUserWithRole();
  
  if (!user || (role !== 'recruiter' && role !== 'admin')) {
    throw apiError.unauthorized();
  }

  const { contactId, responseReceived } = await req.json();
  
  if (!contactId) {
    throw apiError.badRequest('Contact ID required');
  }

  const supabase = createSupabaseAdminClient();
  
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
