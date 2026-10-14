-- Schema cleanup, step 4 of 8: POLICIES THAT ARE SAFE TO APPLY NOW (no application change needed).
-- APPLIED to production 2026-10-15; apply after 20261015_03_indexes.sql (and 03b). Idempotent; one transaction. Plain ASCII on purpose.
--
-- What this does
--   * allowed_domains (the GLOBAL list of educational suffixes like ".edu"): only a super admin may change it.
--     Before, any user holding an "admin" role in any organization could.
--   * migration_status: no longer readable by every signed-in user (it is dropped in step 08 anyway).
--   * organizations: organization admins keep editing their own organization, but the sensitive columns (slug, type,
--     contact e-mail, activation, verification, subscription, primary admin, custom domains) can only be changed by a
--     super admin or the backend. Before, a direct API call could flip is_verified or upgrade the subscription.

begin;

-- ----------------------------------------------------------------------------- allowed_domains
drop policy if exists "Admins can manage domains" on public.allowed_domains;
drop policy if exists allowed_domains_super_admin_write on public.allowed_domains;
create policy allowed_domains_super_admin_write on public.allowed_domains
  for all to authenticated
  using (public.authz_is_super_admin())
  with check (public.authz_is_super_admin());
-- "Anyone can read active domains" stays: the e-mail pre-check needs it before sign-in.

-- ----------------------------------------------------------------------------- migration_status
do $$
begin
  if to_regclass('public.migration_status') is not null then      -- the table is dropped in step 08
    drop policy if exists authenticated_read_migration_status on public.migration_status;
    drop policy if exists super_admin_read_migration_status on public.migration_status;
    create policy super_admin_read_migration_status on public.migration_status
      for select to authenticated
      using (public.authz_is_super_admin());
  end if;
end $$;

-- ----------------------------------------------------------------------------- organizations
create or replace function public.organizations_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- only direct, signed-in (non super admin) writes are restricted; the backend (no JWT / service role) is trusted
  if auth.role() = 'authenticated' and not public.authz_is_super_admin() then
    if new.slug is distinct from old.slug
       or new.type is distinct from old.type
       or new.email is distinct from old.email
       or new.is_active is distinct from old.is_active
       or new.is_verified is distinct from old.is_verified
       or new.verified_at is distinct from old.verified_at
       or new.subscription is distinct from old.subscription
       or (to_jsonb(new) -> 'usage_stats') is distinct from (to_jsonb(old) -> 'usage_stats')   -- column dropped in step 08
       or new.primary_admin_id is distinct from old.primary_admin_id
       or new.created_by is distinct from old.created_by
       or new.subdomain is distinct from old.subdomain
       or new.custom_domain is distinct from old.custom_domain
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Only a super admin can change these organization fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.organizations_guard() from public, anon, authenticated;

drop trigger if exists trg_organizations_guard on public.organizations;
create trigger trg_organizations_guard before update on public.organizations
  for each row execute function public.organizations_guard();

commit;
