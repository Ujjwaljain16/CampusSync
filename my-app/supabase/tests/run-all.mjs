// Runs the schema-cleanup migrations (20261015_*) against a model of the production database inside an in-process
// PostgreSQL (PGlite) and asserts what they are supposed to guarantee.
//
//   cd my-app/supabase/tests && npm install && npm test
//
// Two scenarios, each on a fresh database:
//   1. steps 01-03 (expand, integrity, indexes)        -> assert-expand.mjs   (behaviour of the data + constraints)
//   2. steps 00-08 (everything)                         -> assert-final.mjs    (final shape, policies, guards, idempotency)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const migration = (prefix) => {
  const f = readdirSync(migrationsDir).find((n) => n.startsWith(`20261015_${prefix}_`));
  if (!f) throw new Error(`migration ${prefix} not found`);
  return join(migrationsDir, f);
};
const LIVE = readFileSync(join(here, 'live-schema.sql'), 'utf8');

let totalChecks = 0;
let totalBad = 0;

async function scenario(title, prefixes, assertFile) {
  console.log(`\n=== ${title}`);
  const db = new PGlite();
  await db.exec(LIVE);
  for (const p of prefixes) {
    const file = migration(p);
    try {
      await db.exec(readFileSync(file, 'utf8'));
      console.log('applied', file.split(/[\\/]/).pop());
    } catch (e) {
      console.log('FAILED ', file.split(/[\\/]/).pop(), '->', e.message);
      totalBad++;
      return;
    }
  }

  const as = async (userId, fn, role = 'authenticated') => {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: userId, role })}', true)`);
      return await fn(db);
    } finally {
      await db.exec('rollback');
    }
  };
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const check = (name, cond, detail = '') => {
    totalChecks++;
    if (!cond) {
      totalBad++;
      console.log('  FAIL:', name, detail);
    } else {
      console.log('  ok:  ', name);
    }
  };
  const expectError = async (name, fn, re) => {
    try {
      await fn();
      check(name, false, '(expected an error, none raised)');
    } catch (e) {
      check(name, re ? re.test(e.message) : true, `(got: ${e.message})`);
    }
  };

  const mod = await import(pathToFileURL(join(here, assertFile)).href);
  await mod.default({ db, as, q, check, expectError });
}

await scenario('steps 01-03: data and constraints', ['01', '02', '03', '03b'], 'assert-expand.mjs');
await scenario('steps 00-08: final state', ['00', '01', '02', '03', '03b', '04', '05', '06', '07', '08'], 'assert-final.mjs');

console.log(`\n${totalChecks - totalBad}/${totalChecks} checks passed`);
process.exit(totalBad ? 1 : 0);
