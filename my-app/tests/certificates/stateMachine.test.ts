// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  transition,
  normalizeReviewStatus,
  actorOrganizationIds,
  type Actor,
  type CertificateAction,
  type CertificateStatus,
} from '@/lib/services/certificateService';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const STUDENT = 'student-1';

const cert = (status: string, over: Record<string, unknown> = {}) => ({
  id: 'cert-1',
  student_id: STUDENT,
  organization_id: ORG,
  verification_status: status,
  ...over,
});

const actor = (id: string, roles: Actor['roles']): Actor => ({ id, roles });

const STATES: CertificateStatus[] = ['pending', 'verified', 'rejected'];
const ACTIONS: CertificateAction[] = ['approve', 'reject', 'revert', 'reopen'];

// Allowed transitions: action -> from -> to
const ALLOWED: Record<CertificateAction, Partial<Record<CertificateStatus, CertificateStatus>>> = {
  approve: { pending: 'verified' },
  reject: { pending: 'rejected', verified: 'rejected' },
  revert: { verified: 'pending' },
  reopen: { rejected: 'pending' },
};

const authorizedActors: Record<string, Actor> = {
  faculty: actor('f1', [{ role: 'faculty', organization_id: ORG, approval_status: 'approved' }]),
  facultyNullApproval: actor('f2', [{ role: 'faculty', organization_id: ORG, approval_status: null }]),
  admin: actor('a1', [{ role: 'admin', organization_id: ORG, approval_status: 'approved' }]),
  orgAdmin: actor('a2', [{ role: 'org_admin', organization_id: ORG, approval_status: 'approved' }]),
  superAdminGlobal: actor('s1', [{ role: 'super_admin', organization_id: null, approval_status: 'approved' }]),
  superAdminInOrg: actor('s2', [{ role: 'super_admin', organization_id: ORG, approval_status: 'approved' }]),
  multiRole: actor('m1', [
    { role: 'student', organization_id: OTHER_ORG, approval_status: 'approved' },
    { role: 'faculty', organization_id: ORG, approval_status: 'approved' },
  ]),
  multiOrgFaculty: actor('m2', [
    { role: 'faculty', organization_id: OTHER_ORG, approval_status: 'approved' },
    { role: 'faculty', organization_id: ORG, approval_status: 'approved' },
  ]),
};

describe('transition(): authorized reviewers', () => {
  for (const [name, a] of Object.entries(authorizedActors)) {
    describe(name, () => {
      for (const action of ACTIONS) {
        for (const from of STATES) {
          const to = ALLOWED[action][from];
          it(`${from} --${action}--> ${to ?? 'INVALID'}`, () => {
            const r = transition(cert(from), action, a);
            if (to) {
              expect(r).toMatchObject({ ok: true, from, to, action });
              if (r.ok) {
                // credentials must be revoked exactly when leaving "verified"
                expect(r.revokeCredentials).toBe(from === 'verified');
              }
            } else {
              expect(r).toMatchObject({ ok: false, code: 'invalid_transition', status: 409 });
            }
          });
        }
      }
    });
  }

  it('rejects unknown current statuses', () => {
    expect(transition(cert('bogus'), 'approve', authorizedActors.faculty)).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
  });

  it('verified -> rejected and verified -> pending revoke credentials; pending -> verified does not', () => {
    const a = authorizedActors.faculty;
    expect(transition(cert('verified'), 'reject', a)).toMatchObject({ ok: true, revokeCredentials: true });
    expect(transition(cert('verified'), 'revert', a)).toMatchObject({ ok: true, revokeCredentials: true });
    expect(transition(cert('pending'), 'approve', a)).toMatchObject({ ok: true, revokeCredentials: false });
  });
});

describe('transition(): unauthorized actors are refused in every state/action', () => {
  const bad: Record<string, { actor: Actor; code: string }> = {
    student: { actor: actor('x1', [{ role: 'student', organization_id: ORG, approval_status: 'approved' }]), code: 'forbidden' },
    recruiter: { actor: actor('x2', [{ role: 'recruiter', organization_id: null, approval_status: 'approved' }]), code: 'forbidden' },
    noRoles: { actor: actor('x3', []), code: 'forbidden' },
    pendingFaculty: { actor: actor('x4', [{ role: 'faculty', organization_id: ORG, approval_status: 'pending' }]), code: 'forbidden' },
    deniedAdmin: { actor: actor('x5', [{ role: 'admin', organization_id: ORG, approval_status: 'denied' }]), code: 'forbidden' },
    pendingSuperAdmin: { actor: actor('x6', [{ role: 'super_admin', organization_id: null, approval_status: 'pending' }]), code: 'forbidden' },
    wrongOrgFaculty: { actor: actor('x7', [{ role: 'faculty', organization_id: OTHER_ORG, approval_status: 'approved' }]), code: 'wrong_org' },
    wrongOrgAdmin: { actor: actor('x8', [{ role: 'admin', organization_id: OTHER_ORG, approval_status: 'approved' }]), code: 'wrong_org' },
    // approved student role in the cert's org does not make a reviewer; the faculty row is in another org
    facultyElsewhereStudentHere: {
      actor: actor('x9', [
        { role: 'student', organization_id: ORG, approval_status: 'approved' },
        { role: 'faculty', organization_id: OTHER_ORG, approval_status: 'approved' },
      ]),
      code: 'wrong_org',
    },
    // faculty row pending in the right org, approved faculty elsewhere
    pendingHereApprovedElsewhere: {
      actor: actor('x10', [
        { role: 'faculty', organization_id: ORG, approval_status: 'pending' },
        { role: 'faculty', organization_id: OTHER_ORG, approval_status: 'approved' },
      ]),
      code: 'wrong_org',
    },
  };

  for (const [name, { actor: a, code }] of Object.entries(bad)) {
    for (const action of ACTIONS) {
      for (const from of STATES) {
        it(`${name}: ${from} --${action}--> refused (${code})`, () => {
          const r = transition(cert(from), action, a);
          expect(r).toMatchObject({ ok: false, code, status: 403 });
        });
      }
    }
  }
});

describe('transition(): self-review is forbidden, even for admins', () => {
  const selfRoles: Record<string, Actor['roles']> = {
    faculty: [{ role: 'faculty', organization_id: ORG, approval_status: 'approved' }],
    admin: [{ role: 'admin', organization_id: ORG, approval_status: 'approved' }],
    org_admin: [{ role: 'org_admin', organization_id: ORG, approval_status: 'approved' }],
    super_admin: [{ role: 'super_admin', organization_id: null, approval_status: 'approved' }],
  };
  for (const [name, roles] of Object.entries(selfRoles)) {
    for (const action of ACTIONS) {
      for (const from of STATES) {
        it(`${name} cannot ${action} own ${from} certificate`, () => {
          const r = transition(cert(from), action, actor(STUDENT, roles));
          expect(r).toMatchObject({ ok: false, code: 'self_review', status: 403 });
        });
      }
    }
  }
});

describe('helpers', () => {
  it('normalizeReviewStatus maps aliases to canonical statuses', () => {
    expect(normalizeReviewStatus('approved')).toBe('verified');
    expect(normalizeReviewStatus('approve')).toBe('verified');
    expect(normalizeReviewStatus('verified')).toBe('verified');
    expect(normalizeReviewStatus('rejected')).toBe('rejected');
    expect(normalizeReviewStatus('reject')).toBe('rejected');
    expect(normalizeReviewStatus('pending')).toBeNull();
    expect(normalizeReviewStatus('drop table')).toBeNull();
    expect(normalizeReviewStatus(undefined)).toBeNull();
    expect(normalizeReviewStatus(1)).toBeNull();
  });

  it('actorOrganizationIds only returns orgs of approved reviewer rows', () => {
    expect(actorOrganizationIds(authorizedActors.multiRole)).toEqual([ORG]);
    expect([...(actorOrganizationIds(authorizedActors.multiOrgFaculty) as string[])].sort()).toEqual([ORG, OTHER_ORG].sort());
    expect(actorOrganizationIds(authorizedActors.superAdminGlobal)).toBe('all');
    expect(
      actorOrganizationIds(actor('p', [{ role: 'faculty', organization_id: ORG, approval_status: 'pending' }]))
    ).toEqual([]);
  });
});
