import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getIssuerJwk, verifyCredentialJws } from '../../../../../lib/vc';
import type { VerifiableCredential } from '@/types/index';
import { success, apiError } from '@/lib/api';

export async function POST(req: NextRequest) {
  const body = await req.json() as { 
    jws?: string; 
    vc?: VerifiableCredential;
    credentialId?: string;
  };

  // Method 1: Verify by JWS directly
  if (body.jws) {
    try {
      const jwk = await getIssuerJwk();
      const { payload, protectedHeader } = await verifyCredentialJws(body.jws, jwk);
      
      return success({ 
        valid: true, 
        payload, 
        protectedHeader,
        verification_method: 'jws_direct'
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'JWS verification failed';
      return success({ 
        valid: false, 
        error: message,
        verification_method: 'jws_direct'
      });
    }
  }

  // Method 2: Verify by Verifiable Credential object
  if (body.vc?.proof?.jws) {
    try {
      const jwk = await getIssuerJwk();
      const { payload, protectedHeader } = await verifyCredentialJws(body.vc.proof.jws, jwk);
      
      return success({ 
        valid: true, 
        payload, 
        protectedHeader,
        verification_method: 'vc_object'
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'VC verification failed';
      return success({ 
        valid: false, 
        error: message,
        verification_method: 'vc_object'
      });
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
      return success({ 
        valid: false, 
        error: 'Credential not found',
        verification_method: 'credential_id'
      });
    }

    // Check if credential is revoked
    if (vc.revoked) {
      return success({ 
        valid: false, 
        error: 'Credential has been revoked',
        verification_method: 'credential_id'
      });
    }

    // Verify the JWS
    try {
      const jwk = await getIssuerJwk();
      const { payload, protectedHeader } = await verifyCredentialJws(vc.credential.proof.jws, jwk);
      
      return success({ 
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
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Credential verification failed';
      return success({ 
        valid: false, 
        error: message,
        verification_method: 'credential_id'
      });
    }
  }

  throw apiError.badRequest('Missing verification data. Provide jws, vc, or credentialId');
}

// GET endpoint for public credential verification (no auth required)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get('id');
  const jws = searchParams.get('jws');

  if (!credentialId && !jws) {
    throw apiError.badRequest('Missing credential ID or JWS');
  }

  // If JWS provided, verify directly
  if (jws) {
    try {
      const jwk = await getIssuerJwk();
      const { payload, protectedHeader } = await verifyCredentialJws(jws, jwk);
      
      return success({ 
        valid: true, 
        payload, 
        protectedHeader,
        verification_method: 'jws_direct'
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'JWS verification failed';
      return success({ 
        valid: false, 
        error: message,
        verification_method: 'jws_direct'
      });
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
      return success({ 
        valid: false, 
        error: 'Credential not found',
        verification_method: 'credential_id'
      });
    }

    if (vc.revoked) {
      return success({ 
        valid: false, 
        error: 'Credential has been revoked',
        verification_method: 'credential_id'
      });
    }

    try {
      const jwk = await getIssuerJwk();
      const { payload, protectedHeader } = await verifyCredentialJws(vc.credential.proof.jws, jwk);
      
      return success({ 
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
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Credential verification failed';
      return success({ 
        valid: false, 
        error: message,
        verification_method: 'credential_id'
      });
    }
  }

  throw apiError.badRequest('Missing verification data');
}

