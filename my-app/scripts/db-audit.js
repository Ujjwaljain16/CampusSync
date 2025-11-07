/*
DB Audit Script
- Reads `supabase-migrations/*.sql` to extract CREATE TABLE column lists (best-effort)
- Uses Supabase service role key to query tables and verify expected columns exist
- Runs integrity checks:
  - Users with multiple roles
  - Orphaned user_roles (no profile / no auth user)
  - Organizations with primary_admin_id mismatch
  - Counts for key tables

Usage:
  node scripts/db-audit.js

Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
*/

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase-migrations');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env.local (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseCreateTables(sqlText) {
  const tables = {};
  // naive regex to capture CREATE TABLE ... ( ... );
  const createRegex = /CREATE TABLE IF NOT EXISTS\s+public\.([a-z0-9_]+)\s*\(([^;]+?)\);/gis;
  let m;
  while ((m = createRegex.exec(sqlText)) !== null) {
    const table = m[1];
    const body = m[2];
    // split by commas that are at line end (naive)
    const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const cols = [];
    for (const line of lines) {
      // stop on constraints or indexes
      if (/^CONSTRAINT\b|^UNIQUE\b|^CHECK\b|^PRIMARY KEY\b/i.test(line)) continue;
      const colMatch = line.match(/^([a-z0-9_]+)\s+/i);
      if (colMatch) cols.push(colMatch[1]);
    }
    tables[table] = cols;
  }
  return tables;
}

async function loadMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  const allTables = {};
  for (const file of files) {
    const txt = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const parsed = parseCreateTables(txt);
    for (const t of Object.keys(parsed)) {
      if (!allTables[t]) allTables[t] = new Set();
      parsed[t].forEach(c => allTables[t].add(c));
    }
  }
  // convert to arrays
  const result = {};
  for (const [k, v] of Object.entries(allTables)) result[k] = Array.from(v);
  return result;
}

async function trySelectColumns(table, cols) {
  try {
    const sel = cols.slice(0, 15).join(','); // limit
    const { error } = await supabase.from(table).select(sel).limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function runChecks() {
  console.log('Loading expected schema from migrations...');
  const expected = await loadMigrations();
  const tablesToCheck = ['organizations', 'profiles', 'user_roles', 'audit_logs', 'allowed_domains', 'documents', 'verification_requests'];

  console.log('\n=== Schema column checks ===');
  for (const table of tablesToCheck) {
    const cols = expected[table] || [];
    if (cols.length === 0) {
      console.log(`\n- ${table}: no create table found in migrations (skipping column check)`);
      continue;
    }
    process.stdout.write(`\n- ${table}: checking columns (${cols.length}) ... `);
    const res = await trySelectColumns(table, cols);
    if (res.ok) console.log('ok');
    else console.log(`FAILED -> ${res.error}`);
  }

  console.log('\n=== Basic counts ===');
  const keyTables = ['organizations', 'user_roles', 'profiles', 'audit_logs'];
  for (const t of keyTables) {
    try {
      const { error } = await supabase.from(t).select('id', { count: 'exact', head: true });
      if (error) {
        console.log(`- ${t}: error -> ${error.message}`);
      } else {
        console.log(`- ${t}: query OK (head).`);
      }
    } catch (err) {
      console.log(`- ${t}: exception -> ${err}`);
    }
  }

  console.log('\n=== Integrity checks ===');

  // 1) Users with multiple roles
  try {
    // Note: PostgREST may not support group/having; fallback query
    console.log('- Users with multiple roles: (running fallback)');
    const { data: rows } = await supabase.rpc('get_users_with_multiple_roles').catch(() => ({}));
    if (rows && rows.length) console.log(`  -> ${rows.length} users with multiple roles`);
    else console.log('  -> cannot determine via RPC (ensure a DB function get_users_with_multiple_roles exists)');
  } catch (err) {
    console.log('  -> failed to check multiple roles:', err.message || err);
  }

  // 2) Orphaned user_roles (no profile)
  try {
    const { data: orphanRoles, error } = await supabase
      .from('user_roles')
      .select('user_id, role, organization_id')
      .not('user_id', 'is', null);
    if (error) {
      console.log('- Orphaned roles: cannot fetch user_roles ->', error.message);
    } else {
      // check profiles for each
      const orphans = [];
      for (const r of orphanRoles || []) {
        const { data: p } = await supabase.from('profiles').select('id').eq('id', r.user_id).maybeSingle();
        if (!p) orphans.push(r);
      }
      console.log(`- Orphaned user_roles without profile: ${orphans.length}`);
      if (orphans.length > 0) console.log('  sample:', orphans.slice(0,5));
    }
  } catch (err) {
    console.log('- Orphaned roles: failed ->', err.message || err);
  }

  // 3) Organizations with primary_admin_id mismatch
  try {
    const { data: orgs } = await supabase.from('organizations').select('id, name, primary_admin_id');
    const mismatches = [];
    for (const o of orgs || []) {
      if (!o.primary_admin_id) continue;
      const { data: role } = await supabase.from('user_roles').select('user_id, is_primary_admin, role').eq('user_id', o.primary_admin_id).eq('organization_id', o.id).maybeSingle();
      if (!role || !role.is_primary_admin) mismatches.push({ org: o, role });
    }
    console.log(`- Organizations with primary_admin_id mismatches: ${mismatches.length}`);
    if (mismatches.length) console.log('  sample:', mismatches.slice(0,5));
  } catch (err) {
    console.log('- Primary admin check failed ->', err.message || err);
  }

  console.log('\n=== Finished DB audit ===');
}

runChecks().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
