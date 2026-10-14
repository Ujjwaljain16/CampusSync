// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { harness, req } from '../helpers/supabaseHarness';
import { uuid } from '../helpers/fakeSupabase';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as dashboardGET } from '@/app/api/analytics/dashboard/route';
import { GET as facultyGET } from '@/app/api/analytics/faculty/route';
import { detectMethod, scoreOf } from '@/lib/analytics/certificates';

const ORG_A = uuid(1);
const ORG_B = uuid(2);
const ADMIN_A = uuid(10);
const FACULTY_A = uuid(14);
const SUPER = uuid(12);
const STUDENT = uuid(20);

const json = async (res: Response) => (await res.json()) as Record<string, any>;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

let certSeq = 0;
function cert(org: string, extra: Record<string, unknown> = {}) {
  return {
    id: uuid(7000 + ++certSeq),
    student_id: STUDENT,
    organization_id: org,
    title: 'T',
    institution: 'MIT',
    verification_status: 'pending',
    created_at: hoursAgo(2),
    confidence_score: null,
    auto_approved: false,
    verification_method: null,
    verification_details: null,
    ...extra,
  };
}

function role(userId: string, r: string, org: string | null) {
  harness.db.seed('user_roles', [
    { id: uuid(5000 + Math.floor(Math.random() * 1e6)), user_id: userId, role: r, organization_id: org, approval_status: 'approved', is_primary_admin: false, created_at: '2026-02-01T00:00:00Z' },
  ]);
}

beforeEach(() => {
  harness.reset();
  certSeq = 0;
  harness.db.seed('organizations', [
    { id: ORG_A, name: 'A', is_active: true, created_at: '2026-01-01', settings: {}, primary_admin_id: null },
    { id: ORG_B, name: 'B', is_active: true, created_at: '2026-01-02', settings: {} },
  ]);
  role(SUPER, 'super_admin', null);
  role(ADMIN_A, 'admin', ORG_A);
  role(FACULTY_A, 'faculty', ORG_A);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('analytics helpers', () => {
  it('detectMethod prefers the recorded method, then the stored details thresholds', () => {
    expect(detectMethod('qr_verification', null)).toBe('qr_verified');
    expect(detectMethod(null, { qr_verification: { verified: true } })).toBe('qr_verified');
    expect(detectMethod(null, { logo_match: { score: 0.81 } })).toBe('logo_match');
    expect(detectMethod(null, { logo_match: { score: 0.8 } })).toBeNull();
    expect(detectMethod(null, { template_match: { score: 0.61 } })).toBe('template_match');
    expect(detectMethod(null, { template_match: { score: 0.5 } })).toBeNull();
    expect(detectMethod(null, null)).toBeNull();
  });

  it('scoreOf tolerates numeric strings and missing values', () => {
    expect(scoreOf({ confidence_score: 0.9 })).toBe(0.9);
    expect(scoreOf({ confidence_score: '0.75' })).toBe(0.75);
    expect(scoreOf({ confidence_score: null })).toBeNull();
  });
});

describe('GET /api/analytics/dashboard (certificates only)', () => {
  it('computes counts, confidence, methods and institutions from certificates', async () => {
    harness.db.seed('certificates', [
      cert(ORG_A, { verification_status: 'verified', confidence_score: 0.9, auto_approved: true, verification_details: { qr_verification: { verified: true } } }),
      cert(ORG_A, { verification_status: 'verified', confidence_score: 0.7, verification_details: { logo_match: { score: 0.9 } } }),
      cert(ORG_A, { verification_status: 'pending', verification_method: 'template_match' }),
      cert(ORG_A, { verification_status: 'rejected', institution: 'Stanford' }),
      cert(ORG_B, { verification_status: 'verified', confidence_score: 0.1 }), // foreign org: excluded
      cert(ORG_A, { created_at: new Date(Date.now() - 200 * 86400_000).toISOString() }), // outside range
    ]);
    harness.signIn(ADMIN_A);
    const res = await dashboardGET(req('/api/analytics/dashboard?range=30d'));
    expect(res.status).toBe(200);
    const d = (await json(res)).data;
    expect(d).toMatchObject({
      totalCertificates: 4,
      verifiedCertificates: 2,
      pendingCertificates: 1,
      rejectedCertificates: 1,
      autoApprovedCertificates: 1,
      manualReviewCertificates: 3,
    });
    expect(d.averageConfidenceScore).toBeCloseTo(0.8, 5);
    expect(d.verificationMethods).toEqual({ qr_verified: 1, logo_match: 1, template_match: 1, manual_review: 1 });
    expect(d.topInstitutions).toEqual([
      { institution: 'MIT', count: 3, verified: 2 },
      { institution: 'Stanford', count: 1, verified: 0 },
    ]);
    expect(d.dailyStats).toHaveLength(30);
    const today = d.dailyStats.reduce((s: number, x: any) => s + x.certificates, 0);
    expect(today).toBe(4);
    expect(d.dailyStats.reduce((s: number, x: any) => s + x.verified, 0)).toBe(2);
    expect(d.dailyStats.reduce((s: number, x: any) => s + x.auto_approved, 0)).toBe(1);
    expect(d.systemPerformance).toEqual({ available: false, averageProcessingTime: null, successRate: null, errorRate: null });
  });

  it('reports the average confidence as null when nothing is scored', async () => {
    harness.db.seed('certificates', [cert(ORG_A)]);
    harness.signIn(ADMIN_A);
    const d = (await json(await dashboardGET(req('/api/analytics/dashboard')))).data;
    expect(d.totalCertificates).toBe(1);
    expect(d.averageConfidenceScore).toBeNull();
  });

  it('never touches the dropped tables', async () => {
    harness.db.seed('certificates', [cert(ORG_A)]);
    const seen: string[] = [];
    const orig = harness.db.client.bind(harness.db);
    harness.db.client = (id: string | null) => {
      const c = orig(id);
      const from = c.from.bind(c);
      c.from = (t: string) => (seen.push(t), from(t));
      return c;
    };
    harness.signIn(ADMIN_A);
    await dashboardGET(req('/api/analytics/dashboard'));
    expect(seen).not.toContain('verification_results');
    expect(seen).not.toContain('certificate_metadata');
    expect(seen).not.toContain('document_metadata');
  });

  it('fails with a 500 (not an empty success) when the certificates query fails', async () => {
    harness.db.failures['certificates.select'] = { code: 'XX000', message: 'column verification_details does not exist' };
    harness.signIn(ADMIN_A);
    const res = await dashboardGET(req('/api/analytics/dashboard'));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBeTruthy();
    expect(body.data).toBeUndefined();
  });

  it('pages through more than 1000 certificates', async () => {
    const rows = Array.from({ length: 1500 }, () => cert(ORG_A));
    harness.db.seed('certificates', rows);
    harness.signIn(ADMIN_A);
    const d = (await json(await dashboardGET(req('/api/analytics/dashboard')))).data;
    expect(d.totalCertificates).toBe(1500);
  });

  it('keeps organization scoping: an admin of another org is refused; a super admin can pick one', async () => {
    harness.db.seed('certificates', [cert(ORG_A), cert(ORG_B), cert(ORG_B)]);
    harness.signIn(ADMIN_A);
    expect((await dashboardGET(req('/api/analytics/dashboard', { headers: { 'X-Organization-ID': ORG_B } }))).status).toBe(403);

    harness.signIn(SUPER);
    const picked = (await json(await dashboardGET(req('/api/analytics/dashboard', { headers: { 'X-Organization-ID': ORG_B } })))).data;
    expect(picked.totalCertificates).toBe(2);
    const all = (await json(await dashboardGET(req('/api/analytics/dashboard')))).data;
    expect(all.totalCertificates).toBe(3);
  });
});

describe('GET /api/analytics/faculty (certificates only)', () => {
  it('derives overview, distribution, methods and quality metrics from certificates', async () => {
    harness.db.seed('certificates', [
      cert(ORG_A, { verification_status: 'verified', confidence_score: 0.95, auto_approved: true, verification_method: 'qr_verification' }),
      cert(ORG_A, { verification_status: 'verified', confidence_score: 0.8 }),
      cert(ORG_A, { verification_status: 'pending', confidence_score: 0.5, verification_details: { template_match: { score: 0.7 } } }),
      cert(ORG_A, { verification_status: 'rejected' }),
      cert(ORG_B, { confidence_score: 0.99, auto_approved: true }), // foreign org
    ]);
    harness.signIn(FACULTY_A);
    const res = await facultyGET(req('/api/analytics/faculty'));
    expect(res.status).toBe(200);
    const d = (await json(res)).data;
    expect(d.overview).toMatchObject({ totalCertificates: 4, autoApproved: 1, pending: 1, verified: 2, rejected: 1, autoApprovalRate: 25 });
    expect(d.overview.averageConfidence).toBeCloseTo(0.75, 3);
    expect(d.confidenceDistribution).toEqual({ high: 1, medium: 1, low: 1 });
    expect(d.verificationMethods).toEqual({ qr_verified: 1, logo_match: 0, template_match: 1, ai_confidence: 1, manual_review: 1 });
    expect(d.ocrMetrics).toMatchObject({ totalExtractions: 3, highQuality: 1, mediumQuality: 1, lowQuality: 1 });
    expect(d.ocrMetrics.successRate).toBeCloseTo(66.67, 1);
    expect(d.confidencePercentiles.p50).toBe(0.8);
    expect(d.topInstitutions).toEqual([{ institution: 'MIT', count: 4 }]);
    const days = Object.values(d.dailyActivity) as any[];
    expect(days.reduce((s, x) => s + x.total, 0)).toBe(4);
    expect(Object.values(d.confidenceTrend as Record<string, any>).reduce((s, x: any) => s + x.count, 0)).toBe(3);
  });

  it('omits the score-based sections and reports null confidence when nothing is scored', async () => {
    harness.db.seed('certificates', [cert(ORG_A)]);
    harness.signIn(FACULTY_A);
    const d = (await json(await facultyGET(req('/api/analytics/faculty')))).data;
    expect(d.overview.totalCertificates).toBe(1);
    expect(d.overview.averageConfidence).toBeNull();
    expect(d.ocrMetrics).toBeUndefined();
    expect(d.confidencePercentiles).toBeUndefined();
    expect(d.verificationMethods.manual_review).toBe(1);
  });

  it('never touches the dropped tables', async () => {
    harness.db.seed('certificates', [cert(ORG_A)]);
    const seen: string[] = [];
    const orig = harness.db.client.bind(harness.db);
    harness.db.client = (id: string | null) => {
      const c = orig(id);
      const from = c.from.bind(c);
      c.from = (t: string) => (seen.push(t), from(t));
      return c;
    };
    harness.signIn(FACULTY_A);
    await facultyGET(req('/api/analytics/faculty'));
    expect(seen).not.toContain('document_metadata');
    expect(seen).not.toContain('certificate_metadata');
    expect(seen).not.toContain('verification_results');
  });

  it('fails with a 500 when the certificates query fails', async () => {
    harness.db.failures['certificates.select'] = { code: 'XX000', message: 'boom' };
    harness.signIn(FACULTY_A);
    const res = await facultyGET(req('/api/analytics/faculty'));
    expect(res.status).toBe(500);
    expect((await json(res)).data).toBeUndefined();
  });

  it('refuses a faculty member of another organization', async () => {
    harness.signIn(FACULTY_A);
    const res = await facultyGET(req('/api/analytics/faculty', { headers: { 'X-Organization-ID': ORG_B } }));
    expect(res.status).toBe(403);
  });
});
