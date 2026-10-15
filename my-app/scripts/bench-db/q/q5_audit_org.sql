\set on random(1,40)
select quote_literal(id::text) as oid from public.bench_orgs where n = :on \gset
select id, actor_id, action, target_id, created_at from public.audit_logs where organization_id = :oid order by created_at desc limit 50;
