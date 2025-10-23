import { NextRequest } from 'next/server';
import { withRole, success, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { ProductionVCVerifier, type VerificationOptions } from '@/lib/vc/vcVerifier';
import { isVerifiableCredential } from '@/lib/vc/vcTypeGuards';
import { ProductionKeyManager } from '@/lib/vc/productionKeyManager';

interface VerifyVCBody {
  credential: Record<string, unknown>; // VerifiableCredential from vcVerifier
  options?: VerificationOptions;
}

export const POST = withRole(['student', 'faculty', 'admin', 'recruiter'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<VerifyVCBody>(req, ['credential']);
  if (result.error) return result.error;

  const body = result.data;

  // Initialize VC verifier
  const vcVerifier = ProductionVCVerifier.getInstance();
  
  // Get trusted keys
  const keyManager = ProductionKeyManager.getInstance();
  const currentKey = keyManager.getCurrentKey();
  
  if (currentKey) {
    vcVerifier.addTrustedKey(currentKey.kid, currentKey);
  }

  // Set default verification options
  const verificationOptions: VerificationOptions = {
    allowExpired: false,
    strictMode: true,
    checkRevocation: true,
    allowedIssuers: [process.env.NEXT_PUBLIC_ISSUER_DID || 'did:web:localhost:3000'],
    ...body.options
  };


  // Type guard: ensure the credential matches VerifiableCredential
  if (!isVerifiableCredential(body.credential)) {
    return new Response(
      JSON.stringify({ error: 'Invalid credential: missing required fields or incorrect structure.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const verificationResult = await vcVerifier.verifyCredential(
    body.credential,
    verificationOptions,
    user?.id || 'anonymous'
  );

  // Store verification result in database
  const supabase = await createSupabaseServerClient();
  await supabase.from('audit_logs').insert({
    user_id: user?.id || null,
    action: 'verify_vc',
    target_id: body.credential.id,
    details: {
      isValid: verificationResult.isValid,
      errors: verificationResult.errors,
      warnings: verificationResult.warnings,
      verificationMethod: 'JsonWebSignature2020',
      issuer: verificationResult.metadata.issuer,
      subject: verificationResult.metadata.subject
    },
    created_at: new Date().toISOString(),
  });

  return success({
    isValid: verificationResult.isValid,
    credential: verificationResult.credential,
    errors: verificationResult.errors,
    warnings: verificationResult.warnings,
    metadata: verificationResult.metadata,
    revocationStatus: verificationResult.revocationStatus,
    validationDetails: verificationResult.validationDetails
  });
});

export const GET = withRole(['faculty', 'admin'], async () => {
  const vcVerifier = ProductionVCVerifier.getInstance();
  const stats = vcVerifier.getVerificationStats();

  return success(stats);
});
