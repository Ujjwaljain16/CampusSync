import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { withRole, success, apiError, getOrganizationContext, getTargetOrganizationIds } from '@/lib/api';
import { getRequestedOrgId } from '@/lib/api/utils/recruiter';

export const POST = withRole(['recruiter', 'admin'], async (req: NextRequest, { user }) => {
  const body = await req.json() as {
    studentIds: string[];
    format: 'csv' | 'json' | 'excel';
    includeCredentials: boolean;
    filters?: {
      verified_only?: boolean;
      date_from?: string;
      date_to?: string;
    };
  };

  if (!body.studentIds || !body.format) {
    throw apiError.badRequest('Missing required fields: studentIds, format');
  }

  const supabase = await createSupabaseServerClient();
  
  // Get organization context for multi-tenancy
  const requestedOrgId = getRequestedOrgId(req);
  const orgContext = await getOrganizationContext(user, requestedOrgId);
  const targetOrgIds = getTargetOrganizationIds(orgContext);
  
  // Get student profiles (filtered by organization)
  const { data: students, error: studentsError } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at')
    .in('id', body.studentIds)
    .in('organization_id', targetOrgIds); // Multi-org filter

  if (studentsError) {
    throw apiError.internal(studentsError.message);
  }

  let exportData = students || [];

  // Include credentials if requested
  if (body.includeCredentials) {
    const { data: certificates, error: certError } = await supabase
      .from('certificates')
      .select(`
        id, title, institution, date_issued, verification_status,
        confidence_score, student_id, created_at
      `)
      .in('student_id', body.studentIds)
      .in('organization_id', targetOrgIds); // Multi-org filter

    if (certError) {
      console.error('Error fetching certificates:', certError);
    } else {
      // Group certificates by student
      const certsByStudent = new Map();
      certificates?.forEach(cert => {
        if (!certsByStudent.has(cert.student_id)) {
          certsByStudent.set(cert.student_id, []);
        }
        certsByStudent.get(cert.student_id).push(cert);
      });

      // Add certificates to student data
      exportData = exportData.map(student => ({
        ...student,
        certificates: certsByStudent.get(student.id) || [],
        certificate_count: certsByStudent.get(student.id)?.length || 0,
        verified_certificates: (certsByStudent.get(student.id)?.filter((c: { verification_status: string }) => c.verification_status === 'verified').length) || 0
      }));
    }
  }

  // Apply filters
  if (body.filters?.verified_only) {
    exportData = exportData.filter(student => 
      (student as Record<string, unknown>).verified_certificates as number > 0
    );
  }

  // Log the export action
  const targetOrgId = requestedOrgId || 
    ('organizationId' in orgContext ? orgContext.organizationId : null) || 
    ('organizationIds' in orgContext && Array.isArray(orgContext.organizationIds) ? orgContext.organizationIds[0] : null) || null;
  await supabase.from('audit_logs').insert({
    user_id: user.id,
    organization_id: targetOrgId, // Multi-org field
    action: 'data_export',
    target_id: body.studentIds.join(','),
    details: {
      format: body.format,
      student_count: body.studentIds.length,
      include_credentials: body.includeCredentials,
      filters: body.filters
    },
    created_at: new Date().toISOString()
  });

  // Format response based on requested format
  if (body.format === 'csv') {
    // For CSV, flatten the data
    const csvData = exportData.map(student => {
      const base = {
        student_id: student.id,
        full_name: student.full_name,
        email: student.email,
        joined_date: student.created_at
      };

      if (body.includeCredentials) {
        return {
          ...base,
          certificate_count: (student as Record<string, unknown>).certificate_count,
          verified_certificates: (student as Record<string, unknown>).verified_certificates
        };
      }

      return base;
    });

    return success({
      data: csvData,
      format: 'csv',
      headers: Object.keys(csvData[0] || {}),
      total_records: csvData.length
    });
  }

  return success({
    data: exportData,
    format: body.format,
    total_records: exportData.length,
    exported_at: new Date().toISOString()
  });
});
