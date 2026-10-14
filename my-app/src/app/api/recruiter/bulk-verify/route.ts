import { error as errorResponse } from '@/lib/api';

/**
 * Retired. Recruiters must never change `certificates.verification_status`: that
 * field is the sole gate for issuing signed credentials and is owned by the
 * faculty/admin review workflow (`/api/certificates/approve`).
 *
 * No UI calls this endpoint; it is kept as an explicit 410 so stale clients fail loudly.
 */
export async function POST() {
  return errorResponse(
    'This endpoint has been removed. Recruiters cannot change certificate verification status; ' +
      'ask the issuing institution to review the certificate.',
    410
  );
}
