\set sn random(1,100000)
select quote_literal(id::text) as sid from public.bench_users where n = :sn \gset
select id, title, institution, date_issued, file_url, verification_status, created_at, auto_approved from public.certificates where student_id = :sid order by created_at desc;
