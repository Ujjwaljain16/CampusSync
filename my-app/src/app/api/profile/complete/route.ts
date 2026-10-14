import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { enforceRateLimit, RateLimitPresets } from '@/lib/rateLimit';
import { isMissingColumnError, VISIBILITY_COLUMNS } from '@/lib/privacy/visibility';
import { isPlainObject } from '@/lib/privacy/sanitize';

/**
 * Own-profile completion + privacy settings.
 *
 * GET  -> { data: profile & { public_portfolio_enabled, recruiter_share_contact } }
 *         (the two booleans are always present and default to false)
 * POST -> whitelisted fields only:
 *         full_name (required), university, major, location (strings),
 *         graduation_year (integer 1950..current+10), gpa (number 0..10),
 *         public_portfolio_enabled, recruiter_share_contact (booleans).
 *         Responds { ok: true, data: { ... }, warnings? }.
 */

const MAX_TEXT = 200;
const MAX_NAME = 120;

type RoleRow = { role: string | null; organization_id: string | null; approval_status?: string | null };

function optionalText(value: unknown, field: string): { value?: string; error?: string } {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string') return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (trimmed.length > MAX_TEXT) return { error: `${field} must be at most ${MAX_TEXT} characters` };
  return trimmed ? { value: trimmed } : {};
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, 'profile-complete-read', RateLimitPresets.relaxed);
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (profileError) {
      console.error('[profile/complete] GET failed', profileError);
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const record = profile as Record<string, unknown>;
    return NextResponse.json({
      data: {
        ...record,
        public_portfolio_enabled: record.public_portfolio_enabled === true,
        recruiter_share_contact: record.recruiter_share_contact === true,
      },
    });
  } catch (error) {
    console.error('[profile/complete] GET error', error);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!isPlainObject(body)) return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });

    const { full_name, graduation_year, gpa, public_portfolio_enabled, recruiter_share_contact } = body;

    if (typeof full_name !== 'string' || full_name.trim().length === 0) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }
    if (full_name.trim().length > MAX_NAME) {
      return NextResponse.json({ error: `Full name must be at most ${MAX_NAME} characters` }, { status: 400 });
    }

    const university = optionalText(body.university, 'university');
    const major = optionalText(body.major, 'major');
    const location = optionalText(body.location, 'location');
    const textError = university.error ?? major.error ?? location.error;
    if (textError) return NextResponse.json({ error: textError }, { status: 400 });

    let graduationYear: number | undefined;
    if (graduation_year !== undefined && graduation_year !== null && graduation_year !== '') {
      const n = typeof graduation_year === 'number' ? graduation_year : typeof graduation_year === 'string' ? Number(graduation_year.trim()) : NaN;
      const maxYear = new Date().getFullYear() + 10;
      if (!Number.isInteger(n) || n < 1950 || n > maxYear) {
        return NextResponse.json({ error: `graduation_year must be a whole year between 1950 and ${maxYear}` }, { status: 400 });
      }
      graduationYear = n;
    }

    let gpaValue: number | undefined;
    if (gpa !== undefined && gpa !== null && gpa !== '') {
      const n = typeof gpa === 'number' ? gpa : typeof gpa === 'string' ? Number(gpa.trim()) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 10) {
        return NextResponse.json({ error: 'gpa must be a number between 0 and 10' }, { status: 400 });
      }
      gpaValue = n;
    }

    for (const [key, value] of [
      ['public_portfolio_enabled', public_portfolio_enabled],
      ['recruiter_share_contact', recruiter_share_contact],
    ] as const) {
      if (value !== undefined && typeof value !== 'boolean') {
        return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 });
      }
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const limited = enforceRateLimit(request, 'profile-complete-write', RateLimitPresets.standard, user.id);
    if (limited) return limited;

    // Roles (a user may hold several): used only to find the organisation. profiles has no role column;
    // authorization comes from user_roles alone.
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role, organization_id, approval_status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (roleError) {
      console.error('[profile/complete] role lookup failed', roleError);
      return NextResponse.json({ error: 'Unable to verify account' }, { status: 500 });
    }
    const roles = (roleData ?? []) as RoleRow[];
    const orgRow = roles.find((r) => r.role === 'student' && r.organization_id) ?? roles.find((r) => r.organization_id);

    const core: Record<string, unknown> = { id: user.id, full_name: full_name.trim() };
    if (orgRow?.organization_id) core.organization_id = orgRow.organization_id;
    if (university.value) core.university = university.value;
    if (major.value) core.major = major.value;
    if (location.value) core.location = location.value;
    if (graduationYear !== undefined) core.graduation_year = graduationYear;
    if (gpaValue !== undefined) core.gpa = gpaValue;

    const flags: Record<string, boolean> = {};
    if (typeof public_portfolio_enabled === 'boolean') flags[VISIBILITY_COLUMNS.publicPortfolioEnabled] = public_portfolio_enabled;
    if (typeof recruiter_share_contact === 'boolean') flags[VISIBILITY_COLUMNS.recruiterShareContact] = recruiter_share_contact;
    const hasFlags = Object.keys(flags).length > 0;

    const warnings: Array<{ code: string; message: string }> = [];
    let saved: Record<string, unknown> = { ...core, ...flags };

    let { error: upsertError } = await supabase.from('profiles').upsert({ ...core, ...flags }, { onConflict: 'id' });
    if (upsertError && hasFlags && isMissingColumnError(upsertError)) {
      // Privacy columns not migrated yet: save the profile, but tell the client the settings were NOT stored.
      console.warn('[profile/complete] privacy columns missing; saving profile without them');
      saved = { ...core };
      ({ error: upsertError } = await supabase.from('profiles').upsert(core, { onConflict: 'id' }));
      if (!upsertError) {
        warnings.push({
          code: 'privacy_settings_unavailable',
          message: 'Privacy settings could not be saved yet; your profile stays private.',
        });
      }
    }
    if (upsertError) {
      console.error('[profile/complete] upsert failed', upsertError);
      return NextResponse.json({ error: 'Profile update failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...saved,
        public_portfolio_enabled: saved.public_portfolio_enabled === true,
        recruiter_share_contact: saved.recruiter_share_contact === true,
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    console.error('[profile/complete] POST error', error);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
