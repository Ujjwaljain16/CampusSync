#!/usr/bin/env node
// CampusSync database migration runner. Zero dependencies: Node built-ins plus the `psql` command line client.
//
//   node migrate.mjs plan   [--phase pre|post|all] [--replay-baseline]
//   node migrate.mjs status
//   node migrate.mjs init
//   node migrate.mjs apply  [--phase pre|post|all] [--replay-baseline] [--allow-drift]
//
// The connection string is read ONLY from the environment variable DATABASE_URL, never from arguments, and it is
// masked in anything this program prints. Exit codes: 0 ok, 1 failure, 2 drift (an applied file was edited).
// Conventions and the one-time setup: my-app/docs/MIGRATIONS.md.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TABLE = 'public.app_schema_migrations';
export const DIRECTIVE_LINES = 5;
export const DIRECTIVES = ['baseline', 'skip', 'phase=post'];
const FILE_NAME = /^[A-Za-z0-9_.-]+\.sql$/;

export const defaultMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------------------------

/**
 * Reads the optional `-- migrate: <directive>` comment from the first DIRECTIVE_LINES lines of a file.
 * Returns 'baseline' | 'skip' | 'phase=post' | null. Throws on an unknown directive, on more than one directive and on
 * a directive placed after line 5 (it would be silently ignored otherwise, and a mis-classified file is dangerous).
 */
export function parseDirective(text, name = 'file') {
  const lines = String(text).split(/\r?\n/);
  const re = /^--\s*migrate:\s*(.*?)\s*$/i;
  const found = [];
  lines.forEach((line, i) => {
    const m = re.exec(line);
    if (!m) return;
    if (i >= DIRECTIVE_LINES) {
      throw new Error(`${name}: "-- migrate:" directive on line ${i + 1}; it must be within the first ${DIRECTIVE_LINES} lines`);
    }
    found.push(m[1]);
  });
  if (found.length > 1) throw new Error(`${name}: more than one "-- migrate:" directive`);
  if (found.length === 0) return null;
  if (!DIRECTIVES.includes(found[0])) {
    throw new Error(`${name}: unknown directive "${found[0]}" (allowed: ${DIRECTIVES.join(', ')})`);
  }
  return found[0];
}

/** SHA-256 (hex) of the content with CRLF normalised to LF, so a Windows checkout and Linux CI agree. */
export function checksum(text) {
  return createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** One file -> { name, checksum, directive, kind: 'normal'|'baseline'|'skip', phase: 'pre'|'post'|null } */
export function classify(name, text) {
  if (!FILE_NAME.test(name)) throw new Error(`unsupported migration file name: ${name}`);
  const directive = parseDirective(text, name);
  const kind = directive === 'baseline' ? 'baseline' : directive === 'skip' ? 'skip' : 'normal';
  const phase = kind === 'skip' ? null : directive === 'phase=post' ? 'post' : 'pre';
  return { name, checksum: checksum(text), directive, kind, phase };
}

/** Lexical (code point) order of file names, independent of locale. */
export const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * files:    classified files (see classify)
 * recorded: Map name -> { checksum, phase, kind } from the tracking table
 * Returns { states: [{ name, state, ... }], pending: [file...], drift: [{ name, expected, actual }] }
 * state: applied | baseline | skipped | pending-pre | pending-post | modified
 * phaseFilter 'pre' | 'post' | 'all' only selects what goes into `pending` (states always cover every file).
 */
export function computePlan({ files, recorded = new Map(), phase = 'all', replayBaseline = false }) {
  if (!['pre', 'post', 'all'].includes(phase)) throw new Error(`unknown phase "${phase}" (pre, post or all)`);
  const sorted = [...files].sort(byName);
  const states = [];
  const drift = [];
  const pendingPre = [];
  const pendingPost = [];
  for (const f of sorted) {
    if (f.kind === 'skip') {
      states.push({ name: f.name, state: 'skipped', phase: null });
      continue;
    }
    let rec = recorded.get(f.name);
    // CI replay: a baseline record (written by `init`) does not count; the file is run and re-recorded as applied.
    if (rec && replayBaseline && rec.kind === 'baseline' && rec.checksum === f.checksum) rec = undefined;
    if (rec) {
      if (rec.checksum !== f.checksum) {
        drift.push({ name: f.name, expected: rec.checksum, actual: f.checksum });
        states.push({ name: f.name, state: 'modified', phase: f.phase });
      } else {
        states.push({ name: f.name, state: rec.kind === 'baseline' ? 'baseline' : 'applied', phase: f.phase });
      }
      continue;
    }
    if (f.kind === 'baseline' && !replayBaseline) {
      // Not run by `apply`; becomes "recorded" through `init`.
      states.push({ name: f.name, state: 'baseline', phase: f.phase, unrecorded: true });
      continue;
    }
    if (f.phase === 'post') {
      pendingPost.push(f);
      states.push({ name: f.name, state: 'pending-post', phase: 'post' });
    } else {
      pendingPre.push(f);
      states.push({ name: f.name, state: 'pending-pre', phase: 'pre' });
    }
  }
  const pending = phase === 'pre' ? pendingPre : phase === 'post' ? pendingPost : [...pendingPre, ...pendingPost];
  return { states, pending, drift, pendingPre, pendingPost };
}

/** Removes the connection string (and its password) from any text. */
export function maskSecret(text, url) {
  let out = String(text ?? '');
  if (!url) return out;
  const secrets = new Set([url]);
  try {
    const u = new URL(url);
    // very short passwords are not masked on their own (they would garble ordinary words); the full URL always is
    for (const p of [u.password, safeDecode(u.password)]) if (p && p.length >= 4) secrets.add(p);
    secrets.add(u.href);
  } catch {
    /* not a parsable URL: the raw string is still masked */
  }
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) out = out.split(s).join('***');
  return out;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------------------------------------------------------
// Database access: everything goes through runPsql so tests can replace it
// ---------------------------------------------------------------------------------------------------------------

/**
 * Runs SQL text (`{ sql }`) or a file (`{ file }`) with psql and returns stdout. Throws on a non-zero exit with the
 * (masked) stderr. The URL is passed as the first positional argument of psql, exactly as `psql "$DATABASE_URL"`.
 */
export function runPsql({ sql, file }, url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  // VERBOSITY=terse keeps DETAIL lines (which can quote row values) out of logs; MIGRATE_PSQL_VERBOSITY=default
  // restores them for a private terminal.
  const verbosity = process.env.MIGRATE_PSQL_VERBOSITY === 'default' ? 'default' : 'terse';
  const args = [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', `VERBOSITY=${verbosity}`];
  if (file) args.push('-f', file);
  else args.push('-A', '-t', '-c', sql);
  const r = spawnSync('psql', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) {
    const hint = r.error.code === 'ENOENT' ? 'psql was not found on PATH' : String(r.error.message);
    throw new Error(maskSecret(hint, url));
  }
  if (r.status !== 0) {
    const msg = String(r.stderr || '').trim() || `psql exited with status ${r.status}`;
    throw new Error(maskSecret(msg, url));
  }
  return String(r.stdout || '').trim();
}

// Every call made by the commands goes through here, so even a stubbed psql that throws a message containing the
// connection string cannot leak it.
function makeDb(deps) {
  const url = deps.url;
  const call = (arg) => {
    try {
      return deps.runPsql(arg);
    } catch (e) {
      throw new Error(maskSecret(e instanceof Error ? e.message : String(e), url));
    }
  };
  return {
    tableExists: () => call({ sql: `select to_regclass('${TABLE}') is not null` }) === 't',
    loadRecorded: () => {
      const out = call({ sql: `select name || '|' || checksum || '|' || phase || '|' || kind from ${TABLE} order by name` });
      const map = new Map();
      for (const line of out.split(/\r?\n/).filter(Boolean)) {
        const [name, sum, phase, kind] = line.split('|');
        map.set(name, { checksum: sum, phase, kind });
      }
      return map;
    },
    runFile: (file) => call({ file }),
    record: (f, kind) =>
      call({
        sql: `insert into ${TABLE} (name, checksum, phase, kind) values (${q(f.name)}, ${q(f.checksum)}, ${q(f.phase ?? 'pre')}, ${q(kind)}) on conflict (name) do update set kind = excluded.kind, applied_at = now() where ${TABLE}.kind = 'baseline'`,
      }),
    createTable: () => call({ sql: INIT_SQL }),
    recordMany: (rows) => {
      if (!rows.length) return;
      const values = rows.map((f) => `(${q(f.name)}, ${q(f.checksum)}, ${q(f.phase ?? 'pre')}, 'baseline')`).join(', ');
      call({ sql: `insert into ${TABLE} (name, checksum, phase, kind) values ${values} on conflict (name) do nothing` });
    },
  };
}

// One implicit transaction (a single simple-query string). RLS on, no policies, no access for the API roles
// (Supabase exposes `public` through its REST API; only the table owner / service role may touch this table).
export const INIT_SQL = `
create table if not exists ${TABLE} (
  name text primary key,
  checksum text not null,
  phase text not null,
  kind text not null check (kind in ('applied', 'baseline')),
  applied_at timestamptz not null default now()
);
alter table ${TABLE} enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table ${TABLE} from %I', r);
    end if;
  end loop;
end
$$;
`;

// ---------------------------------------------------------------------------------------------------------------
// Commands (take deps so tests can stub psql, the file system and the output)
// ---------------------------------------------------------------------------------------------------------------

export function loadFiles(dir = defaultMigrationsDir, read = readFileSync, list = readdirSync) {
  return list(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((n) => classify(n, read(join(dir, n), 'utf8')));
}

function makeDeps(overrides = {}) {
  const env = overrides.env ?? process.env;
  const url = overrides.url ?? env.DATABASE_URL;
  return {
    dir: defaultMigrationsDir,
    log: (s) => console.log(s),
    err: (s) => console.error(s),
    now: () => Date.now(),
    ...overrides,
    env,
    url,
    runPsql: overrides.runPsql ?? ((arg) => runPsql(arg, url)),
    files: overrides.files ?? loadFiles(overrides.dir ?? defaultMigrationsDir),
  };
}

const fmt = (f) => `${(f.phase ?? '-').padEnd(4)} ${f.name}`;

function requireUrl(d) {
  if (!d.url) {
    d.err('DATABASE_URL is not set. Set it as an environment variable (never as an argument). See docs/MIGRATIONS.md.');
    return false;
  }
  return true;
}

function loadState(d, opts) {
  const db = makeDb(d);
  const exists = db.tableExists();
  const recorded = exists ? db.loadRecorded() : new Map();
  return { db, exists, plan: computePlan({ files: d.files, recorded, phase: opts.phase ?? 'all', replayBaseline: opts.replayBaseline }) };
}

export function cmdPlan(opts = {}, overrides = {}) {
  const d = makeDeps(overrides);
  if (!requireUrl(d)) return 1;
  try {
    const { exists, plan } = loadState(d, opts);
    if (!exists) d.log(`Note: ${TABLE} does not exist yet; run "init" once. Showing the plan as if nothing were recorded.`);
    if (plan.drift.length) for (const x of plan.drift) d.log(`DRIFT   ${x.name} was edited after it was recorded`);
    if (plan.pending.length === 0) d.log('Nothing pending.');
    else {
      d.log(`Pending (${plan.pending.length}):`);
      for (const f of plan.pending) d.log(`  ${fmt(f)}`);
    }
    return plan.drift.length ? 2 : 0;
  } catch (e) {
    d.err(`plan failed: ${e.message}`);
    return 1;
  }
}

export function cmdStatus(opts = {}, overrides = {}) {
  const d = makeDeps(overrides);
  if (!requireUrl(d)) return 1;
  try {
    const { exists, plan } = loadState(d, { ...opts, phase: 'all' });
    if (!exists) d.log(`Note: ${TABLE} does not exist yet; run "init" once.`);
    for (const s of plan.states) d.log(`${s.state.padEnd(13)} ${s.name}${s.unrecorded ? '  (not recorded yet: run init)' : ''}`);
    const count = (st) => plan.states.filter((s) => s.state === st).length;
    d.log(
      `\n${count('applied')} applied, ${count('baseline')} baseline, ${count('skipped')} skipped, ${count('pending-pre')} pending-pre, ${count('pending-post')} pending-post, ${count('modified')} modified`,
    );
    return plan.drift.length ? 2 : 0;
  } catch (e) {
    d.err(`status failed: ${e.message}`);
    return 1;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- same (opts, overrides) signature as the other commands
export function cmdInit(_opts = {}, overrides = {}) {
  const d = makeDeps(overrides);
  if (!requireUrl(d)) return 1;
  try {
    const db = makeDb(d);
    db.createTable();
    const recorded = db.loadRecorded();
    const baselines = d.files.filter((f) => f.kind === 'baseline');
    const fresh = baselines.filter((f) => !recorded.has(f.name));
    db.recordMany(fresh);
    for (const f of baselines) {
      const rec = recorded.get(f.name);
      if (rec && rec.checksum !== f.checksum) d.log(`warning: ${f.name} differs from the recorded baseline checksum (left unchanged)`);
    }
    d.log(`init: tracking table ready; ${fresh.length} baseline file(s) recorded, ${baselines.length - fresh.length} already recorded.`);
    return 0;
  } catch (e) {
    d.err(`init failed: ${e.message}`);
    return 1;
  }
}

export function cmdApply(opts = {}, overrides = {}) {
  const d = makeDeps(overrides);
  const phase = opts.phase ?? 'all';
  if (!requireUrl(d)) return 1;
  if (opts.replayBaseline && !(d.env.CI === 'true' || d.env.CI === '1')) {
    d.err('--replay-baseline re-runs files that are already applied in production; it is only allowed when CI=true (CI model database).');
    return 1;
  }
  try {
    const db = makeDb(d);
    if (!db.tableExists()) {
      d.err(`The tracking table ${TABLE} does not exist. Run "init" once first (workflow "Apply database migrations", mode init). See docs/MIGRATIONS.md.`);
      return 1;
    }
    const plan = computePlan({ files: d.files, recorded: db.loadRecorded(), phase, replayBaseline: opts.replayBaseline });

    if (plan.drift.length) {
      for (const x of plan.drift) d.err(`DRIFT: ${x.name} was edited after it was applied (recorded ${x.expected.slice(0, 12)}, now ${x.actual.slice(0, 12)}). Never edit an applied file; add a new migration.`);
      if (!opts.allowDrift) {
        d.err('Refusing to continue. Restore the file, or re-run with --allow-drift if the change is deliberate (for example a comment).');
        return 2;
      }
      d.err('--allow-drift: continuing.');
    }

    if (phase === 'post' && plan.pendingPre.length) {
      d.err(`Refusing to run post migrations: ${plan.pendingPre.length} pre migration(s) are still pending (${plan.pendingPre.map((f) => f.name).join(', ')}). Run the pre phase first.`);
      return 1;
    }

    if (plan.pending.length === 0) {
      d.log(`Nothing to apply (phase ${phase}).`);
      return 0;
    }

    const results = [];
    let failed = null;
    for (const f of plan.pending) {
      const t0 = d.now();
      try {
        db.runFile(join(d.dir, f.name));
        db.record(f, 'applied');
        const ms = d.now() - t0;
        results.push({ name: f.name, phase: f.phase, ms, ok: true });
        d.log(`applied  ${fmt(f)}  ${ms} ms`);
      } catch (e) {
        const ms = d.now() - t0;
        results.push({ name: f.name, phase: f.phase, ms, ok: false });
        d.err(`FAILED   ${fmt(f)}  ${ms} ms`);
        d.err(e.message);
        failed = f;
        break;
      }
    }
    const done = results.filter((r) => r.ok).length;
    const left = plan.pending.length - done;
    d.log(`\nSummary: ${done} applied${failed ? `, 1 failed (${failed.name})` : ''}${failed ? `, ${left - 1} not run` : ''}.`);
    return failed ? 1 : 0;
  } catch (e) {
    d.err(`apply failed: ${e.message}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { phase: 'all', replayBaseline: false, allowDrift: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--phase') opts.phase = rest[++i];
    else if (a.startsWith('--phase=')) opts.phase = a.slice('--phase='.length);
    else if (a === '--replay-baseline') opts.replayBaseline = true;
    else if (a === '--allow-drift') opts.allowDrift = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!['pre', 'post', 'all'].includes(opts.phase)) throw new Error(`--phase must be pre, post or all (got "${opts.phase}")`);
  return { command, opts };
}

export function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  const { command, opts } = parsed;
  const url = process.env.DATABASE_URL;
  try {
    switch (command) {
      case 'plan':
        return cmdPlan(opts);
      case 'status':
        return cmdStatus(opts);
      case 'init':
        return cmdInit(opts);
      case 'apply':
        return cmdApply(opts);
      default:
        console.error('usage: node migrate.mjs <plan|status|init|apply> [--phase pre|post|all] [--replay-baseline] [--allow-drift]');
        return 1;
    }
  } catch (e) {
    console.error(maskSecret(e instanceof Error ? e.message : String(e), url));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
