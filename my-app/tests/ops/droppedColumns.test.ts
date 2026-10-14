// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards for the schema cleanup (migration step 08 drops these). The route-level behaviour is covered
 * by the API tests; these checks cover the pieces that cannot be exercised without a database
 * (the one-off CLI script, the shared TypeScript types, the admin UI).
 */
const read = (p: string) => readFileSync(p, 'utf8');

describe('scripts/setup-superadmin.mjs', () => {
  const src = read('scripts/setup-superadmin.mjs');

  it('does not use the dropped super_admin_audit table or profiles.role', () => {
    expect(src).not.toContain('super_admin_audit');
    // no `role:` key other than the user_roles writes ('super_admin' role assignment)
    const profileBlocks = src.split(".from('profiles')").slice(1).map((b) => b.slice(0, 400));
    expect(profileBlocks.length).toBeGreaterThan(0);
    for (const block of profileBlocks) expect(block).not.toMatch(/\brole\s*:/);
  });

  it('writes the canonical audit_logs shape and treats a failed insert as a warning', () => {
    expect(src).toContain(".from('audit_logs').insert({");
    const insert = src.slice(src.indexOf(".from('audit_logs').insert({"));
    const block = insert.slice(0, insert.indexOf('});'));
    for (const col of ['actor_id', 'organization_id', 'action', 'target_type', 'target_id', 'details', 'created_at']) {
      expect(block).toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(block).not.toMatch(/\buser_id\b|\badmin_id\b/);
    expect(src).toContain("'superadmin_created'");
    expect(src).toContain("'superadmin_upgraded'");
    expect(src).toContain("via: 'setup-script'");
    expect(src).toMatch(/Warning: Failed to create audit log/);
  });
});

describe('dropped columns are gone from the shared types and UI', () => {
  it('organizations.usage_stats is not in src/types.ts', () => {
    const types = read('src/types.ts');
    expect(types).not.toContain('usage_stats');
    expect(types).not.toContain('OrganizationUsageStats');
  });

  it('the Profile type has no role column', () => {
    const types = read('src/types.ts');
    const profile = types.slice(types.indexOf('export interface Profile'), types.indexOf('// Organization types'));
    expect(profile).not.toMatch(/\brole\b/);
  });

  it('the admin dashboard derives super admin from role, not from user_roles.is_super_admin', () => {
    const page = read('src/app/admin/dashboard/page.tsx');
    expect(page).not.toContain('is_super_admin');
    expect(page).toContain("role === 'super_admin'");
  });

  it('admin/roles does not select user_roles.is_super_admin', () => {
    expect(read('src/app/api/admin/roles/route.ts')).not.toContain('is_super_admin');
  });
});
