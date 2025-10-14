import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/supabaseServer';
import { ProductionKeyManager } from '../../../../../../lib/vc/productionKeyManager';

// GET /api/vc/keys/current - admin only
export async function GET(_req: NextRequest) {
  const auth = await requireRole(['admin']);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const km = ProductionKeyManager.getInstance();
  const current = km.getCurrentKey();
  const meta = km.getKeyMetadata();
  return NextResponse.json({
    data: {
      currentKeyId: current?.kid || null,
      algorithm: current?.alg || null,
      use: current?.use || null,
      keys: meta
    }
  });
}



