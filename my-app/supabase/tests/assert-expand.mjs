// Behavioural checks for migrations 01-03 against the model of the live database.
const OWNER = '00000000-0000-4000-8000-00000000a001';
const OA1 = '00000000-0000-4000-8000-00000000a002'; // primary admin of Org A
const STU1 = '00000000-0000-4000-8000-00000000a004';
const STU2 = '00000000-0000-4000-8000-00000000a005';
const FAC1 = '11111111-1111-4111-8111-111111111111';
const ORG_A = '00000000-0000-4000-8000-00000000b001';
const ORG_B = '00000000-0000-4000-8000-00000000b002';
const ORG_DEFAULT = '00000000-0000-0000-0000-000000000001';
const CERT_PENDING = 'aaaaaaaa-0000-4000-8000-000000000005';
const CERT_VERIFIED = '00000000-0000-4000-8000-00000000c001';

export default async function ({ db, as, q, check, expectError }) {
  const tx = async (fn) => {
    await db.exec('begin');
    try { return await fn(); } finally { await db.exec('rollback'); }
  };
  const claims = (sub) => db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub, role: 'authenticated' })}', true)`);

  console.log('\n[profiles]');
  const [rec] = await q(`select company_name, phone, public_portfolio_enabled, recruiter_share_contact from public.profiles where id = '22222222-2222-4222-8222-222222222222'`);
  check('company carried over to company_name', rec.company_name === 'Corp');
  check('privacy switches default to false', rec.public_portfolio_enabled === false && rec.recruiter_share_contact === false);
  await tx(async () => {
    await db.exec(`update public.profiles set gpa = 10 where id = '${STU1}'`);
    check('gpa 10.00 now fits', true);
    await db.exec(`update public.profiles set role = 'org_admin' where id = '${OA1}'`);
    check('profiles.role accepts org_admin', true);
  });
  await tx(async () => {
    const [{ before }] = await q(`select updated_at as before from public.profiles where id = '${STU1}'`);
    await db.exec(`select pg_sleep(0.01)`);
    await db.exec(`update public.profiles set location = 'X' where id = '${STU1}'`);
    const [{ after }] = await q(`select updated_at as after from public.profiles where id = '${STU1}'`);
    check('updated_at trigger moves forward', new Date(after) > new Date(before));
  });
  await expectError('profile organization must be one the user belongs to', () => as(STU2, (d) =>
    d.exec(`update public.profiles set organization_id = '${ORG_B}' where id = '${STU2}'`)), /belong to/);

  console.log('\n[certificates]');
  const [{ n_mirror }] = await q(`select count(*)::int as n_mirror from public.certificates where status is distinct from case verification_status when 'verified' then 'approved' else verification_status end`);
  check('status mirrors verification_status for every row (4 drifting rows repaired)', n_mirror === 0);
  const [{ ok_path }] = await q(`select bool_and(storage_path is not null and file_url like '%' || storage_path) as ok_path from public.certificates`);
  check('storage_path backfilled from file_url', ok_path === true);
  const [{ t }] = await q(`select pg_typeof(date_issued)::text as t from public.certificates limit 1`);
  check('date_issued is a date', t === 'date');
  await tx(async () => {
    await db.exec(`update public.certificates set verification_status = 'rejected' where id = '${CERT_PENDING}'`);
    const [c] = await q(`select status, reviewed_at from public.certificates where id = '${CERT_PENDING}'`);
    check('rejecting sets status mirror and reviewed_at', c.status === 'rejected' && c.reviewed_at !== null);
    await db.exec(`update public.certificates set verification_status = 'pending' where id = '${CERT_PENDING}'`);
    const [c2] = await q(`select status, reviewed_at from public.certificates where id = '${CERT_PENDING}'`);
    check('reverting to pending clears reviewed_at', c2.status === 'pending' && c2.reviewed_at === null);
    // old code writes both columns together: must keep working
    await db.exec(`update public.certificates set verification_status = 'verified', status = 'approved' where id = '${CERT_PENDING}'`);
    check('legacy dual write still accepted', true);
  });
  await expectError('title can no longer be NULL', () => db.exec(
    `insert into public.certificates (student_id, file_url, title, organization_id) values ('${STU1}', 'x', null, '${ORG_A}')`), /null value/);
  await expectError('organization with certificates cannot be hard-deleted', () => db.exec(
    `delete from public.organizations where id = '${ORG_A}'`), /foreign key|violates/);
  const created = await as(STU1, async (d) => {
    await d.exec(`insert into public.certificates (student_id, file_url, title, organization_id) values ('${STU1}', 'https://p.supabase.co/storage/v1/object/public/certificates/${STU1}/9_z.pdf', 'New', '${ORG_A}')`);
    return (await d.query(`select verification_status, status, storage_path from public.certificates where title = 'New'`)).rows[0];
  });
  check('student insert still works (pending)', created.verification_status === 'pending' && created.status === 'pending');
  await expectError('student cannot insert an already verified certificate (RLS)', () => as(STU1, (d) =>
    d.exec(`insert into public.certificates (student_id, file_url, title, organization_id, verification_status) values ('${STU1}', 'x', 'Fake', '${ORG_A}', 'verified')`)), /row-level security/);

  console.log('\n[verifiable_credentials]');
  const [{ linked, org_linked, stale_null }] = await q(`select
      count(*) filter (where certificate_id is not null)::int as linked,
      count(*) filter (where organization_id is not null)::int as org_linked,
      count(*) filter (where certificate_id is null)::int as stale_null from public.verifiable_credentials`);
  check('4 credentials linked to their certificate, 1 stale one left unlinked', linked === 4 && stale_null === 1);
  check('organization_id backfilled from the certificate', org_linked === 4);
  await tx(async () => {
    await db.exec(`insert into public.verifiable_credentials (id, issuer, issuance_date, credential, student_id)
      values ('urn:uuid:99999999-aaaa-4aaa-8aaa-999999999999', 'did:web:x.test', now(), '{"credentialSubject":{"certificateId":"${CERT_PENDING}"}}', '${STU2}')`);
    const [v] = await q(`select certificate_id, organization_id from public.verifiable_credentials where id = 'urn:uuid:99999999-aaaa-4aaa-8aaa-999999999999'`);
    check('insert with only the signed JSON auto-fills certificate_id and organization_id', v.certificate_id === CERT_PENDING && v.organization_id === ORG_A);
    await expectError('second ACTIVE credential for the same certificate is rejected', () => db.exec(
      `insert into public.verifiable_credentials (id, issuer, issuance_date, credential, student_id)
       values ('urn:uuid:88888888-aaaa-4aaa-8aaa-888888888888', 'did:web:x.test', now(), '{"credentialSubject":{"certificateId":"${CERT_PENDING}"}}', '${STU2}')`), /duplicate key|unique/);
  });
  const byStudent = await as('63b4c2af-657f-4a2a-9494-451dc5045b2e'.replace('63b4c2af-657f-4a2a-9494-451dc5045b2e', STU2), async (d) => {
    await d.exec(`insert into public.verifiable_credentials (id, issuer, issuance_date, credential, student_id)
      values ('urn:uuid:abababab-aaaa-4aaa-8aaa-abababababab', 'did:web:x.test', now(), '{"credentialSubject":{"certificateId":"${CERT_PENDING}"}}', '${STU2}')`);
    return (await d.query(`select certificate_id, organization_id from public.verifiable_credentials where id = 'urn:uuid:abababab-aaaa-4aaa-8aaa-abababababab'`)).rows[0];
  });
  check('a signed-in student inserting through the API still gets certificate_id / organization_id filled by the trigger',
    byStudent.certificate_id === CERT_PENDING && byStudent.organization_id === ORG_A);
  await expectError('status must be active or revoked', () => db.exec(
    `insert into public.verifiable_credentials (id, issuer, issuance_date, credential, student_id, status) values ('urn:uuid:77777777-aaaa-4aaa-8aaa-777777777777', 'i', now(), '{}', '${STU1}', 'bogus')`), /check/);
  await expectError('a revoked credential must carry revoked_at (new writes)', () => db.exec(
    `insert into public.verifiable_credentials (id, issuer, issuance_date, credential, student_id, status) values ('urn:uuid:66666666-aaaa-4aaa-8aaa-666666666666', 'i', now(), '{}', '${STU1}', 'revoked')`), /check/);
  await tx(async () => {
    // a credential outlives its certificate
    await db.exec(`delete from public.certificates where id = '${CERT_VERIFIED}'`);
    const [v] = await q(`select certificate_id from public.verifiable_credentials where id = 'urn:uuid:11111111-aaaa-4aaa-8aaa-111111111111'`);
    check('deleting a certificate keeps the credential row and nulls the link', v && v.certificate_id === null);
  });

  console.log('\n[audit_logs]');
  const [{ ty }] = await q(`select data_type as ty from information_schema.columns where table_name = 'audit_logs' and column_name = 'target_id'`);
  check('target_id is text', ty === 'text');
  const [al] = await q(`select target_type, target_id from public.audit_logs where action = 'role_assign'`);
  check('target_user_id folded into (target_type, target_id)', al.target_type === 'user' && al.target_id === STU1);
  await tx(async () => {
    await db.exec(`insert into public.audit_logs (actor_id, action, target_type, target_id) values ('${OWNER}', 'revoke_vc', 'credential', 'urn:uuid:11111111-aaaa-4aaa-8aaa-111111111111')`);
    check('a urn:uuid credential id can finally be logged', true);
  });
  await expectError('audit_logs UPDATE is refused', () => db.exec(`update public.audit_logs set action = 'x'`), /append-only/);
  await expectError('audit_logs DELETE is refused', () => db.exec(`delete from public.audit_logs`), /append-only/);
  await expectError('audit_logs TRUNCATE is refused', () => db.exec(`truncate public.audit_logs`), /append-only/);
  await tx(async () => {
    await db.exec(`insert into public.audit_logs (actor_id, action, organization_id) values ('${OWNER}', 'probe', '${ORG_DEFAULT}')`);
    await db.exec(`delete from public.organizations where id = '${ORG_DEFAULT}'`);
    const [r] = await q(`select organization_id from public.audit_logs where action = 'probe'`);
    check('deleting an organization keeps its audit rows (organization_id becomes NULL)', r && r.organization_id === null);
  });
  await expectError('deleting the user account of an organization\'s only admin is refused', () => db.exec(
    `delete from auth.users where id = '${OA1}'`), /at least one approved admin/);
  await tx(async () => {
    await db.exec(`select set_config('app.bypass_last_admin_guard', 'on', true)`);   // deliberate offboarding
    await db.exec(`delete from auth.users where id = '${OA1}'`);   // a primary admin who is also an audit actor
    const [r] = await q(`select count(*)::int as n, count(actor_id)::int as with_actor from public.audit_logs where action = 'manual_approve'`);
    check('with the explicit bypass the user can be deleted and their audit rows are kept (actor becomes NULL)', r.n === 1 && r.with_actor === 0);
  });

  console.log('\n[organization_domains]');
  const doms = (await q(`select domain from public.organization_domains order by domain`)).map((r) => r.domain);
  check('backfilled from settings', JSON.stringify(doms) === JSON.stringify(['*.a.edu', 'a.edu', 'b.edu']), JSON.stringify(doms));
  await expectError('a domain already claimed by another organization is rejected by the database', () => db.exec(
    `update public.organizations set settings = jsonb_set(settings, '{allowed_email_domains}', '["b.edu","a.edu"]') where id = '${ORG_B}'`), /duplicate key|unique/);
  await tx(async () => {
    await db.exec(`update public.organizations set settings = jsonb_set(settings, '{allowed_email_domains}', '["a.edu","not a domain"]') where id = '${ORG_A}'`);
    const d = (await q(`select domain from public.organization_domains where organization_id = '${ORG_A}'`)).map((r) => r.domain);
    check('removed and invalid entries are not kept', JSON.stringify(d) === JSON.stringify(['a.edu']), JSON.stringify(d));
  });

  console.log('\n[user_roles]');
  await tx(async () => {
    await db.exec(`insert into public.user_roles (user_id, role, organization_id, approval_status) values ('${FAC1}', 'admin', '${ORG_B}', 'approved')`);
    const [r] = await q(`select is_super_admin from public.user_roles where user_id = '${FAC1}' and role = 'admin'`);
    check('first "admin" role no longer collides with the legacy super-admin flag', r.is_super_admin === false);
  });
  await expectError('super_admin must be platform level', () => db.exec(
    `insert into public.user_roles (user_id, role, organization_id, approval_status) values ('${FAC1}', 'super_admin', '${ORG_B}', 'approved')`), /check/);
  await tx(async () => {
    await db.exec(`update public.user_roles set role = 'admin' where user_id = '${FAC1}' and organization_id = '${ORG_A}'`);   // a second admin
    await db.exec(`update public.user_roles set role = 'faculty', is_primary_admin = false where user_id = '${OA1}'`);
    check('an organization with a second admin can change its first admin', true);
  });
  await expectError('an organization cannot lose its only admin (demotion)', () => db.exec(
    `update public.user_roles set role = 'faculty', is_primary_admin = false where user_id = '${OA1}'`), /at least one approved admin/);
  await expectError('the last super admin cannot be deleted', () => db.exec(`delete from public.user_roles where user_id = '${OWNER}'`), /last super admin/);
  await expectError('the last super admin cannot be demoted', () => db.exec(`update public.user_roles set role = 'admin' where user_id = '${OWNER}'`), /check|last super admin/);
  await tx(async () => {
    await claims(FAC1);
    await expectError('a normal user cannot strip the primary admin flag', () => db.exec(
      `update public.user_roles set is_primary_admin = false where user_id = '${OA1}'`), /primary/);
  });
  await tx(async () => {
    await claims(FAC1);
    await expectError('a normal user cannot delete the primary admin', () => db.exec(
      `delete from public.user_roles where user_id = '${OA1}'`), /primary/);
  });
  await tx(async () => {
    await claims(OWNER);
    await db.exec(`update public.user_roles set is_primary_admin = false where user_id = '${OA1}'`);
    check('a super admin can change the primary admin', true);
  });
  await tx(async () => {
    const [{ pa }] = await q(`select primary_admin_id as pa from public.organizations where id = '${ORG_A}'`);
    check('organizations.primary_admin_id backfilled', pa === OA1);
    await db.exec(`update public.user_roles set is_primary_admin = false where user_id = '${OA1}'`);   // backend context
    const [{ pa2 }] = await q(`select primary_admin_id as pa2 from public.organizations where id = '${ORG_A}'`);
    check('clearing the flag clears the pointer', pa2 === null);
    await db.exec(`update public.user_roles set is_primary_admin = true where user_id = '${OA1}'`);
    const [{ pa3 }] = await q(`select primary_admin_id as pa3 from public.organizations where id = '${ORG_A}'`);
    check('setting the flag restores the pointer', pa3 === OA1);
  });

  console.log('\n[role_requests]');
  const [{ idt }] = await q(`select data_type as idt from information_schema.columns where table_name = 'role_requests' and column_name = 'id'`);
  check('id is a uuid', idt === 'uuid');
  const [{ rr }] = await q(`select count(*)::int as rr from public.role_requests`);
  check('both existing requests kept', rr === 2);
  await expectError('one open request per (user, organization, role)', () => db.exec(
    `insert into public.role_requests (user_id, requested_role, organization_id) values ('${STU1}', 'faculty', '${ORG_A}')`), /duplicate key|unique/);

  console.log('\n[trusted_issuers / recruiter_*]');
  await expectError('issuer names are unique case-insensitively within a scope', () => db.exec(
    `insert into public.trusted_issuers (name) values ('coursera')`), /duplicate key|unique/);
  await tx(async () => {
    await db.exec(`insert into public.trusted_issuers (name, organization_id) values ('Coursera', '${ORG_A}')`);
    check('same issuer name allowed in another organization', true);
  });
  await expectError('recruiter_pipeline.organization_id is NOT NULL', () => db.exec(
    `insert into public.recruiter_pipeline (recruiter_id, student_id, stage) values ('${OWNER}', '${STU2}', 'shortlisted')`), /null value/);

  console.log('\n[indexes]');
  const idx = async (table) => (await q(`
    select i.relname as name from pg_index x
      join pg_class i on i.oid = x.indexrelid join pg_class t on t.oid = x.indrelid
     where t.relname = $1 and t.relnamespace = 'public'::regnamespace
       and not x.indisprimary
       and not exists (select 1 from pg_constraint c where c.conindid = x.indexrelid)
     order by i.relname`, [table])).map((r) => r.name);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const expect = {
    certificates: ['certificates_org_status_created_idx', 'certificates_student_created_idx', 'certificates_verified_student_idx', 'idx_certificates_faculty_id'],
    audit_logs: ['audit_logs_action_created_idx', 'audit_logs_actor_created_idx', 'audit_logs_org_created_idx', 'audit_logs_target_type_idx'],
    user_roles: ['idx_user_roles_approval_pending', 'unique_primary_admin_per_org', 'user_roles_org_role_status_idx'],
    organizations: [],
    allowed_domains: [],
    role_requests: ['idx_role_requests_user', 'role_requests_one_pending_idx', 'role_requests_org_status_created_idx'],
    verifiable_credentials: ['vc_one_active_per_certificate', 'vc_status_list_slot_key', 'verifiable_credentials_certificate_idx', 'verifiable_credentials_org_idx', 'verifiable_credentials_student_status_idx'],
  };
  for (const [table, want] of Object.entries(expect)) {
    const got = await idx(table);
    check(`${table} has exactly the intended secondary indexes`, eq(got, want.slice().sort()), JSON.stringify(got));
  }
}
