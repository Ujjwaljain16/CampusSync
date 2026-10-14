\set on random(1,40)
select quote_literal(id::text) as oid from public.bench_orgs where n = :on \gset
select verification_status, count(*), avg(confidence_score), count(*) filter (where auto_approved) from public.certificates where organization_id = :oid group by 1;
