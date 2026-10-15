\pset pager off
select id as oid from public.bench_orgs where n = 7 \gset
select cert_id::text as cid from public.bench_sample_certs where n = 11 \gset
\echo === review queue (pending, one organization)
explain (analyze, buffers, timing on, summary on) select id, student_id, file_url, title, institution, date_issued, created_at, confidence_score from public.certificates where organization_id = :'oid' and verification_status = 'pending' order by created_at desc limit 50;
\echo === credential lookup by certificate (certificate_id column)
explain (analyze, buffers, timing on, summary on) select id, status from public.verifiable_credentials where certificate_id = :'cid'::uuid and status = 'active';
