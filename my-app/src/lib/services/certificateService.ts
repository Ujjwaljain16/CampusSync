/**
 * Certificate lifecycle service.
 *
 * `certificates.verification_status` is the single gate for issuing signed
 * credentials, so every change to it goes through the state machine below:
 *
 *   pending  --approve--> verified
 *   pending  --reject---> rejected
 *   verified --revert---> pending    (revokes credentials)
 *   verified --reject---> rejected   (revokes credentials)
 *   rejected --reopen---> pending
 *
 * `transition()` is pure. The helpers that follow it take a Supabase client (and
 * optional collaborators) as arguments so they can be tested with a fake client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { signCredential } from '@/lib/vc';
import { allocateStatusEntry, markCredentialsRevoked, recordStatusColumns, type StatusListDb } from '@/lib/statusList';
import { getIssuerDID } from '@/lib/envValidator';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CertificateStatus = 'pending' | 'verified' | 'rejected';
export type CertificateAction = 'approve' | 'reject' | 'revert' | 'reopen';

export const REVIEWER_ROLES = ['faculty', 'admin', 'org_admin', 'super_admin'] as const;
/** Roles that may delete other people's certificates (faculty may not). */
export const ADMIN_ROLES = ['admin', 'org_admin', 'super_admin'] as const;

export interface RoleRow {
  role: string;
  organization_id: string | null;
  approval_status?: string | null;
}

export interface Actor {
  id: string;
  /** All of the actor's user_roles rows (pending/denied rows are ignored by the rules). */
  roles: RoleRow[];
}

export interface CertificateSnapshot {
  id: string;
  student_id: string;
  organization_id: string | null;
  verification_status: CertificateStatus | string;
}

export type TransitionErrorCode = 'forbidden' | 'self_review' | 'wrong_org' | 'invalid_transition';

export type TransitionResult =
  | {
      ok: true;
      from: CertificateStatus;
      to: CertificateStatus;
      action: CertificateAction;
      /** Active credentials of this certificate must be revoked as part of the transition. */
      revokeCredentials: boolean;
    }
  | { ok: false; code: TransitionErrorCode; status: number; message: string };

const TRANSITIONS: Record<CertificateAction, Partial<Record<CertificateStatus, CertificateStatus>>> = {
  approve: { pending: 'verified' },
  reject: { pending: 'rejected', verified: 'rejected' },
  revert: { verified: 'pending' },
  reopen: { rejected: 'pending' },
};

const CREDENTIAL_REVOKING: ReadonlySet<string> = new Set(['verified->rejected', 'verified->pending']);

// ---------------------------------------------------------------------------
// Actor helpers
// ---------------------------------------------------------------------------

/** A role row counts only when its approval is not pending/denied/rejected. */
export function isApprovedRole(row: RoleRow): boolean {
  const s = row.approval_status;
  return s === undefined || s === null || s === 'approved';
}

/**
 * Does the actor hold one of `roles` (approved) that covers `organizationId`?
 * A super_admin row with a NULL organization covers every organization.
 */
export function actorHasRoleInOrg(
  actor: Actor,
  roles: readonly string[],
  organizationId: string | null
): boolean {
  return actor.roles.some(r => {
    if (!isApprovedRole(r) || !roles.includes(r.role)) return false;
    if (r.role === 'super_admin' && r.organization_id === null) return true;
    return organizationId !== null && r.organization_id === organizationId;
  });
}

/**
 * Organization ids the actor may act on with one of `roles`.
 * Returns 'all' for a global super_admin.
 */
export function actorOrganizationIds(actor: Actor, roles: readonly string[] = REVIEWER_ROLES): string[] | 'all' {
  const ids = new Set<string>();
  for (const r of actor.roles) {
    if (!isApprovedRole(r) || !roles.includes(r.role)) continue;
    if (r.role === 'super_admin' && r.organization_id === null) return 'all';
    if (r.organization_id) ids.add(r.organization_id);
  }
  return Array.from(ids);
}

/** Load all of the user's role rows (no `.single()`: users may hold several roles). */
export async function resolveActor(db: SupabaseClient, userId: string): Promise<Actor> {
  const { data, error } = await db
    .from('user_roles')
    .select('role, organization_id, approval_status')
    .eq('user_id', userId);
  if (error) {
    logger.error('[certificateService] Failed to load user roles', error);
    return { id: userId, roles: [] };
  }
  return { id: userId, roles: (data ?? []) as RoleRow[] };
}

// ---------------------------------------------------------------------------
// Status columns / privileged writer
// ---------------------------------------------------------------------------

/**
 * `certificates` has two CHECK-constrained status columns that must stay in sync:
 * verification_status (pending|verified|rejected) and status (pending|approved|rejected).
 */
export function legacyStatusFor(s: CertificateStatus): 'pending' | 'approved' | 'rejected' {
  return s === 'verified' ? 'approved' : s;
}

/**
 * Service-role client used for writes AFTER app-level authorization (the user-session
 * client is subject to RLS, which has no DELETE policy on certificates, makes
 * credential updates staff-only and does not cover super_admin on certificates).
 */
export async function getPrivilegedDb(): Promise<SupabaseClient> {
  const { createSupabaseAdminClient } = await import('@/lib/supabaseServer');
  return (await createSupabaseAdminClient()) as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

export function transition(
  certificate: CertificateSnapshot,
  action: CertificateAction,
  actor: Actor
): TransitionResult {
  const isReviewer = actor.roles.some(r => isApprovedRole(r) && (REVIEWER_ROLES as readonly string[]).includes(r.role));
  if (!isReviewer) {
    return { ok: false, code: 'forbidden', status: 403, message: 'Only approved faculty or administrators can review certificates' };
  }
  if (actor.id === certificate.student_id) {
    return { ok: false, code: 'self_review', status: 403, message: 'You cannot review your own certificate' };
  }
  if (!actorHasRoleInOrg(actor, REVIEWER_ROLES, certificate.organization_id)) {
    return { ok: false, code: 'wrong_org', status: 403, message: 'Certificate is outside your organization' };
  }

  const from = certificate.verification_status as CertificateStatus;
  const to = TRANSITIONS[action]?.[from];
  if (!to) {
    return {
      ok: false,
      code: 'invalid_transition',
      status: 409,
      message: `Cannot ${action} a certificate that is ${String(certificate.verification_status)}`,
    };
  }
  return { ok: true, from, to, action, revokeCredentials: CREDENTIAL_REVOKING.has(`${from}->${to}`) };
}

/** Normalise legacy / alias review inputs to the canonical target status. */
export function normalizeReviewStatus(input: unknown): 'verified' | 'rejected' | null {
  if (typeof input !== 'string') return null;
  switch (input.trim().toLowerCase()) {
    case 'verified':
    case 'approved':
    case 'approve':
      return 'verified';
    case 'rejected':
    case 'reject':
      return 'rejected';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Audit + notification (never fail the main operation)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  actorId: string;
  organizationId: string | null;
  action: string;
  targetId: string;
  details?: Record<string, unknown>;
}

/**
 * Insert an audit row using the column set shared by the certificate routes
 * (`actor_id, organization_id, action, target_id, details, created_at`).
 * Errors are logged, never thrown.
 */
export async function writeAudit(db: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await db.from('audit_logs').insert({
      actor_id: entry.actorId,
      organization_id: entry.organizationId,
      action: entry.action,
      target_id: entry.targetId,
      details: entry.details ?? {},
      created_at: new Date().toISOString(),
    });
    if (error) logger.error('[certificateService] Audit log insert failed', error);
  } catch (e) {
    logger.error('[certificateService] Audit log insert threw', e);
  }
}

export interface ReviewNotification {
  studentId: string;
  certificateTitle: string;
  institution: string;
  outcome: 'approved' | 'rejected';
}

export type Notifier = (n: ReviewNotification) => Promise<void>;

/** Default notifier: e-mails the student (best effort). */
export const defaultNotifier: Notifier = async n => {
  try {
    const [{ createSupabaseAdminClient }, { emailService }, { getBaseUrl }] = await Promise.all([
      import('@/lib/supabaseServer'),
      import('@/lib/emailService'),
      import('@/lib/envValidator'),
    ]);
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(n.studentId);
    if (error || !data?.user?.email) {
      logger.warn('[certificateService] No e-mail for student; skipping notification', { studentId: n.studentId });
      return;
    }
    const email = data.user.email;
    const payload = {
      studentName: data.user.user_metadata?.full_name || email.split('@')[0] || 'Student',
      certificateTitle: n.certificateTitle,
      institution: n.institution,
      portfolioUrl: `${getBaseUrl()}/public/portfolio/${n.studentId}`,
    };
    if (n.outcome === 'approved') await emailService.sendCertificateApproved(email, payload);
    else await emailService.sendCertificateRejected(email, payload);
  } catch (e) {
    logger.error('[certificateService] Failed to send notification', e);
  }
};

// ---------------------------------------------------------------------------
// Credential revocation
// ---------------------------------------------------------------------------

export interface RevokeResult {
  ok: boolean;
  count: number;
  ids: string[];
  error?: string;
}

/**
 * Revoke ALL active credentials issued for a certificate (no `.single()`).
 * Credentials are matched on `credential.credentialSubject.certificateId` (the
 * issue route stores no separate certificate_id column).
 */
export async function revokeAllCredentialsForCertificate(
  db: SupabaseClient,
  certificateId: string,
  reason = 'Certificate no longer verified'
): Promise<RevokeResult> {
  const now = new Date().toISOString();
  const run = (values: Record<string, unknown>) =>
    db
      .from('verifiable_credentials')
      .update(values)
      .eq('status', 'active')
      .contains('credential', { credentialSubject: { certificateId } })
      .select('id, credential');

  let { data, error } = await run({ status: 'revoked', revoked_at: now, revoked_reason: reason });
  // The optional revoked_* columns may not exist in every deployment: retry with status only.
  const code = (error as { code?: string } | null)?.code;
  if (error && (code === '42703' || code === 'PGRST204')) {
    logger.warn('[certificateService] revoked_* columns missing, revoking via status only');
    ({ data, error } = await run({ status: 'revoked' }));
  }

  if (error) {
    logger.error('[certificateService] Credential revocation failed', error);
    return { ok: false, count: 0, ids: [], error: error.message };
  }
  // verifiable_credentials.status is the single source of truth for revocation
  // (there is no revocation_list table).
  const revoked = (data ?? []) as Array<{ id: string; credential?: unknown }>;
  const ids = revoked.map(r => r.id);
  // Best effort: also flip the status-list bit of credentials that carry a credentialStatus entry.
  // Never fails the revocation; the status column above stays authoritative.
  await markCredentialsRevoked(revoked, db as unknown as StatusListDb);
  // --- transparency log (best-effort, no-op unless TRANSPARENCY_LOG_ENABLED=true) ---
  if (ids.length > 0 && process.env.TRANSPARENCY_LOG_ENABLED === 'true') {
    try {
      const { appendEventsSafely } = await import('@/lib/transparencyLog');
      await appendEventsSafely(ids.map(id => ({ type: 'credential.revoked' as const, credentialId: id, certificateId })));
    } catch { /* logging must never affect revocation */ }
  }
  // --- end transparency log ---
  return { ok: true, count: ids.length, ids };
}

// ---------------------------------------------------------------------------
// Transition application (DB)
// ---------------------------------------------------------------------------

export type ServiceFailure = { ok: false; status: number; code: string; error: string };

export interface ApplyParams {
  certificateId: string;
  action: CertificateAction;
  actor: Actor;
  notes?: string;
  metadataId?: string;
  /** 'batch' records batch_approve / batch_reject audit actions. */
  source?: 'single' | 'batch';
  notify?: Notifier;
  /** Privileged writer (tests inject a fake); defaults to the service-role client. */
  writeDb?: SupabaseClient;
}

export type ApplyResult =
  | {
      ok: true;
      certificateId: string;
      from: CertificateStatus;
      to: CertificateStatus;
      revokedCredentials: number;
    }
  | ServiceFailure;

const AUDIT_ACTION: Record<CertificateAction, { single: string; batch: string }> = {
  approve: { single: 'manual_approve', batch: 'batch_approve' },
  reject: { single: 'manual_reject', batch: 'batch_reject' },
  revert: { single: 'revert_approval', batch: 'revert_approval' },
  reopen: { single: 'reopen_certificate', batch: 'reopen_certificate' },
};

/**
 * Apply one transition: read, check the state machine, conditionally update
 * (guarded by the expected current status and the actor's organizations), revoke
 * credentials when needed, then audit + notify exactly once.
 */
export async function applyCertificateTransition(db: SupabaseClient, params: ApplyParams): Promise<ApplyResult> {
  const { certificateId, action, actor } = params;

  const { data: cert, error: readErr } = await db
    .from('certificates')
    .select('id, student_id, organization_id, verification_status, status, faculty_id, title, institution')
    .eq('id', certificateId)
    .maybeSingle();

  if (readErr) {
    logger.error('[certificateService] Failed to read certificate', readErr);
    return { ok: false, status: 500, code: 'db_error', error: 'Failed to load certificate' };
  }
  if (!cert) {
    return { ok: false, status: 404, code: 'not_found', error: 'Certificate not found' };
  }

  const decision = transition(cert as CertificateSnapshot, action, actor);
  if (!decision.ok) {
    // Hide existence of certificates in other organizations behind a 404.
    if (decision.code === 'wrong_org') {
      return { ok: false, status: 404, code: 'not_found', error: 'Certificate not found or not in your organization' };
    }
    return { ok: false, status: decision.status, code: decision.code, error: decision.message };
  }

  // Authorization is done (state machine + org check above); write with the privileged
  // client but keep the org scope and the expected current status in the WHERE clause.
  const writer = params.writeDb ?? (await getPrivilegedDb());
  const orgIds = actorOrganizationIds(actor, REVIEWER_ROLES);
  const reviewed = decision.to === 'verified' || decision.to === 'rejected';
  let query = writer
    .from('certificates')
    .update({
      verification_status: decision.to,
      status: legacyStatusFor(decision.to),
      faculty_id: reviewed ? actor.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', certificateId)
    .eq('verification_status', decision.from);
  if (orgIds !== 'all') query = query.in('organization_id', orgIds);
  const { data: updated, error: updateErr } = await query.select('id, verification_status');

  if (updateErr) {
    logger.error('[certificateService] Failed to update certificate', updateErr);
    return { ok: false, status: 500, code: 'db_error', error: 'Failed to update certificate' };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      status: 409,
      code: 'conflict',
      error: 'Certificate was changed by someone else or you are not allowed to modify it',
    };
  }

  let revokedCount = 0;
  if (decision.revokeCredentials) {
    const revoke = await revokeAllCredentialsForCertificate(
      writer,
      certificateId,
      params.notes || (action === 'revert' ? 'Approval reverted by reviewer' : 'Certificate rejected after verification')
    );
    if (!revoke.ok) {
      // Compensate: never leave a non-verified certificate with live credentials.
      const prev = cert as { status?: string | null; faculty_id?: string | null };
      const { data: restored, error: restoreErr } = await writer
        .from('certificates')
        .update({
          verification_status: decision.from,
          status: prev.status ?? legacyStatusFor(decision.from),
          faculty_id: prev.faculty_id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', certificateId)
        .eq('verification_status', decision.to)
        .select('id');
      if (restoreErr || !restored || restored.length === 0) {
        logger.error('[certificateService] CRITICAL: could not roll back status after failed revocation', {
          certificateId,
          restoreErr,
        });
      }
      return { ok: false, status: 500, code: 'revocation_failed', error: 'Failed to revoke credentials; no change made' };
    }
    revokedCount = revoke.count;
  }

  if (decision.to === 'verified' && typeof params.metadataId === 'string') {
    const { error: metaErr } = await writer
      .from('certificate_metadata')
      .update({ verification_method: 'manual' })
      .eq('id', params.metadataId)
      .eq('certificate_id', certificateId);
    if (metaErr) logger.error('[certificateService] Failed to update certificate metadata', metaErr);
  }

  await writeAudit(db, {
    actorId: actor.id,
    organizationId: (cert as CertificateSnapshot).organization_id,
    action: AUDIT_ACTION[action][params.source === 'batch' ? 'batch' : 'single'],
    targetId: certificateId,
    details: {
      reason: params.notes ?? null,
      metadataId: params.metadataId ?? null,
      previous_status: decision.from,
      new_status: decision.to,
      revoked_credentials: revokedCount,
    },
  });

  if (action === 'approve' || action === 'reject') {
    const notify = params.notify ?? defaultNotifier;
    try {
      await notify({
        studentId: (cert as CertificateSnapshot).student_id,
        certificateTitle: (cert as { title?: string }).title ?? '',
        institution: (cert as { institution?: string }).institution ?? '',
        outcome: action === 'approve' ? 'approved' : 'rejected',
      });
    } catch (e) {
      logger.error('[certificateService] Notifier threw', e);
    }
  }

  return { ok: true, certificateId, from: decision.from, to: decision.to, revokedCredentials: revokedCount };
}

// ---------------------------------------------------------------------------
// Credential issuance
// ---------------------------------------------------------------------------

export type IssueResult =
  | { ok: true; vc: Record<string, unknown> & { id: string }; reused: boolean }
  | ServiceFailure;

interface IssuableCertificate {
  id: string;
  student_id: string;
  organization_id: string | null;
  verification_status: string;
  title: string;
  institution: string;
  date_issued: string;
  description?: string | null;
}

/**
 * Issue (or re-use) the signed credential of a verified certificate.
 * Idempotent: if an ACTIVE credential already exists it is returned with `reused: true`.
 * Allowed callers: the owner student, or an approved reviewer of the certificate's org.
 */
export async function issueCredentialForCertificate(
  db: SupabaseClient,
  params: { certificateId: string; actor: Actor; writeDb?: SupabaseClient }
): Promise<IssueResult> {
  const { certificateId, actor } = params;

  const { data, error: certErr } = await db
    .from('certificates')
    .select('*')
    .eq('id', certificateId)
    .maybeSingle();
  if (certErr) {
    logger.error('[certificateService] Failed to read certificate for issuance', certErr);
    return { ok: false, status: 500, code: 'db_error', error: 'Failed to load certificate' };
  }
  if (!data) return { ok: false, status: 404, code: 'not_found', error: 'Certificate not found' };
  const cert = data as IssuableCertificate;

  if (cert.verification_status !== 'verified') {
    return { ok: false, status: 403, code: 'not_verified', error: 'Only verified certificates can be issued as credentials' };
  }

  const isOwner = cert.student_id === actor.id;
  if (!isOwner && !actorHasRoleInOrg(actor, REVIEWER_ROLES, cert.organization_id)) {
    return { ok: false, status: 403, code: 'forbidden', error: 'Forbidden to issue for another user' };
  }

  const findActive = async () => {
    const { data: rows, error } = await db
      .from('verifiable_credentials')
      .select('id, credential, created_at')
      .eq('status', 'active')
      .contains('credential', { credentialSubject: { certificateId } })
      .order('created_at', { ascending: true });
    return { rows: (rows ?? []) as Array<{ id: string; credential: Record<string, unknown>; created_at?: string }>, error };
  };

  const existing = await findActive();
  if (existing.error) {
    logger.error('[certificateService] Failed to look up existing credentials', existing.error);
    return { ok: false, status: 500, code: 'db_error', error: 'Failed to look up existing credentials' };
  }
  if (existing.rows.length > 0) {
    const first = existing.rows[0];
    return { ok: true, vc: { ...first.credential, id: first.id }, reused: true };
  }

  const issuerDid = getIssuerDID();

  // Revocation status-list slot (only when VC_STATUS_LIST_ENABLED=true; null otherwise or when
  // storage is unavailable, in which case the credential is issued without credentialStatus).
  const statusSlot = await allocateStatusEntry();

  // The proof's verificationMethod is `${issuerDid}#${kid}` of the key that actually signs,
  // so it resolves to a key in /.well-known/did.json.
  const vc = await signCredential({
    issuerDid,
    credentialStatus: statusSlot?.entry,
    credential: {
      credentialSubject: {
        id: cert.student_id,
        certificateId: cert.id,
        title: cert.title,
        institution: cert.institution,
        dateIssued: cert.date_issued,
        description: cert.description ?? undefined,
      },
    },
  });

  const now = new Date().toISOString();
  const { error: insertErr } = await db.from('verifiable_credentials').insert({
    id: vc.id,
    student_id: cert.student_id, // the certificate owner, not the issuing actor
    issuer: vc.issuer,
    issuance_date: vc.issuanceDate,
    credential: vc,
    status: 'active',
    created_at: now,
  });
  if (insertErr) {
    logger.error('[certificateService] Failed to store credential', insertErr);
    return { ok: false, status: 500, code: 'db_error', error: 'Failed to store credential' };
  }
  if (statusSlot) await recordStatusColumns(vc.id!, statusSlot);

  // Concurrent-issue guard: the oldest active credential wins, losers revoke themselves.
  const after = await findActive();
  if (!after.error && after.rows.length > 1) {
    const sorted = [...after.rows].sort((a, b) =>
      `${a.created_at ?? ''}|${a.id}`.localeCompare(`${b.created_at ?? ''}|${b.id}`)
    );
    const winner = sorted[0];
    if (winner.id !== vc.id) {
      const writer = params.writeDb ?? (await getPrivilegedDb());
      const { error: dupErr } = await writer
        .from('verifiable_credentials')
        .update({ status: 'revoked', revoked_at: now, revoked_reason: 'Duplicate issuance' })
        .eq('id', vc.id)
        .select('id');
      if (dupErr) logger.error('[certificateService] Failed to revoke duplicate credential', dupErr);
      else await markCredentialsRevoked([{ id: vc.id, credential: vc }]);
      return { ok: true, vc: { ...winner.credential, id: winner.id }, reused: true };
    }
  }

  await writeAudit(db, {
    actorId: actor.id,
    organizationId: cert.organization_id,
    action: 'issue_vc',
    targetId: certificateId,
    details: { credentialId: vc.id },
  });

  // --- transparency log (best-effort, no-op unless TRANSPARENCY_LOG_ENABLED=true) ---
  if (process.env.TRANSPARENCY_LOG_ENABLED === 'true') {
    try {
      const { appendEventSafely } = await import('@/lib/transparencyLog');
      await appendEventSafely({
        type: 'credential.issued',
        credentialId: vc.id as string,
        certificateId: cert.id,
        organizationId: cert.organization_id,
        studentId: cert.student_id,
      });
    } catch { /* logging must never affect issuance */ }
  }
  // --- end transparency log ---

  return { ok: true, vc: vc as unknown as Record<string, unknown> & { id: string }, reused: false };
}
