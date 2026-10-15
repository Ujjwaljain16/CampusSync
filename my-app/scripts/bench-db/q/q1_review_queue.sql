\set on random(1,40)
select quote_literal(id::text) as oid from public.bench_orgs where n = :on \gset
select id, student_id, file_url, title, institution, date_issued, created_at, confidence_score from public.certificates where organization_id = :oid and verification_status = 'pending' order by created_at desc limit 50;
