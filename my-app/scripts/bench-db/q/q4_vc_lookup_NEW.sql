\set k random(1,2000)
select quote_literal(cert_id::text) as cid from public.bench_sample_certs where n = :k \gset
select id, status from public.verifiable_credentials where certificate_id = :cid::uuid and status = 'active';
