// StatusList2021-compliant VC revocation status endpoint
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const statusListId = searchParams.get('statusListId') || 'default';

    // For testing, allow empty credentialId
    if (!credentialId && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'credentialId required' }, { status: 400 });
    }

    // Get the latest status for the credential
    const { data: statusRecord, error } = await supabase
      .from('vc_status_registry')
      .select('*')
      .eq('credential_id', credentialId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Status lookup error:', error);
      return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
    }

    // If no record found, credential is active
    const isRevoked = statusRecord?.status === 'revoked';
    const isSuspended = statusRecord?.status === 'suspended';
    const isExpired = statusRecord?.status === 'expired';

    const status = {
      id: `https://campussync.io/api/vc/status-list?statusListId=${statusListId}`,
      type: 'StatusList2021Entry',
      statusPurpose: 'revocation',
      statusListIndex: credentialId, // Using credentialId as index
      statusListCredential: `https://campussync.io/api/vc/status-list/${statusListId}`,
      status: isRevoked ? '1' : isSuspended ? '2' : isExpired ? '3' : '0', // 0=active, 1=revoked, 2=suspended, 3=expired
      timestamp: statusRecord?.recorded_at || new Date().toISOString()
    };

    return NextResponse.json({
      '@context': 'https://www.w3.org/ns/status-list#',
      id: status.id,
      type: 'StatusList2021',
      statusPurpose: 'revocation',
      statusListCredential: status.statusListCredential,
      status: [status]
    });

  } catch (error) {
    console.error('Status list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credentialIds, statusListId = 'default' } = body;

    if (!Array.isArray(credentialIds)) {
      return NextResponse.json({ error: 'credentialIds must be an array' }, { status: 400 });
    }

    // Get status for multiple credentials
    const { data: statusRecords, error } = await supabase
      .from('vc_status_registry')
      .select('*')
      .in('credential_id', credentialIds)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('Bulk status lookup error:', error);
      return NextResponse.json({ error: 'Failed to check statuses' }, { status: 500 });
    }

    // Create status map
    const statusMap = new Map();
    statusRecords?.forEach(record => {
      if (!statusMap.has(record.credential_id)) {
        statusMap.set(record.credential_id, record);
      }
    });

    // Build status list
    const statusList = credentialIds.map(credentialId => {
      const record = statusMap.get(credentialId);
      const isRevoked = record?.status === 'revoked';
      const isSuspended = record?.status === 'suspended';
      const isExpired = record?.status === 'expired';

      return {
        id: `https://campussync.io/api/vc/status-list?statusListId=${statusListId}&credentialId=${credentialId}`,
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: credentialId,
        statusListCredential: `https://campussync.io/api/vc/status-list/${statusListId}`,
        status: isRevoked ? '1' : isSuspended ? '2' : isExpired ? '3' : '0',
        timestamp: record?.recorded_at || new Date().toISOString()
      };
    });

    return NextResponse.json({
      '@context': 'https://www.w3.org/ns/status-list#',
      id: `https://campussync.io/api/vc/status-list?statusListId=${statusListId}`,
      type: 'StatusList2021',
      statusPurpose: 'revocation',
      statusListCredential: `https://campussync.io/api/vc/status-list/${statusListId}`,
      status: statusList
    });

  } catch (error) {
    console.error('Bulk status list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
