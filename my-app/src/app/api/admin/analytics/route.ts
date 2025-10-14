// Admin analytics API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // For now, allow analytics without auth for testing
    // In production, you'd want to add proper auth here
    const [
      { data: users, error: usersError },
      { data: certificates, error: certsError },
      { data: roleRequests, error: roleError }
    ] = await Promise.all([
      supabase.from('profiles').select('id, role, created_at'),
      supabase.from('certificates').select('id, verification_status, created_at'),
      supabase.from('role_requests').select('id, status, created_at')
    ]);

    if (usersError || certsError || roleError) {
      return NextResponse.json({ error: 'Failed to fetch analytics data' }, { status: 500 });
    }

    // Calculate analytics
    const totalUsers = users?.length || 0;
    const totalCertificates = certificates?.length || 0;
    const pendingRoleRequests = roleRequests?.filter(r => r.status === 'pending').length || 0;
    const verifiedCertificates = certificates?.filter(c => c.verification_status === 'verified').length || 0;

    const analytics = {
      users: {
        total: totalUsers,
        byRole: {
          student: users?.filter(u => u.role === 'student').length || 0,
          faculty: users?.filter(u => u.role === 'faculty').length || 0,
          recruiter: users?.filter(u => u.role === 'recruiter').length || 0,
          admin: users?.filter(u => u.role === 'admin').length || 0
        }
      },
      certificates: {
        total: totalCertificates,
        verified: verifiedCertificates,
        pending: totalCertificates - verifiedCertificates,
        verificationRate: totalCertificates > 0 ? (verifiedCertificates / totalCertificates * 100).toFixed(1) : 0
      },
      roleRequests: {
        pending: pendingRoleRequests
      },
      system: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    };

    return NextResponse.json(analytics);

  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
