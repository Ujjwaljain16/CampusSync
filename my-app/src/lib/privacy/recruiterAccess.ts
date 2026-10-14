/**
 * Shared guard for recruiter routes that touch student data.
 *
 * - authenticates the caller (session cookie)
 * - requires an APPROVED platform-level recruiter row and at least one APPROVED
 *   organisation-level recruiter row (via getRecruiterContext)
 * - validates the optional X-Organization-ID header
 * - applies a per-user rate limit
 * - converts every thrown error / thrown Response into a returned Response
 *   with a stable message (details are logged server-side only)
 *
 * The service-role client handed to handlers BYPASSES RLS. Handlers must always
 * add explicit organisation + student filters (see `access.orgIds`).
 */

import type { NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabaseServer';
import { getRecruiterContext, getRequestedOrgId } from '@/lib/api/utils/recruiter';
import { apiError } from '@/lib/api/utils/response';
import { enforceRateLimit, type RateLimitConfig } from '@/lib/rateLimit';
import { isUuid } from './sanitize';

export interface RecruiterAccess {
  user: User;
  /** Organisations the query must be restricted to (selected org, else all approved orgs). */
  orgIds: string[];
  /** Organisation explicitly selected via X-Organization-ID, if any. */
  selectedOrgId: string | null;
  /** Service-role client (bypasses RLS) - always filter by orgIds. */
  admin: SupabaseClient;
}

export type RecruiterHandler<C> = (req: NextRequest, access: RecruiterAccess, routeCtx: C) => Promise<Response>;

export interface RecruiterRouteOptions {
  /** Rate-limit bucket name, e.g. 'recruiter-search'. */
  scope: string;
  rateLimit: RateLimitConfig;
}

/** Resolve the approved-recruiter access for the current request, or a Response to return. */
export async function resolveRecruiterAccess(
  req: NextRequest
): Promise<{ ok: true; access: RecruiterAccess } | { ok: false; response: Response }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, response: apiError.unauthorized('Authentication required') };
  }

  const requestedOrgId = getRequestedOrgId(req);
  if (requestedOrgId !== null && !isUuid(requestedOrgId)) {
    return { ok: false, response: apiError.badRequest('Invalid organization id') };
  }

  // Platform-level recruiter row must itself be approved.
  const { data: platformRow, error: platformError } = await supabase
    .from('user_roles')
    .select('approval_status')
    .eq('user_id', user.id)
    .eq('role', 'recruiter')
    .is('organization_id', null)
    .maybeSingle();
  if (platformError) {
    console.error('[recruiterAccess] platform role lookup failed', platformError);
    return { ok: false, response: apiError.internal('Unable to verify recruiter access') };
  }
  if (!platformRow || platformRow.approval_status !== 'approved') {
    return { ok: false, response: apiError.forbidden('Recruiter account is not approved') };
  }

  const context = await getRecruiterContext(user, requestedOrgId); // throws a 403 Response if no access
  if (context.accessibleOrganizations.length === 0) {
    return { ok: false, response: apiError.forbidden('No approved organization access') };
  }
  const orgIds = context.selectedOrganization ? [context.selectedOrganization] : context.accessibleOrganizations;

  const admin = await createSupabaseAdminClient();
  return { ok: true, access: { user, orgIds, selectedOrgId: context.selectedOrganization, admin } };
}

/** Wrap a recruiter handler with auth, approval, rate limiting and error containment. */
export function recruiterRoute<C = unknown>(options: RecruiterRouteOptions, handler: RecruiterHandler<C>) {
  return async (req: NextRequest, routeCtx: C): Promise<Response> => {
    try {
      const resolved = await resolveRecruiterAccess(req);
      if (!resolved.ok) return resolved.response;

      const limited = enforceRateLimit(req, options.scope, options.rateLimit, resolved.access.user.id);
      if (limited) return limited;

      return await handler(req, resolved.access, routeCtx);
    } catch (err) {
      if (err instanceof Response) return err;
      console.error(`[${options.scope}] unhandled error`, err);
      return apiError.internal('Internal server error');
    }
  };
}

/** Parse a JSON object body; returns a 400 Response for anything else. */
export async function readJsonObject(
  req: Request
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return { ok: false, response: apiError.badRequest('Invalid JSON body') };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, response: apiError.badRequest('Request body must be a JSON object') };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

/**
 * Map each given user id to the organisation in which they are an APPROVED
 * student, restricted to `orgIds`. Ids that are not eligible are absent.
 */
export async function getApprovedStudentOrgs(
  admin: SupabaseClient,
  studentIds: string[],
  orgIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (studentIds.length === 0 || orgIds.length === 0) return result;
  const { data, error } = await admin
    .from('user_roles')
    .select('user_id, organization_id')
    .in('user_id', studentIds)
    .eq('role', 'student')
    .eq('approval_status', 'approved')
    .in('organization_id', orgIds);
  if (error) {
    throw new Error(`student eligibility lookup failed: ${error.message ?? 'unknown'}`);
  }
  for (const row of (data ?? []) as Array<{ user_id: string; organization_id: string | null }>) {
    if (row.organization_id && !result.has(row.user_id)) result.set(row.user_id, row.organization_id);
  }
  return result;
}
