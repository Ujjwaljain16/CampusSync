-- migrate: phase=post
-- Private certificates bucket. Idempotent. Plain ASCII on purpose. ONE transaction.
--
-- *** APPLY ONLY AFTER the application code that serves files through signed URLs is DEPLOYED
-- *** (GET /api/certificates/[id]/file and the UI that uses it). The moment this runs, every old
-- *** public object URL stops working; a build that still links to them would show broken files.
-- *** See docs/PRIVATE-STORAGE.md for the deploy order and the rollback.
--
-- What it does:
--   1. Marks the bucket `certificates` as not public.
--   2. Replaces the policies on storage.objects for this bucket with exactly four owner-folder
--      policies: an authenticated user may insert / read / update / delete only the objects whose
--      first path segment is their own user id. There is no anon access.
--   3. Drops any other policy that is written only for this bucket (for example a "public read"
--      policy created by hand). Policies that also mention other buckets are left alone and reported.
--
-- Reviewers (faculty, admins) never get a storage policy: the server checks authorization and
-- then creates a short-lived signed URL with the service role.

begin;

update storage.buckets set public = false where id = 'certificates';

-- Remove other policies that mention only this bucket (by name guard: ours are kept and recreated below).
do $$
declare
  pol record;
  other_buckets integer;
begin
  for pol in
    select policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as def
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname not in (
        'certificates_owner_read',
        'certificates_owner_insert',
        'certificates_owner_update',
        'certificates_owner_delete'
      )
      and (coalesce(qual, '') like '%certificates%' or coalesce(with_check, '') like '%certificates%')
  loop
    select count(*) into other_buckets
    from regexp_matches(pol.def, 'bucket_id\s*=\s*''([^'']+)''', 'g') as m
    where m[1] <> 'certificates';

    -- a list of buckets (IN / ANY) is treated as "mentions other buckets": never dropped automatically
    if other_buckets = 0 and pol.def !~* '(any\s*\(|\sin\s*\()' then
      execute format('drop policy %I on storage.objects', pol.policyname);
      raise notice 'dropped policy % (certificates only)', pol.policyname;
    else
      raise notice 'kept policy % (mentions other buckets too): review it by hand', pol.policyname;
    end if;
  end loop;
end
$$;

drop policy if exists "certificates_owner_read" on storage.objects;
drop policy if exists "certificates_owner_insert" on storage.objects;
drop policy if exists "certificates_owner_update" on storage.objects;
drop policy if exists "certificates_owner_delete" on storage.objects;

create policy "certificates_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "certificates_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "certificates_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "certificates_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

commit;

-- Verify after applying:
--   select id, public from storage.buckets where id = 'certificates';
--     -- expect public = false
--
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;
--     -- expect the four certificates_owner_* rows (authenticated), and no policy for roles {public} or {anon}
--     -- that can read bucket 'certificates' (also check policies that name no bucket at all).
--
-- Rollback (only if the app must be served with public links again):
--   update storage.buckets set public = true where id = 'certificates';
