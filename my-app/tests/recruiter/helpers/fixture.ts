import { NextRequest } from 'next/server';
import { createMockClient, type MockClient, type TableHandler } from '../../privacy/helpers/mockSupabase';

export const ORG_A = '11111111-1111-4111-8111-111111111111';
export const ORG_B = '22222222-2222-4222-8222-222222222222';
export const STUDENT_1 = '33333333-3333-4333-8333-333333333331';
export const STUDENT_2 = '33333333-3333-4333-8333-333333333332';

let counter = 0;
/** Unique, UUID-shaped user id per call so rate-limit buckets never collide between tests. */
export function newUserId(): string {
  counter += 1;
  return `99999999-9999-4999-8999-${String(counter).padStart(12, '0')}`;
}

/**
 * Session (cookie) client for a recruiter: serves the auth user and the user_roles
 * lookups performed by getRecruiterContext + the platform-approval check.
 */
export function recruiterSessionClient(opts: {
  userId: string;
  platformStatus?: 'approved' | 'pending' | null;
  orgIds?: string[];
}): MockClient {
  const platformStatus = opts.platformStatus === undefined ? 'approved' : opts.platformStatus;
  const orgIds = opts.orgIds ?? [ORG_A];
  return createMockClient(
    {
      user_roles: (s) => {
        if (s.has('is', 'organization_id')) {
          return {
            data: platformStatus ? [{ role: 'recruiter', organization_id: null, approval_status: platformStatus }] : [],
          };
        }
        return { data: orgIds.map((organization_id) => ({ organization_id })) };
      },
    },
    { id: opts.userId, email: 'recruiter@example.com' }
  );
}

export function adminClient(handlers: Record<string, TableHandler>): MockClient {
  return createMockClient(handlers);
}

export function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
