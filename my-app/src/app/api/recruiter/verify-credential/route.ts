import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabaseServer';
import { getIssuerJwk, verifyCredentialJws } from '../../../../../lib/vc';
import type { VerifiableCredential } from '../../../../types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { 
      jws?: string; 
      vc?: VerifiableCredential;
      credentialId?: string;
    } | null;

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Method 1: Verify by JWS directly
    if (body.jws) {
      try {
        const jwk = await getIssuerJwk();
        const { payload, protectedHeader } = await verifyCredentialJws(body.jws, jwk);
        
        return NextResponse.json({ 
          data: { 
            valid: true, 
            payload, 
            protectedHeader,
            verification_method: 'jws_direct'
          } 
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'JWS verification failed';
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: message,
            verification_method: 'jws_direct'
          } 
        }, { status: 200 });
      }
    }

    // Method 2: Verify by Verifiable Credential object
    if (body.vc?.proof?.jws) {
      try {
        const jwk = await getIssuerJwk();
        const { payload, protectedHeader } = await verifyCredentialJws(body.vc.proof.jws, jwk);
        
        return NextResponse.json({ 
          data: { 
            valid: true, 
            payload, 
            protectedHeader,
            verification_method: 'vc_object'
          } 
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'VC verification failed';
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: message,
            verification_method: 'vc_object'
          } 
        }, { status: 200 });
      }
    }

    // Method 3: Verify by credential ID (lookup in database)
    if (body.credentialId) {
      const supabase = await createSupabaseServerClient();
      
      // Get the verifiable credential from database
      const { data: vc, error: vcError } = await supabase
        .from('verifiable_credentials')
        .select('*')
        .eq('id', body.credentialId)
        .single();

      if (vcError || !vc) {
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: 'Credential not found',
            verification_method: 'credential_id'
          } 
        }, { status: 200 });
      }

      // Check if credential is revoked
      if (vc.revoked) {
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: 'Credential has been revoked',
            verification_method: 'credential_id'
          } 
        }, { status: 200 });
      }

      // Verify the JWS
      try {
        const jwk = await getIssuerJwk();
        const { payload, protectedHeader } = await verifyCredentialJws(vc.credential.proof.jws, jwk);
        
        return NextResponse.json({ 
          data: { 
            valid: true, 
            payload, 
            protectedHeader,
            verification_method: 'credential_id',
            credential_info: {
              id: vc.id,
              issuer: vc.issuer,
              issuance_date: vc.issuance_date,
              revoked: vc.revoked
            }
          } 
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Credential verification failed';
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: message,
            verification_method: 'credential_id'
          } 
        }, { status: 200 });
      }
    }

    return NextResponse.json({ 
      error: 'Missing verification data. Provide jws, vc, or credentialId' 
    }, { status: 400 });

  } catch (error) {
    console.error('Credential verification error:', error);
    return NextResponse.json({ 
      error: 'Verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint for public credential verification (no auth required)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get('id');
  const jws = searchParams.get('jws');

  if (!credentialId && !jws) {
    return NextResponse.json({ 
      error: 'Missing credential ID or JWS' 
    }, { status: 400 });
  }

  try {
    // If JWS provided, verify directly
    if (jws) {
      try {
        const jwk = await getIssuerJwk();
        const { payload, protectedHeader } = await verifyCredentialJws(jws, jwk);
        
        return NextResponse.json({ 
          data: { 
            valid: true, 
            payload, 
            protectedHeader,
            verification_method: 'jws_direct'
          } 
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'JWS verification failed';
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: message,
            verification_method: 'jws_direct'
          } 
        }, { status: 200 });
      }
    }

    // If credential ID provided, lookup and verify
    if (credentialId) {
      const supabase = await createSupabaseServerClient();
      
      const { data: vc, error: vcError } = await supabase
        .from('verifiable_credentials')
        .select('*')
        .eq('id', credentialId)
        .single();

      if (vcError || !vc) {
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: 'Credential not found',
            verification_method: 'credential_id'
          } 
        }, { status: 200 });
      }

      if (vc.revoked) {
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: 'Credential has been revoked',
            verification_method: 'credential_id'
          } 
        }, { status: 200 });
      }

      try {
        const jwk = await getIssuerJwk();
        const { payload, protectedHeader } = await verifyCredentialJws(vc.credential.proof.jws, jwk);
        
        return NextResponse.json({ 
          data: { 
            valid: true, 
            payload, 
            protectedHeader,
            verification_method: 'credential_id',
            credential_info: {
              id: vc.id,
              issuer: vc.issuer,
              issuance_date: vc.issuance_date,
              revoked: vc.revoked
            }
          } 
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Credential verification failed';
        return NextResponse.json({ 
          data: { 
            valid: false, 
            error: message,
            verification_method: 'credential_id'
          } 
        }, { status: 200 });
      }
    }

  } catch (error) {
    console.error('Public credential verification error:', error);
    return NextResponse.json({ 
      error: 'Verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
