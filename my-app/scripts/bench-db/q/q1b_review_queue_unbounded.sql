-- NOT PART OF THE REPORTED RESULTS. Mirrors the application route `certificates/pending` more closely than
-- q1_review_queue.sql: no LIMIT and every column. Run it by hand, for example:
--   docker exec cs-bench pgbench -U postgres -n -c 8 -j 4 -T 20 -f /tmp/q/q1b_review_queue_unbounded.sql bench_old
-- (copy the file into the container first). No result for this query has been recorded.
\set on random(1,40)
select quote_literal(id::text) as oid from public.bench_orgs where n = :on \gset
select * from public.certificates where organization_id = :oid and verification_status = 'pending' order by created_at desc;
