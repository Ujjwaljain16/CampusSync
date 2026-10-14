-- Synthetic benchmark data for the ORIGINAL (pre-cleanup) schema. Deterministic enough to compare runs.
\timing on
set session_replication_role = replica;   -- bulk load: skip triggers and FK checks (the data is generated consistent)
set synchronous_commit = off;
select setseed(0.42);

-- organizations (the model already has a few synthetic ones; add 40 more)
insert into public.organizations (id, name, slug, type, email)
select gen_random_uuid(), 'Bench Org ' || g, 'bench-org-' || g, 'university', 'org' || g || '@bench.test'
from generate_series(1, 40) g;

create table public.bench_orgs as
select row_number() over (order by id) as n, id from public.organizations where slug like 'bench-org-%';
alter table public.bench_orgs add primary key (n);

-- users: 100,000 students + 2,000 faculty
insert into auth.users (id, email)
select gen_random_uuid(), 'u' || g || '@bench.test' from generate_series(1, 102000) g;

create table public.bench_users as
select row_number() over (order by id) as n, id,
       ((row_number() over (order by id) - 1) % 40) + 1 as org_n,
       case when row_number() over (order by id) <= 100000 then 'student' else 'faculty' end as kind
from auth.users where email like 'u%@bench.test';
alter table public.bench_users add primary key (n);
create index on public.bench_users (kind, n);

insert into public.profiles (id, role, full_name, email, organization_id, university, graduation_year, major, location, gpa)
select u.id, u.kind, 'User ' || u.n, 'u' || u.n || '@bench.test', o.id,
       'University ' || u.org_n, 2024 + (u.n % 5), (array['CS','EE','ME','CE','BT'])[1 + u.n % 5], 'City ' || (u.n % 50), 6 + (u.n % 40) / 10.0
from public.bench_users u join public.bench_orgs o on o.n = u.org_n;

insert into public.user_roles (user_id, role, organization_id, approval_status)
select u.id, u.kind, o.id, 'approved' from public.bench_users u join public.bench_orgs o on o.n = u.org_n;

-- certificates: 1,000,000 (10 per student on average); ~5% pending, 20% rejected, rest verified
create table public.bench_certs as
select g as n, gen_random_uuid() as id,
       1 + (random() * 99999)::int as student_n,
       random() as r
from generate_series(1, 1000000) g;
alter table public.bench_certs add primary key (n);

insert into public.certificates (id, student_id, file_url, status, verification_status, confidence_score, auto_approved,
                                 title, institution, date_issued, description, organization_id, created_at, updated_at, verification_method)
select c.id, u.id,
       'https://example.supabase.co/storage/v1/object/public/certificates/' || u.id || '/' || c.n || '.pdf',
       case when c.r < 0.05 then 'pending' when c.r < 0.25 then 'rejected' else 'approved' end,
       case when c.r < 0.05 then 'pending' when c.r < 0.25 then 'rejected' else 'verified' end,
       round((0.55 + random() * 0.45)::numeric, 2), c.r > 0.9,
       'Course ' || (c.n % 500), 'Institute ' || (c.n % 40), now() - ((c.n % 700) || ' days')::interval,
       'This certificate confirms completion of course ' || (c.n % 500) || ' at institute ' || (c.n % 40) || '.',
       o.id, now() - ((c.n % 700) || ' days')::interval - ((c.n % 86400) || ' seconds')::interval, now(),
       case when c.r > 0.9 then 'ai_confidence' else 'manual' end
from public.bench_certs c
join public.bench_users u on u.n = c.student_n
join public.bench_orgs o on o.n = u.org_n;

-- credentials for the verified certificates that are among the first 280,000 verified (one per certificate)
insert into public.verifiable_credentials (id, issuer, issuance_date, credential, status, student_id, created_at)
select 'urn:uuid:' || gen_random_uuid(), 'did:web:bench.test', c.created_at,
       jsonb_build_object(
         '@context', jsonb_build_array('https://www.w3.org/2018/credentials/v1'),
         'type', jsonb_build_array('VerifiableCredential', 'AchievementCredential'),
         'issuer', 'did:web:bench.test',
         'credentialSubject', jsonb_build_object('id', c.student_id, 'certificateId', c.id::text, 'title', c.title, 'institution', c.institution),
         'proof', jsonb_build_object('type', 'JsonWebSignature2020', 'jws', repeat('A', 342))),
       case when c.n % 50 = 0 then 'revoked' else 'active' end, c.student_id, c.created_at
from (select cert.*, row_number() over () as n from public.certificates cert where cert.verification_status = 'verified' limit 280000) c;

-- audit log: 1,000,000 rows (organization-level events by faculty)
insert into public.audit_logs (actor_id, action, target_id, details, created_at, organization_id)
select f.id, (array['manual_approve','manual_reject','issue_vc','revert_approval','delete_certificate'])[1 + g % 5], gen_random_uuid(),
       jsonb_build_object('previous_status', 'pending', 'seq', g), now() - ((g % 700) || ' days')::interval - ((g % 86400) || ' seconds')::interval, o.id
from generate_series(1, 1000000) g
join public.bench_users f on f.n = 100001 + (g % 2000)
join public.bench_orgs o on o.n = f.org_n;

set session_replication_role = origin;

-- helper table for parameterised queries: 2,000 sampled certificates that have a credential
create table public.bench_sample_certs as
select row_number() over () as n, (credential #>> '{credentialSubject,certificateId}')::uuid as cert_id, student_id
from (select * from public.verifiable_credentials where status = 'active' limit 2000) v;
alter table public.bench_sample_certs add primary key (n);

analyze;
select 'organizations' t, count(*) from public.organizations union all
select 'profiles', count(*) from public.profiles union all
select 'user_roles', count(*) from public.user_roles union all
select 'certificates', count(*) from public.certificates union all
select 'verifiable_credentials', count(*) from public.verifiable_credentials union all
select 'audit_logs', count(*) from public.audit_logs;
