// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  checksum,
  classify,
  cmdApply,
  cmdInit,
  cmdPlan,
  cmdStatus,
  computePlan,
  loadFiles,
  maskSecret,
  parseArgs,
  parseDirective,
} from '../../supabase/migrate/migrate.mjs';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const URL_SECRET = 'postgresql://postgres.abcdefgh:s3cr3t-Pa55@aws-0-eu.pooler.supabase.com:5432/postgres';

const BASELINE = [
  '20261014_00_db_hardening',
  '20261014_authz_01_function_hardening',
  '20261014_authz_02_transfer_primary_admin',
  '20261014_authz_04_function_hardening',
  '20261014_authz_05a_helpers',
  '20261014_authz_05b_user_roles_policies',
  '20261014_authz_05c_role_requests_policies',
  '20261014_authz_06_domains_unique',
  '20261014_core_audit_logs_normalize',
  '20261014_core_vc_status_columns',
  '20261014_privacy_profile_visibility',
  '20261014_vc_status_list_columns',
  '20261015_01_expand',
  '20261015_02_integrity',
  '20261015_03_indexes',
  '20261015_03b_extra_indexes',
  '20261015_04_policies_safe',
  '20261015_05_lock_audit_writes',
  '20261015_06_credentials_service_only',
  '20261015_07_default_pending',
  '20261015_08_contract',
];
const SKIP = [
  '20261014_authz_03_last_admin_trigger',
  '20261014_core_revocation_list_note',
  '20261014_core_storage_policies_note',
  '20261014_core_vc_one_active_per_certificate',
  '20261014_privacy_profiles_rls',
  '20261014_sd_issuances',
  '20261014_tlog_transparency_log',
  '20261014_vc_status_lists',
  '20261015_00_preflight',
  '20261015_99_status_check',
];
const PRE = ['20261016_02_rate_limits'];
const POST = ['20261016_01_private_certificates_bucket'];

const strip = (n: string) => n.replace(/\.sql$/, '');

describe('parseDirective', () => {
  it('returns null without a directive', () => {
    expect(parseDirective('-- just a comment\nselect 1;\n')).toBeNull();
  });

  it('accepts the three directives on any of the first five lines', () => {
    expect(parseDirective('-- migrate: baseline\nselect 1;')).toBe('baseline');
    expect(parseDirective('-- migrate: skip\n')).toBe('skip');
    expect(parseDirective('-- a\n-- b\n-- c\n-- d\n-- migrate:   phase=post  \n-- six\n')).toBe('phase=post');
  });

  it('copes with CRLF line endings', () => {
    expect(parseDirective('-- migrate: skip\r\nselect 1;\r\n')).toBe('skip');
  });

  it('rejects a directive after line 5 instead of ignoring it silently', () => {
    expect(() => parseDirective('-- 1\n-- 2\n-- 3\n-- 4\n-- 5\n-- migrate: skip\n', 'x.sql')).toThrow(/within the first 5 lines/);
  });

  it('rejects an unknown directive', () => {
    expect(() => parseDirective('-- migrate: later\n', 'x.sql')).toThrow(/unknown directive "later"/);
    expect(() => parseDirective('-- migrate: phase=pre\n', 'x.sql')).toThrow(/unknown directive/);
    expect(() => parseDirective('-- migrate:\n', 'x.sql')).toThrow(/unknown directive/);
  });

  it('rejects more than one directive', () => {
    expect(() => parseDirective('-- migrate: skip\n-- migrate: phase=post\n', 'x.sql')).toThrow(/more than one/);
  });
});

describe('checksum', () => {
  it('is a SHA-256 hex digest', () => {
    expect(checksum('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is identical for CRLF and LF content', () => {
    expect(checksum('a\r\nb\r\nc\r\n')).toBe(checksum('a\nb\nc\n'));
    expect(checksum('a\nb')).not.toBe(checksum('a\nb '));
  });
});

describe('classify', () => {
  it('derives kind and phase from the directive', () => {
    expect(classify('a.sql', 'select 1;')).toMatchObject({ kind: 'normal', phase: 'pre', directive: null });
    expect(classify('a.sql', '-- migrate: phase=post\n')).toMatchObject({ kind: 'normal', phase: 'post' });
    expect(classify('a.sql', '-- migrate: baseline\n')).toMatchObject({ kind: 'baseline', phase: 'pre' });
    expect(classify('a.sql', '-- migrate: skip\n')).toMatchObject({ kind: 'skip', phase: null });
  });

  it('refuses file names it could not quote safely', () => {
    expect(() => classify("a'; drop table x;--.sql", 'select 1;')).toThrow(/unsupported migration file name/);
  });
});

describe('the real migration files', () => {
  const files = loadFiles(MIGRATIONS);
  const names = (pred: (f: (typeof files)[number]) => boolean) => files.filter(pred).map((f) => strip(f.name));

  it('lists every .sql file in lexical order', () => {
    const onDisk = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort();
    expect(files.map((f) => f.name)).toEqual(onDisk);
    expect(files.length).toBe(BASELINE.length + SKIP.length + PRE.length + POST.length);
  });

  it('classifies baseline files exactly', () => {
    expect(names((f) => f.kind === 'baseline')).toEqual(BASELINE);
  });

  it('classifies skipped files exactly', () => {
    expect(names((f) => f.kind === 'skip')).toEqual(SKIP);
  });

  it('has exactly two executable migrations: one pre and one post', () => {
    const live = files.filter((f) => f.kind === 'normal');
    expect(live.map((f) => strip(f.name))).toEqual([...POST, ...PRE]);
    expect(names((f) => f.kind === 'normal' && f.phase === 'post')).toEqual(POST);
    expect(names((f) => f.kind === 'normal' && f.phase === 'pre')).toEqual(PRE);
  });

  it('keeps the directive on the first line and the files plain ASCII', () => {
    for (const f of files) {
      const text = readFileSync(join(MIGRATIONS, f.name), 'utf8');
      if (f.directive) expect(text.split(/\r?\n/)[0], f.name).toBe(`-- migrate: ${f.directive}`);
      expect(/[^\x09\x0a\x0d\x20-\x7e]/.test(text), `${f.name} is not ASCII`).toBe(false);
    }
  });

  it('plans only the two new migrations for a database initialised with the baseline', () => {
    const recorded = new Map(files.filter((f) => f.kind === 'baseline').map((f) => [f.name, { checksum: f.checksum, phase: 'pre', kind: 'baseline' }]));
    const plan = computePlan({ files, recorded });
    expect(plan.pending.map((f) => strip(f.name))).toEqual([...PRE, ...POST]);
    expect(plan.drift).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// plan / phases / drift (pure)
// ---------------------------------------------------------------------------------------------------------------
const mk = (name: string, directive?: string, body = 'select 1;') =>
  classify(`${name}.sql`, `${directive ? `-- migrate: ${directive}\n` : ''}${body}\n`);

describe('computePlan', () => {
  const files = [
    mk('20270101_c_post', 'phase=post'),
    mk('20270101_a_base', 'baseline'),
    mk('20270101_b_skip', 'skip'),
    mk('20270101_d_pre'),
    mk('20270101_e_pre'),
  ];

  it('orders by file name and pre before post', () => {
    const plan = computePlan({ files, recorded: new Map() });
    expect(plan.pending.map((f) => f.name)).toEqual(['20270101_d_pre.sql', '20270101_e_pre.sql', '20270101_c_post.sql']);
  });

  it('filters by phase', () => {
    expect(computePlan({ files, phase: 'pre' }).pending.map((f) => f.name)).toEqual(['20270101_d_pre.sql', '20270101_e_pre.sql']);
    expect(computePlan({ files, phase: 'post' }).pending.map((f) => f.name)).toEqual(['20270101_c_post.sql']);
  });

  it('rejects an unknown phase', () => {
    expect(() => computePlan({ files, phase: 'later' as never })).toThrow(/unknown phase/);
  });

  it('never plans skipped files, and plans baseline files only with replayBaseline', () => {
    expect(computePlan({ files }).pending.map((f) => f.name)).not.toContain('20270101_b_skip.sql');
    const replay = computePlan({ files, replayBaseline: true });
    expect(replay.pending.map((f) => f.name)).toEqual(['20270101_a_base.sql', '20270101_d_pre.sql', '20270101_e_pre.sql', '20270101_c_post.sql']);
    expect(replay.pending.map((f) => f.name)).not.toContain('20270101_b_skip.sql');
  });

  it('reports the state of every file', () => {
    const recorded = new Map([
      [files[3].name, { checksum: files[3].checksum, phase: 'pre', kind: 'applied' }],
      [files[1].name, { checksum: files[1].checksum, phase: 'pre', kind: 'baseline' }],
    ]);
    const states = Object.fromEntries(computePlan({ files, recorded }).states.map((s) => [s.name, s.state]));
    expect(states).toEqual({
      '20270101_a_base.sql': 'baseline',
      '20270101_b_skip.sql': 'skipped',
      '20270101_c_post.sql': 'pending-post',
      '20270101_d_pre.sql': 'applied',
      '20270101_e_pre.sql': 'pending-pre',
    });
  });

  it('detects drift when a recorded file changed', () => {
    const recorded = new Map([[files[3].name, { checksum: 'deadbeef', phase: 'pre', kind: 'applied' }]]);
    const plan = computePlan({ files, recorded });
    expect(plan.drift.map((d) => d.name)).toEqual(['20270101_d_pre.sql']);
    expect(plan.states.find((s) => s.name === '20270101_d_pre.sql')?.state).toBe('modified');
    expect(plan.pending.map((f) => f.name)).not.toContain('20270101_d_pre.sql');
  });

  it('does not call a recorded file with CRLF line endings modified', () => {
    const lf = classify('a.sql', 'select 1;\nselect 2;\n');
    const crlf = classify('a.sql', 'select 1;\r\nselect 2;\r\n');
    const plan = computePlan({ files: [crlf], recorded: new Map([['a.sql', { checksum: lf.checksum, phase: 'pre', kind: 'applied' }]]) });
    expect(plan.drift).toEqual([]);
  });
});

describe('parseArgs', () => {
  it('parses flags and validates the phase', () => {
    expect(parseArgs(['apply', '--phase', 'post', '--allow-drift'])).toEqual({
      command: 'apply',
      opts: { phase: 'post', replayBaseline: false, allowDrift: true },
    });
    expect(parseArgs(['plan', '--phase=pre', '--replay-baseline']).opts).toMatchObject({ phase: 'pre', replayBaseline: true });
    expect(() => parseArgs(['plan', '--phase', 'x'])).toThrow(/--phase must be/);
    expect(() => parseArgs(['plan', '--url', 'postgres://x'])).toThrow(/unknown argument/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Commands against a stubbed psql (an in-memory tracking table)
// ---------------------------------------------------------------------------------------------------------------
type Row = { checksum: string; phase: string; kind: string };

function fakeDb(opts: { table?: boolean; rows?: Record<string, Row>; failOn?: string; throwText?: (name: string) => string } = {}) {
  const state = { table: opts.table ?? true, rows: new Map<string, Row>(Object.entries(opts.rows ?? {})), executed: [] as string[], sql: [] as string[] };
  const runPsql = (arg: { sql?: string; file?: string }) => {
    if (arg.file) {
      const name = arg.file.split(/[\\/]/).pop() as string;
      state.executed.push(name);
      if (opts.failOn === name) throw new Error(opts.throwText ? opts.throwText(name) : `ERROR: syntax error in ${name}`);
      return '';
    }
    const sql = arg.sql as string;
    state.sql.push(sql);
    if (sql.includes('to_regclass')) return state.table ? 't' : 'f';
    if (sql.startsWith('select name ||')) {
      return [...state.rows].map(([n, r]) => `${n}|${r.checksum}|${r.phase}|${r.kind}`).join('\n');
    }
    if (/create table if not exists/.test(sql)) {
      state.table = true;
      return '';
    }
    if (sql.startsWith('insert into')) {
      for (const m of sql.matchAll(/\('([^']*)', '([^']*)', '([^']*)', '([^']*)'\)/g)) {
        const old = state.rows.get(m[1]);
        if (!old) state.rows.set(m[1], { checksum: m[2], phase: m[3], kind: m[4] });
        // mirrors "on conflict ... do update set kind = excluded.kind where kind = 'baseline'"
        else if (old.kind === 'baseline' && /do update set kind = excluded\.kind/.test(sql)) old.kind = m[4];
      }
      return '';
    }
    throw new Error(`unexpected sql: ${sql}`);
  };
  return { state, runPsql };
}

function harness(files: ReturnType<typeof mk>[], db: ReturnType<typeof fakeDb>, extra: Record<string, unknown> = {}) {
  const out: string[] = [];
  const errs: string[] = [];
  return {
    out,
    errs,
    overrides: { url: URL_SECRET, env: { CI: 'true' }, dir: '/m', files, runPsql: db.runPsql, log: (s: string) => out.push(s), err: (s: string) => errs.push(s), ...extra },
  };
}

describe('apply', () => {
  const files = [mk('20270101_a_base', 'baseline'), mk('20270101_b_pre'), mk('20270101_c_pre'), mk('20270101_d_post', 'phase=post'), mk('20270101_e_skip', 'skip')];

  it('refuses when the tracking table is missing and tells the user to run init', () => {
    const db = fakeDb({ table: false });
    const h = harness(files, db);
    expect(cmdApply({ phase: 'all' }, h.overrides)).toBe(1);
    expect(h.errs.join('\n')).toMatch(/Run "init" once/);
    expect(db.state.executed).toEqual([]);
  });

  it('refuses without DATABASE_URL', () => {
    const db = fakeDb();
    const h = harness(files, db, { url: undefined });
    expect(cmdApply({}, h.overrides)).toBe(1);
    expect(h.errs.join('\n')).toMatch(/DATABASE_URL is not set/);
    expect(db.state.executed).toEqual([]);
  });

  it('runs pending files in order, records each as applied, and skips baseline and skip files', () => {
    const db = fakeDb();
    const h = harness(files, db);
    expect(cmdApply({ phase: 'all' }, h.overrides)).toBe(0);
    expect(db.state.executed).toEqual(['20270101_b_pre.sql', '20270101_c_pre.sql', '20270101_d_post.sql']);
    expect([...db.state.rows.keys()]).toEqual(['20270101_b_pre.sql', '20270101_c_pre.sql', '20270101_d_post.sql']);
    expect(db.state.rows.get('20270101_d_post.sql')).toMatchObject({ kind: 'applied', phase: 'post' });
    expect(h.out.some((l) => /applied\s+pre\s+20270101_b_pre\.sql\s+\d+ ms/.test(l))).toBe(true);
    expect(h.out.join('\n')).toMatch(/Summary: 3 applied/);
  });

  it('is idempotent: a second run executes nothing', () => {
    const db = fakeDb();
    cmdApply({ phase: 'all' }, harness(files, db).overrides);
    db.state.executed.length = 0;
    const h = harness(files, db);
    expect(cmdApply({ phase: 'all' }, h.overrides)).toBe(0);
    expect(db.state.executed).toEqual([]);
    expect(h.out.join('\n')).toMatch(/Nothing to apply/);
  });

  it('applies only the requested phase', () => {
    const db = fakeDb();
    expect(cmdApply({ phase: 'pre' }, harness(files, db).overrides)).toBe(0);
    expect(db.state.executed).toEqual(['20270101_b_pre.sql', '20270101_c_pre.sql']);
    db.state.executed.length = 0;
    expect(cmdApply({ phase: 'post' }, harness(files, db).overrides)).toBe(0);
    expect(db.state.executed).toEqual(['20270101_d_post.sql']);
  });

  it('refuses the post phase while pre files are still pending', () => {
    const db = fakeDb();
    const h = harness(files, db);
    expect(cmdApply({ phase: 'post' }, h.overrides)).toBe(1);
    expect(h.errs.join('\n')).toMatch(/pre migration\(s\) are still pending/);
    expect(db.state.executed).toEqual([]);
  });

  it('stops at the first failure and leaves later files pending and unrecorded', () => {
    const db = fakeDb({ failOn: '20270101_b_pre.sql' });
    const h = harness(files, db);
    expect(cmdApply({ phase: 'all' }, h.overrides)).toBe(1);
    expect(db.state.executed).toEqual(['20270101_b_pre.sql']);
    expect(db.state.rows.size).toBe(0);
    expect(h.errs.join('\n')).toMatch(/FAILED\s+pre\s+20270101_b_pre\.sql/);
    expect(h.out.join('\n')).toMatch(/1 failed \(20270101_b_pre\.sql\), 2 not run/);
  });

  it('keeps what succeeded before the failure', () => {
    const db = fakeDb({ failOn: '20270101_c_pre.sql' });
    expect(cmdApply({ phase: 'all' }, harness(files, db).overrides)).toBe(1);
    expect([...db.state.rows.keys()]).toEqual(['20270101_b_pre.sql']);
  });

  it('exits 2 on drift, naming the file, without running anything', () => {
    const db = fakeDb({ rows: { '20270101_b_pre.sql': { checksum: 'old', phase: 'pre', kind: 'applied' } } });
    const h = harness(files, db);
    expect(cmdApply({ phase: 'all' }, h.overrides)).toBe(2);
    expect(h.errs.join('\n')).toMatch(/DRIFT: 20270101_b_pre\.sql/);
    expect(db.state.executed).toEqual([]);
  });

  it('continues past drift only with allowDrift', () => {
    const db = fakeDb({ rows: { '20270101_b_pre.sql': { checksum: 'old', phase: 'pre', kind: 'applied' } } });
    expect(cmdApply({ phase: 'all', allowDrift: true }, harness(files, db).overrides)).toBe(0);
    expect(db.state.executed).toEqual(['20270101_c_pre.sql', '20270101_d_post.sql']);
  });

  it('replays baseline files and records them as applied (CI only)', () => {
    const db = fakeDb();
    expect(cmdApply({ phase: 'all', replayBaseline: true }, harness(files, db).overrides)).toBe(0);
    expect(db.state.executed).toEqual(['20270101_a_base.sql', '20270101_b_pre.sql', '20270101_c_pre.sql', '20270101_d_post.sql']);
    expect(db.state.rows.get('20270101_a_base.sql')?.kind).toBe('applied');
    expect(db.state.executed).not.toContain('20270101_e_skip.sql');
  });

  it('replays baseline files after init (the CI sequence) and a later plan has nothing pending', () => {
    const db = fakeDb({ table: false });
    expect(cmdInit({}, harness(files, db).overrides)).toBe(0);
    expect(db.state.rows.get('20270101_a_base.sql')?.kind).toBe('baseline');
    expect(cmdApply({ phase: 'all', replayBaseline: true }, harness(files, db).overrides)).toBe(0);
    expect(db.state.executed).toEqual(['20270101_a_base.sql', '20270101_b_pre.sql', '20270101_c_pre.sql', '20270101_d_post.sql']);
    expect(db.state.rows.get('20270101_a_base.sql')?.kind).toBe('applied');
    const h = harness(files, db);
    expect(cmdPlan({ phase: 'all', replayBaseline: true }, h.overrides)).toBe(0);
    expect(h.out.join('\n')).toBe('Nothing pending.');
  });

  it('does not replay baseline records without the flag', () => {
    const db = fakeDb({ table: false });
    cmdInit({}, harness(files, db).overrides);
    expect(cmdApply({ phase: 'all' }, harness(files, db).overrides)).toBe(0);
    expect(db.state.executed).not.toContain('20270101_a_base.sql');
  });

  it('refuses --replay-baseline outside CI', () => {
    const db = fakeDb();
    const h = harness(files, db, { env: {} });
    expect(cmdApply({ phase: 'all', replayBaseline: true }, h.overrides)).toBe(1);
    expect(h.errs.join('\n')).toMatch(/only allowed when CI=true/);
    expect(db.state.executed).toEqual([]);
  });

  it('never prints the connection string, even when psql throws an error that contains it', () => {
    const db = fakeDb({ failOn: '20270101_b_pre.sql', throwText: () => `connection to ${URL_SECRET} failed: password s3cr3t-Pa55 rejected` });
    const h = harness(files, db);
    expect(cmdApply({ phase: 'all' }, h.overrides)).toBe(1);
    const all = [...h.out, ...h.errs].join('\n');
    expect(all).not.toContain(URL_SECRET);
    expect(all).not.toContain('s3cr3t-Pa55');
    expect(all).toContain('connection to *** failed');
  });

  it('masks the URL when the table check itself fails', () => {
    const h = harness(files, fakeDb(), {
      runPsql: () => {
        throw new Error(`could not connect using ${URL_SECRET}`);
      },
    });
    expect(cmdApply({}, h.overrides)).toBe(1);
    const all = [...h.out, ...h.errs].join('\n');
    expect(all).not.toContain('s3cr3t-Pa55');
    expect(all).toContain('could not connect using ***');
  });
});

describe('init', () => {
  const files = [mk('20270101_a_base', 'baseline'), mk('20270101_b_base', 'baseline'), mk('20270101_c_pre'), mk('20270101_d_skip', 'skip')];

  it('creates the table with RLS on and no access for the API roles', () => {
    const db = fakeDb({ table: false });
    expect(cmdInit({}, harness(files, db).overrides)).toBe(0);
    const ddl = db.state.sql.find((s) => /create table if not exists/.test(s)) as string;
    expect(ddl).toContain('public.app_schema_migrations');
    expect(ddl).toMatch(/kind text not null check \(kind in \('applied', 'baseline'\)\)/);
    expect(ddl).toMatch(/enable row level security/);
    expect(ddl).toMatch(/revoke all on table/);
    expect(ddl).toMatch(/'anon', 'authenticated'/);
    expect(ddl).not.toMatch(/create policy/i);
  });

  it('records baseline files only, without running anything, and is idempotent', () => {
    const db = fakeDb({ table: false });
    expect(cmdInit({}, harness(files, db).overrides)).toBe(0);
    expect(db.state.executed).toEqual([]);
    expect([...db.state.rows].map(([n, r]) => [n, r.kind])).toEqual([
      ['20270101_a_base.sql', 'baseline'],
      ['20270101_b_base.sql', 'baseline'],
    ]);
    const before = new Map(db.state.rows);
    const h = harness(files, db);
    expect(cmdInit({}, h.overrides)).toBe(0);
    expect(db.state.rows).toEqual(before);
    expect(h.out.join('\n')).toMatch(/0 baseline file\(s\) recorded, 2 already recorded/);
  });
});

describe('plan and status', () => {
  const files = [mk('20270101_a_base', 'baseline'), mk('20270101_b_pre'), mk('20270101_c_post', 'phase=post'), mk('20270101_d_skip', 'skip')];

  it('plan prints the pending files and changes nothing', () => {
    const db = fakeDb({ rows: { '20270101_a_base.sql': { checksum: files[0].checksum, phase: 'pre', kind: 'baseline' } } });
    const h = harness(files, db);
    expect(cmdPlan({ phase: 'all' }, h.overrides)).toBe(0);
    expect(h.out.join('\n')).toMatch(/Pending \(2\)[\s\S]*20270101_b_pre\.sql[\s\S]*20270101_c_post\.sql/);
    expect(db.state.executed).toEqual([]);
    expect(db.state.sql.every((s) => !s.startsWith('insert'))).toBe(true);
  });

  it('plan prints nothing pending once everything is recorded', () => {
    const rows = Object.fromEntries(files.filter((f) => f.kind !== 'skip').map((f) => [f.name, { checksum: f.checksum, phase: f.phase ?? 'pre', kind: f.kind === 'baseline' ? 'baseline' : 'applied' }]));
    const h = harness(files, fakeDb({ rows }));
    expect(cmdPlan({ phase: 'all' }, h.overrides)).toBe(0);
    expect(h.out.join('\n')).toBe('Nothing pending.');
  });

  it('status shows every file with its state', () => {
    const db = fakeDb({ rows: { '20270101_b_pre.sql': { checksum: 'old', phase: 'pre', kind: 'applied' } } });
    const h = harness(files, db);
    expect(cmdStatus({}, h.overrides)).toBe(2);
    const text = h.out.join('\n');
    expect(text).toMatch(/modified\s+20270101_b_pre\.sql/);
    expect(text).toMatch(/pending-post\s+20270101_c_post\.sql/);
    expect(text).toMatch(/skipped\s+20270101_d_skip\.sql/);
    expect(text).toMatch(/baseline\s+20270101_a_base\.sql\s+\(not recorded yet: run init\)/);
  });
});

describe('maskSecret', () => {
  it('removes the URL, the password and the encoded password', () => {
    const url = 'postgresql://u:p%40ss@h.example:5432/db';
    const masked = maskSecret(`bad ${url} and p@ss and p%40ss`, url);
    expect(masked).toBe('bad *** and *** and ***');
  });

  it('leaves text alone when there is no URL', () => {
    expect(maskSecret('hello', undefined)).toBe('hello');
  });
});

describe('repository wiring', () => {
  it('has the runner folder with a dependency-free ES module package', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'supabase', 'migrate', 'package.json'), 'utf8'));
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.devDependencies).toBeUndefined();
    expect(existsSync(join(process.cwd(), 'supabase', 'migrate', 'migrate.mjs'))).toBe(true);
  });

  it('the runner never reads the connection string from the command line', () => {
    const src = readFileSync(join(process.cwd(), 'supabase', 'migrate', 'migrate.mjs'), 'utf8');
    expect(src).toMatch(/process\.env\.DATABASE_URL|env\.DATABASE_URL/);
    expect(src).not.toMatch(/--url|--database/);
  });
});
