\set un random(1,102000)
select quote_literal(id::text) as uid from public.bench_users where n = :un \gset
select role, organization_id, approval_status, created_at from public.user_roles where user_id = :uid order by created_at asc;
