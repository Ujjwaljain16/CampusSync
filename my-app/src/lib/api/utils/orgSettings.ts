/**
 * Allow-listed, merge-based updates for organizations.settings / .branding.
 *
 * Previously PATCH accepted arbitrary JSON for `settings` / `branding` and
 * REPLACED the stored object, letting a tenant admin erase or forge any key
 * (allowed_email_domains, SSO flags, ...). Now only known keys with validated
 * values are accepted and they are merged into what is already stored.
 */

import { validateDomain } from './domains';

type Json = Record<string, unknown>;

/** Columns every member may see (public bits only: no contact data, no settings). */
export const PUBLIC_ORG_COLUMNS = 'id, name, slug, type, branding, is_active, is_verified';
/** Extra columns for admins of the organization. */
export const ADMIN_ORG_COLUMNS =
  PUBLIC_ORG_COLUMNS +
  ', email, phone, address, website, subdomain, custom_domain, settings, subscription, created_at, updated_at';

export type PatchResult<T> = { ok: true; value: T } | { ok: false; error: string };

const FEATURE_KEYS = [
  'document_verification',
  'certificate_issuance',
  'student_profiles',
  'recruiter_access',
  'analytics',
] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isHttpsUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 2048) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate a settings patch. Tenant (org) admins may change presentation and
 * feature flags; only super admins may touch SSO and e-mail domain settings.
 * `allowed_email_domains` is returned normalized; the caller must still run
 * the cross-organization conflict check before persisting it.
 */
export function sanitizeSettingsPatch(
  input: unknown,
  opts: { isSuperAdmin: boolean }
): PatchResult<Json> {
  if (!isPlainObject(input)) return { ok: false, error: 'settings must be an object' };

  const out: Json = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case 'timezone':
      case 'date_format':
      case 'language':
        if (typeof value !== 'string' || !value || value.length > 64) {
          return { ok: false, error: `settings.${key} must be a short string` };
        }
        out[key] = value;
        break;
      case 'require_email_verification':
        if (typeof value !== 'boolean') return { ok: false, error: `settings.${key} must be a boolean` };
        out[key] = value;
        break;
      case 'features': {
        if (!isPlainObject(value)) return { ok: false, error: 'settings.features must be an object' };
        const features: Json = {};
        for (const [fk, fv] of Object.entries(value)) {
          if (!(FEATURE_KEYS as readonly string[]).includes(fk) || typeof fv !== 'boolean') {
            return { ok: false, error: `settings.features.${fk} is not allowed` };
          }
          features[fk] = fv;
        }
        out.features = features;
        break;
      }
      case 'enable_sso':
      case 'sso_provider':
      case 'allowed_email_domains': {
        if (!opts.isSuperAdmin) {
          return { ok: false, error: `settings.${key} can only be changed by a super admin` };
        }
        if (key === 'enable_sso') {
          if (typeof value !== 'boolean') return { ok: false, error: 'settings.enable_sso must be a boolean' };
          out[key] = value;
        } else if (key === 'sso_provider') {
          if (typeof value !== 'string' || value.length > 64) {
            return { ok: false, error: 'settings.sso_provider must be a short string' };
          }
          out[key] = value;
        } else {
          if (!Array.isArray(value) || value.length > 50) {
            return { ok: false, error: 'settings.allowed_email_domains must be an array of at most 50 domains' };
          }
          const domains: string[] = [];
          for (const d of value) {
            const check = validateDomain(d);
            if (!check.ok) return { ok: false, error: check.error };
            if (!domains.includes(check.domain)) domains.push(check.domain);
          }
          out.allowed_email_domains = domains;
        }
        break;
      }
      default:
        return { ok: false, error: `settings.${key} is not an editable setting` };
    }
  }
  return { ok: true, value: out };
}

export function sanitizeBrandingPatch(input: unknown): PatchResult<Json> {
  if (!isPlainObject(input)) return { ok: false, error: 'branding must be an object' };
  const out: Json = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case 'primary_color':
      case 'secondary_color':
      case 'accent_color':
        if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
          return { ok: false, error: `branding.${key} must be a hex color` };
        }
        out[key] = value;
        break;
      case 'logo_url':
      case 'favicon_url':
        if (!isHttpsUrl(value)) return { ok: false, error: `branding.${key} must be an https URL` };
        out[key] = value;
        break;
      default:
        return { ok: false, error: `branding.${key} is not an editable setting` };
    }
  }
  return { ok: true, value: out };
}

/** Shallow merge with one nested level for `features`; never drops existing keys. */
export function mergeJson(existing: unknown, patch: Json): Json {
  const base: Json = isPlainObject(existing) ? { ...existing } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(base[k])) {
      base[k] = { ...(base[k] as Json), ...v };
    } else {
      base[k] = v;
    }
  }
  return base;
}
