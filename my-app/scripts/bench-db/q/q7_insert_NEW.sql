\set sn random(1,100000)
select quote_literal(u.id::text) as sid, quote_literal(o.id::text) as oid from public.bench_users u join public.bench_orgs o on o.n = u.org_n where u.n = :sn \gset
insert into public.certificates (student_id, file_url, verification_status, title, institution, organization_id) values (:sid, 'https://example/x.pdf', 'pending', 'T', 'I', :oid);
