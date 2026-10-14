import { error as errorResponse } from '@/lib/api';

/**
 * Retired. Recruiters must never change `certificates.verification_status`: that
 * field is the sole gate for issuing signed credentials and is owned by the
 * faculty/admin review workflow (`/api/certificates/approve`). Recruiter-side
 * flags are written by `/api/recruiter/verify-certificate`.
 *
 * No UI calls this endpoint; it is kept as an explicit 410 so stale clients fail loudly.
 */
export async function POST() {
  return errorResponse(
    'This endpoint has been removed. Recruiters cannot change certificate verification status; ' +
      'use /api/recruiter/verify-certificate to flag a certificate or ask faculty to review it.',
    410
  );
}
