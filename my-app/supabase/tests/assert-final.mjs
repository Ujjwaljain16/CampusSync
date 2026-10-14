// Final-state checks after migrations 00-08, plus guard and idempotency tests on fresh instances.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FILES = ['00_preflight', '01_expand', '02_integrity', '03_indexes', '04_policies_safe', '05_lock_audit_writes', '06_credentials_service_only', '07_default_pending', '08_contract'].map((n) => `${MIG}20261015_${n}.sql`).concat(`${MIG}20261016_02_rate_limits.sql`);
const LIVE = readFileSync(new URL('./live-schema.sql', import.meta.url), 'utf8');

const OWNER = '00000000-0000-4000-8000-00000000a001';
const OA1 = '00000000-0000-4000-8000-00000000a002';
const STU1 = '00000000-0000-4000-8000-00000000a004';
const STU2 = '00000000-0000-4000-8000-00000000a005';
const FAC1 = '11111111-1111-4111-8111-111111111111';
const ORG_A = '00000000-0000-4000-8000-00000000b001';

export default async function ({ db, as, q, check, expectError }) {
  const tx = async (fn) => {
    await db.exec('begin');
    try { return await fn(); } finally { await db.exec('rollback'); }
  };
  const claims = (sub) => db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub, role: 'authenticated' })}', true)`);
  const names = async (sql) => (await q(sql)).map((r) => r.n);
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  console.log('\n[final shape]');
  const tables = await names(`select table_name as n from information_schema.tables where table_schema = 'public' and table_type in ('BASE TABLE') `);
  check('exactly the 14 intended tables remain (13 + rate_limits)', same(tables, ['allowed_domains', 'audit_logs', 'certificates', 'organization_domains', 'organizations', 'profiles', 'rate_limits', 'recruiter_contacts', 'recruiter_favorites', 'recruiter_pipeline', 'role_requests', 'trusted_issuers', 'user_roles', 'verifiable_credentials']), JSON.stringify(tables));
  const fns = await names(`select p.proname as n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname <> 'uuid_generate_v4'`);   // uuid_generate_v4 is a shim of the test model
  check('exactly the intended functions remain (27 legacy ones gone)', same(fns, [
    'authz_actor_rank', 'authz_has_role_row', 'authz_is_super_admin', 'authz_role_rank', 'check_and_reserve_slug', 'generate_organization_slug',
    'get_user_org_id', 'is_org_admin_no_rls', 'is_super_admin_no_rls', 'rate_limit_hit', 'transfer_primary_admin',
    'audit_logs_immutable', 'auto_designate_first_org_admin', 'certificates_before_write', 'guard_last_org_admin', 'guard_last_super_admin', 'organizations_guard',
    'profiles_guard', 'protect_primary_admin', 'set_updated_at', 'sync_org_domains', 'sync_org_primary_admin',
    'update_organizations_updated_at', 'update_recruiter_pipeline_updated_at', 'vc_before_write']), JSON.stringify(fns));
  const col = async (t, c) => (await q(`select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`, [t, c])).length > 0;
  check('certificates.status is gone', !(await col('certificates', 'status')));
  check('profiles.role and profiles.company are gone', !(await col('profiles', 'role')) && !(await col('profiles', 'company')));
  check('user_roles.is_super_admin is gone', !(await col('user_roles', 'is_super_admin')));
  check('audit_logs.target_user_id is gone', !(await col('audit_logs', 'target_user_id')));
  check('organizations.usage_stats is gone', !(await col('organizations', 'usage_stats')));
  const [{ d }] = await q(`select column_default as d from information_schema.columns where table_name = 'user_roles' and column_name = 'approval_status'`);
  check("approval_status now defaults to 'pending'", /pending/.test(d));
  const [{ a1, a2, a3 }] = await q(`select has_function_privilege('anon', 'public.check_and_reserve_slug(text)', 'execute') as a1,
      has_function_privilege('anon', 'public.generate_organization_slug(text)', 'execute') as a2,
      has_function_privilege('authenticated', 'public.check_and_reserve_slug(text)', 'execute') as a3`);
  check('anonymous callers can no longer use the slug functions; signed-in callers still can', a1 === false && a2 === false && a3 === true);

  console.log('\n[policies by role]');
  await expectError('a student cannot write audit rows', () => as(STU1, (d) =>
    d.exec(`insert into public.audit_logs (actor_id, action) values ('${STU1}', 'forged')`)), /permission denied|row-level security/);
  const stuSees = await as(STU1, async (d) => (await d.query(`select count(*)::int as n from public.audit_logs where organization_id = '${ORG_A}'`)).rows[0].n);
  const adminSees = await as(OA1, async (d) => (await d.query(`select count(*)::int as n from public.audit_logs where organization_id = '${ORG_A}'`)).rows[0].n);
  check('a student cannot read the organization audit trail', stuSees === 0, `saw ${stuSees}`);
  check('an organization admin can read it', adminSees >= 1, `saw ${adminSees}`);
  const ownerSees = await as(OWNER, async (d) => (await d.query(`select count(*)::int as n from public.audit_logs where organization_id is null`)).rows[0].n);
  check('a super admin can read platform-level events', ownerSees >= 1, `saw ${ownerSees}`);
  await expectError('a signed-in user cannot insert a credential row', () => as(STU1, (d) =>
    d.exec(`insert into public.verifiable_credentials (id, issuer, issuance_date, credential, student_id) values ('urn:uuid:12121212-aaaa-4aaa-8aaa-121212121212', 'i', now(), '{}', '${STU1}')`)), /permission denied|row-level security/);
  await expectError('a non super admin cannot change the global domain list', () => as(FAC1, (d) =>
    d.exec(`insert into public.allowed_domains (domain) values ('evil.example')`)), /row-level security|permission denied/);
  await as(OWNER, (d) => d.exec(`insert into public.allowed_domains (domain) values ('ok.example')`));
  check('a super admin can', true);
  await tx(async () => {
    await claims(OA1);
    await db.exec(`update public.organizations set name = 'Renamed' where id = '${ORG_A}'`);
    check('an organization admin can still edit ordinary organization fields', true);
  });
  await tx(async () => {
    await claims(OA1);
    await expectError('...but not flip is_verified', () => db.exec(
      `update public.organizations set is_verified = true where id = '${ORG_A}'`), /super admin/);
  });
  await tx(async () => {
    await claims(OA1);
    await expectError('...nor change the slug', () => db.exec(
      `update public.organizations set slug = 'taken-over' where id = '${ORG_A}'`), /super admin/);
  });
  await tx(async () => {
    await claims(OA1);
    await expectError('...nor upgrade the subscription', () => db.exec(
      `update public.organizations set subscription = '{"plan":"enterprise"}' where id = '${ORG_A}'`), /super admin/);
  });
  await tx(async () => {
    await claims(OWNER);
    await db.exec(`update public.organizations set is_verified = true where id = '${ORG_A}'`);
    check('a super admin can', true);
  });
  const created = await as(STU1, async (d) => {
    await d.exec(`insert into public.certificates (student_id, file_url, title, organization_id) values ('${STU1}', 'https://p.supabase.co/storage/v1/object/public/certificates/${STU1}/9_z.pdf', 'New', '${ORG_A}')`);
    return (await d.query(`select verification_status from public.certificates where title = 'New'`)).rows[0];
  });
  check('student can still upload a pending certificate (policy rewritten without the legacy column)', created.verification_status === 'pending');
  await expectError('...but not a verified one', () => as(STU1, (d) =>
    d.exec(`insert into public.certificates (student_id, file_url, title, organization_id, verification_status) values ('${STU1}', 'x', 'Fake', '${ORG_A}', 'verified')`)), /row-level security/);

  console.log('\n[behaviour still holds after the contract step]');
  await tx(async () => {
    await db.exec(`update public.certificates set verification_status = 'verified' where title = 'Pending cert'`);
    const [c] = await q(`select reviewed_at from public.certificates where title = 'Pending cert'`);
    check('reviewed_at trigger still works without the status column', c.reviewed_at !== null);
  });
  await tx(async () => {
    await db.exec(`insert into public.audit_logs (actor_id, action, organization_id) values ('${OWNER}', 'probe', '00000000-0000-0000-0000-000000000001')`);
    await db.exec(`delete from public.organizations where id = '00000000-0000-0000-0000-000000000001'`);
    const [r] = await q(`select organization_id from public.audit_logs where action = 'probe'`);
    check('organization delete still keeps its audit rows', r && r.organization_id === null);
  });
  await expectError('audit_logs still append-only', () => db.exec(`update public.audit_logs set action = 'x'`), /append-only/);
  await tx(async () => {
    await db.exec(`insert into public.user_roles (user_id, role, organization_id, approval_status) values ('${FAC1}', 'admin', '00000000-0000-4000-8000-00000000b002', 'approved')`);
    check('assigning the first admin role works', true);
  });
  await expectError('the last super admin is still protected', () => db.exec(`delete from public.user_roles where user_id = '${OWNER}'`), /last super admin/);

  console.log('\n[global rate limiter: rate_limits + rate_limit_hit]');
  {
    const hit = async (d, key, windowSeconds, limit) =>
      (await d.query('select * from public.rate_limit_hit($1, $2, $3)', [key, windowSeconds, limit])).rows[0];
    const asService = (fn) => as(STU1, fn, 'service_role');

    const [{ rls, nPolicies }] = await q(`select c.relrowsecurity as rls, (select count(*)::int from pg_policies where tablename = 'rate_limits') as "nPolicies"
                                          from pg_class c where c.oid = 'public.rate_limits'::regclass`);
    check('RLS is enabled on rate_limits and it has no policies', rls === true && nPolicies === 0, `rls=${rls} policies=${nPolicies}`);
    const [fn] = await q(`select prosecdef, proconfig from pg_proc where proname = 'rate_limit_hit'`);
    check('rate_limit_hit is SECURITY DEFINER with a pinned search_path', fn.prosecdef === true && /search_path=public, pg_temp/.test((fn.proconfig ?? []).join(';')), JSON.stringify(fn));

    // counter and flip to blocked
    const rows = await asService(async (d) => {
      const out = [];
      for (let i = 0; i < 5; i++) out.push(await hit(d, 'k-flip', 3600, 3));
      return out;
    });
    check('the counter increments on every call (remaining 2,1,0,0,0)', JSON.stringify(rows.map((r) => r.remaining)) === '[2,1,0,0,0]', JSON.stringify(rows));
    check('allowed is true up to the limit and false after it', JSON.stringify(rows.map((r) => r.allowed)) === '[true,true,true,false,false]', JSON.stringify(rows));
    check('reset_at is the end of the current window (in the future, within the window)', rows.every((r) => {
      const ms = new Date(r.reset_at).getTime() - Date.now();
      return ms > 0 && ms <= 3600 * 1000 + 1000;
    }));

    // keys are independent
    await asService(async (d) => {
      await hit(d, 'k-a', 60, 1);
      const a2 = await hit(d, 'k-a', 60, 1);
      const b1 = await hit(d, 'k-b', 60, 1);
      check('another key has its own counter', a2.allowed === false && b1.allowed === true);
    });

    // a new window starts again at 1 and leaves the old window alone
    await tx(async () => {
      await db.exec(`insert into public.rate_limits (key, window_start, count) values ('k-win', to_timestamp(floor(extract(epoch from now()) / 60) * 60) - interval '60 seconds', 99)`);
      const r = await hit(db, 'k-win', 60, 5);
      const n = await q(`select count(*)::int as n from public.rate_limits where key = 'k-win'`);
      const prev = await q(`select count from public.rate_limits where key = 'k-win' order by window_start limit 1`);
      check('a new window resets the counter to 1 (old window untouched)', r.allowed === true && r.remaining === 4 && n[0].n === 2 && prev[0].count === 99, JSON.stringify([r, n, prev]));
    });

    // privileges
    for (const role of ['anon', 'authenticated']) {
      await expectError(`${role} cannot read the table`, () => as(STU1, (d) => d.query('select * from public.rate_limits'), role), /permission denied/);
      await expectError(`${role} cannot insert into the table`, () => as(STU1, (d) => d.exec(`insert into public.rate_limits (key, window_start, count) values ('x', now(), 1)`), role), /permission denied/);
      await expectError(`${role} cannot update the table`, () => as(STU1, (d) => d.exec('update public.rate_limits set count = 0'), role), /permission denied/);
      await expectError(`${role} cannot delete from the table`, () => as(STU1, (d) => d.exec('delete from public.rate_limits'), role), /permission denied/);
      await expectError(`${role} cannot execute rate_limit_hit`, () => as(STU1, (d) => hit(d, 'x', 60, 1), role), /permission denied for function/);
    }
    const [priv] = await q(`select has_function_privilege('service_role', 'public.rate_limit_hit(text, integer, integer)', 'execute') as svc,
                                   has_function_privilege('public', 'public.rate_limit_hit(text, integer, integer)', 'execute') as pub`);
    check('only the service role can execute rate_limit_hit', priv.svc === true && priv.pub === false);

    // argument validation
    const bad = [
      ['empty key', ['', 60, 1]], ['null key', [null, 60, 1]], ['key over 200 characters', ['k'.repeat(201), 60, 1]],
      ['window 0', ['k', 0, 1]], ['window over a day', ['k', 86401, 1]], ['null window', ['k', null, 1]],
      ['limit 0', ['k', 60, 0]], ['limit over 100000', ['k', 60, 100001]], ['null limit', ['k', 60, null]],
    ];
    for (const [name, args] of bad) {
      await expectError(`bad argument rejected: ${name}`, () => asService((d) => hit(d, ...args)), /rate_limit_hit:/);
    }
    await asService(async (d) => {
      const edge = await hit(d, 'k'.repeat(200), 86400, 100000);
      check('boundary arguments (200 chars, 86400 s, 100000) are accepted', edge.allowed === true && edge.remaining === 99999);
    });

    // cleanup of expired windows
    await tx(async () => {
      await db.exec(`insert into public.rate_limits (key, window_start, count)
                     select 'old-' || g, now() - interval '2 days', 1 from generate_series(1, 30) g`);
      await db.exec(`insert into public.rate_limits (key, window_start, count) values ('recent', now() - interval '2 hours', 1)`);
      await hit(db, 'trigger', 60, 5);
      const [{ n: afterOne }] = await q(`select count(*)::int as n from public.rate_limits where key like 'old-%'`);
      check('one call removes a small batch (20) of expired windows, not all of them', afterOne === 10, `left ${afterOne}`);
      await hit(db, 'trigger', 60, 5);
      await hit(db, 'trigger', 60, 5);
      const [{ n: afterAll }] = await q(`select count(*)::int as n from public.rate_limits where key like 'old-%'`);
      check('further calls finish the cleanup', afterAll === 0, `left ${afterAll}`);
      const [{ n: kept }] = await q(`select count(*)::int as n from public.rate_limits where key in ('recent', 'trigger')`);
      check('windows younger than a day and the live counter are kept', kept === 2);
    });
  }

  console.log('\n[contract-step guard: refuses to drop a table that holds data]');
  {
    const g = new PGlite();
    await g.exec(LIVE);
    for (const f of FILES.slice(1, 8)) await g.exec(readFileSync(f, 'utf8'));
    await g.exec(`insert into public.documents (student_id, user_id, document_type, title, file_url, organization_id)
                  values ('${STU1}', '${STU1}', 'certificate', 'keep me', 'x', '${ORG_A}')`);
    let msg = '';
    try { await g.exec(readFileSync(FILES[8], 'utf8')); } catch (e) { msg = e.message; await g.exec('rollback'); }
    check('08 refuses to drop documents when it holds a row', /still has 1 rows/.test(msg), msg);
    const still = await g.query(`select to_regclass('public.documents') is not null as present`);
    check('...and the failed transaction rolled everything back (documents still present, policies intact)', still.rows[0].present === true);
    const cols = await g.query(`select 1 from information_schema.columns where table_name = 'certificates' and column_name = 'status'`);
    check('...including the certificates.status drop', cols.rows.length === 1);
  }

  console.log('\n[idempotency: the whole chain applied twice]');
  {
    const g = new PGlite();
    await g.exec(LIVE);
    let err = '';
    try {
      for (const f of FILES) await g.exec(readFileSync(f, 'utf8'));
      for (const f of FILES) await g.exec(readFileSync(f, 'utf8'));
    } catch (e) { err = e.message; }
    check('second pass runs without error', err === '', err);
  }
}
