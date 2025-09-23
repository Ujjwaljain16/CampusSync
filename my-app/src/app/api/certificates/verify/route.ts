import { NextRequest, NextResponse } from 'next/server';
import { getIssuerJwk, verifyCredentialJws } from '../../../../../lib/vc';
import type { VerifiableCredential } from '../../../../types';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { jws?: string; vc?: VerifiableCredential } | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const jws = body.jws || body.vc?.proof?.jws;
  if (!jws) return NextResponse.json({ error: 'Missing jws or vc.proof.jws' }, { status: 400 });

  try {
    const jwk = await getIssuerJwk();
    const { payload, protectedHeader } = await verifyCredentialJws(jws, jwk);
    return NextResponse.json({ data: { valid: true, payload, protectedHeader } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ data: { valid: false }, error: message }, { status: 200 });
  }
}


