import { NextRequest } from 'next/server';
import { withRole, success, apiError, parseAndValidateBody } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { ProductionVCIssuer, type IssuanceRequest } from '@/lib/vc/vcIssuer';
import { ProductionKeyManager } from '@/lib/vc/productionKeyManager';

interface IssueVCBody {
  credentialSubject: Record<string, unknown>;
  credentialType: string;
  validityPeriod?: number;
  customFields?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export const POST = withRole(['faculty', 'admin'], async (req: NextRequest, { user }) => {
  const result = await parseAndValidateBody<IssueVCBody>(req, ['credentialSubject', 'credentialType']);
  if (result.error) return result.error;

  const body = result.data;

  // Initialize VC issuer
  const vcIssuer = new ProductionVCIssuer();
  
  // Check if we have a valid signing key
  const keyManager = ProductionKeyManager.getInstance();
  let currentKey = keyManager.getCurrentKey();
  
  if (!currentKey) {
    // Generate a new production key
    currentKey = await keyManager.generateProductionKey();
  }

  // Validate the key
  const keyValid = await keyManager.validateKey(currentKey.kid);
  if (!keyValid) {
    throw apiError.internal('Invalid signing key. Please contact administrator.');
  }

  // Create issuance request
  const issuanceRequest: IssuanceRequest = {
    credentialSubject: body.credentialSubject as Record<string, unknown>,
    credentialType: body.credentialType,
    validityPeriod: body.validityPeriod,
    customFields: body.customFields as Record<string, unknown> | undefined,
    metadata: {
      ...body.metadata,
      issuedBy: user.id,
      issuedAt: new Date().toISOString()
    } as Record<string, unknown>
  };

  // Issue the credential
  const issuanceResult = await vcIssuer.issueCredential(
    issuanceRequest,
    user.id,
    user.id // Self-approval for faculty/admin
  );

  if (!issuanceResult.success) {
    throw apiError.badRequest(issuanceResult.error || 'Failed to issue credential');
  }

  // Store the credential in the database
  const supabase = await createSupabaseServerClient();
  const subjectId = (body.credentialSubject as Record<string, unknown>).id as string;
  const { error: dbError } = await supabase
    .from('verifiable_credentials')
    .insert({
      id: issuanceResult.credential!.id,
      student_id: subjectId,
      issuer: issuanceResult.credential!.issuer,
      issuance_date: issuanceResult.credential!.issuanceDate,
      credential: issuanceResult.credential!,
      status: 'active',
      created_at: new Date().toISOString(),
      metadata: {
        issuanceId: issuanceResult.issuanceId,
        credentialType: body.credentialType,
        keyId: currentKey.kid,
        issuedBy: user.id
      }
    });

  if (dbError) {
    console.error('Database error:', dbError);
    throw apiError.internal('Failed to store credential in database');
  }

  // Log the issuance
  await supabase.from('audit_logs').insert({
    user_id: user.id,
    action: 'issue_vc',
    target_id: issuanceResult.credential!.id,
    details: {
      credentialType: body.credentialType,
      issuanceId: issuanceResult.issuanceId,
      keyId: currentKey.kid,
      validationPassed: issuanceResult.validationResult?.isValid || false
    },
    created_at: new Date().toISOString(),
  });

  return success({
    credential: issuanceResult.credential,
    issuanceId: issuanceResult.issuanceId,
    timestamp: issuanceResult.timestamp,
    validationResult: issuanceResult.validationResult
  }, 'Credential issued successfully', 201);
});
