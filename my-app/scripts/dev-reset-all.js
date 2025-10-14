#!/usr/bin/env node

/**
 * Development Reset Script
 *
 * DANGER: This deletes ALL auth users and clears app data so you can reuse the same emails.
 * Usage:
 *   node scripts/dev-reset-all.js --yes            # run without prompt
 *   node scripts/dev-reset-all.js --yes --keep-auth # keep auth users, only clear app data
 *   node scripts/dev-reset-all.js --yes --bucket certificates # set bucket name (default: certificates)
 */

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('ERROR: Missing required environment variables.');
  console.error('  NEXT_PUBLIC_SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const autoYes = args.includes('--yes');
const keepAuth = args.includes('--keep-auth');
const dryRun = args.includes('--dry-run');
const bucketArgIndex = args.findIndex(a => a === '--bucket');
const bucket = bucketArgIndex >= 0 && args[bucketArgIndex + 1] ? args[bucketArgIndex + 1] : 'certificates';

const admin = createClient(supabaseUrl, serviceKey);

async function confirmPrompt(question) {
  if (autoYes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} (type YES to continue): `, (answer) => {
      rl.close();
      resolve(answer.trim() === 'YES');
    });
  });
}

async function deleteAllAuthUsers() {
  if (dryRun) {
    console.log('[dry-run] Would delete all auth users');
    return;
  }
  console.log('Fetching auth users...');
  // Supabase Admin API is paginated
  let nextPageToken = undefined;
  let total = 0;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page: nextPageToken });
    if (error) throw error;
    const users = data?.users || [];
    if (users.length === 0) break;
    for (const u of users) {
      try {
        await admin.auth.admin.deleteUser(u.id);
        total += 1;
        if (total % 25 === 0) console.log(`  Deleted ${total} users...`);
      } catch (e) {
        console.warn(`  Failed to delete user ${u.id}:`, e?.message || e);
      }
    }
    // Stop if fewer than page size returned (SDK currently uses cursorless pages)
    if (users.length < 1000) break;
  }
  console.log(`Auth users deleted: ${total}`);
}

async function deleteAllStorageObjects(bucketId) {
  if (dryRun) {
    console.log(`[dry-run] Would delete all storage objects in bucket '${bucketId}'`);
    return;
  }
  console.log(`Deleting storage objects in bucket '${bucketId}'...`);
  try {
    const { data: list, error } = await admin.storage.from(bucketId).list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      console.warn('  Failed to list storage objects:', error.message);
      return;
    }
    const names = (list || []).map(o => o.name).filter(Boolean);
    if (names.length === 0) {
      console.log('  No objects to delete');
      return;
    }
    const { error: delErr } = await admin.storage.from(bucketId).remove(names);
    if (delErr) console.warn('  Failed to delete some objects:', delErr.message);
    else console.log(`  Deleted ${names.length} object(s)`);
  } catch (e) {
    console.warn('  Storage delete exception:', e?.message || e);
  }
}

async function clearTables() {
  console.log('Clearing application tables...');
  // Order matters due to foreign keys
  const tables = [
    'audit_logs',
    'role_requests',
    'verifiable_credentials',
    'certificate_metadata',
    'certificates',
    'user_roles',
    'profiles',
  ];
  for (const t of tables) {
    if (dryRun) {
      console.log(`[dry-run] Would clear table ${t} (DELETE rows only)`);
      continue;
    }
    // Strategy 1: delete where created_at is not null (most tables have it)
    let { error } = await admin.from(t).delete().not('created_at', 'is', null);
    if (error) {
      // Strategy 2: delete where id is not null (fallback)
      const alt = await admin.from(t).delete().not('id', 'is', null);
      error = alt.error || null;
    }
    if (error && error.code !== 'PGRST116') {
      console.warn(`  Failed to clear table ${t}:`, error.message);
    } else {
      console.log(`  Cleared ${t}`);
    }
  }
}

async function main() {
  console.log('CampusSync Development Reset');
  console.log('================================');
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Bucket: ${bucket}`);
  console.log(`Keep auth users: ${keepAuth ? 'YES' : 'NO'}`);
  console.log(`Dry run: ${dryRun ? 'YES' : 'NO'}`);
  const ok = await confirmPrompt('This will DELETE app data' + (keepAuth ? '' : ' AND ALL AUTH USERS'));
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  try {
    if (!keepAuth) {
      await deleteAllAuthUsers();
    }
    await deleteAllStorageObjects(bucket);
    await clearTables();
    console.log('Reset successful.');
    console.log('You can now sign up again with the same emails.');
  } catch (e) {
    console.error('Reset failed:', e?.message || e);
    process.exit(1);
  }
}

main();


