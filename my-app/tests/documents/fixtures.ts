import { MemDb } from './memdb';

export const ORG = '11111111-1111-4111-8111-111111111111';
export const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
export const DOC = '33333333-3333-4333-8333-333333333333';
export const STUDENT = '44444444-4444-4444-8444-444444444444';
export const FACULTY = '55555555-5555-4555-8555-555555555555';
export const ADMIN = '66666666-6666-4666-8666-666666666666';
export const RECRUITER = '77777777-7777-4777-8777-777777777777';

export function roleRow(user_id: string, role: string, approval_status: string, organization_id: string | null = ORG) {
  return { id: `${user_id}-${role}-${organization_id}`, user_id, role, approval_status, organization_id, created_at: '2024-01-01' };
}

export function docRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC,
    student_id: STUDENT,
    user_id: STUDENT,
    organization_id: ORG,
    document_type: 'certificate',
    title: 'Degree',
    institution: 'Uni',
    verification_status: 'pending',
    created_at: '2024-01-02',
    ...overrides,
  };
}

/** DB for `userId` with the document seeded and the given role rows */
export function makeDb(userId: string | null, roles: ReturnType<typeof roleRow>[], docs = [docRow()]) {
  const db = new MemDb(userId);
  db.seed('user_roles', roles);
  db.seed('documents', docs);
  return db;
}
