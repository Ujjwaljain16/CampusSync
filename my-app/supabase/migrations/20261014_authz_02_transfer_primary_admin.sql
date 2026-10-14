-- DRAFT — review against live schema before applying
--
-- Fixed transfer_primary_admin.
--
-- Problems of the current function:
--   * it checks the caller with auth.uid(), which is NULL when called through the
--     service-role client (every call from the API fails);
--   * it looks the target up by user_id only, i.e. it can pick the row of a
--     multi-org user in a different organization;
--   * no search_path pinned.
--
-- New contract (called ONLY by the API with the service-role client, after the
-- API has verified the caller is a super_admin):
--   select public.transfer_primary_admin(from_user_id, to_user_id, org_id, p_actor);
--
-- Facts used (live DB): UNIQUE NULLS NOT DISTINCT (user_id, organization_id);
-- CHECK check_primary_admin_role: is_primary_admin = true requires role = 'org_admin';
-- organizations.primary_admin_id exists.
--
-- Idempotent (drop + create).

begin;

drop function if exists public.transfer_primary_admin(uuid, uuid, uuid);
drop function if exists public.transfer_primary_admin(uuid, uuid, uuid, uuid);

create function public.transfer_primary_admin(
  from_user_id uuid,
  to_user_id   uuid,
  org_id       uuid,
  p_actor      uuid default null   -- acting super admin when called with the service role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_cur   record;
  v_new   record;
begin
  -- caller must be an approved super_admin
  if v_actor is null or not exists (
    select 1 from public.user_roles
    where user_id = v_actor and role = 'super_admin' and approval_status = 'approved'
  ) then
    raise exception 'transfer_primary_admin: only a super admin may transfer primary admin status'
      using errcode = '42501';
  end if;

  if from_user_id is not distinct from to_user_id then
    raise exception 'transfer_primary_admin: source and target are the same user' using errcode = '22023';
  end if;

  -- lock the two rows of THIS organization (exact org match, never user_id alone)
  select * into v_cur
  from public.user_roles
  where user_id = from_user_id and organization_id = org_id
  for update;

  if not found or not coalesce(v_cur.is_primary_admin, false) then
    raise exception 'transfer_primary_admin: source user is not the primary admin of this organization'
      using errcode = '22023';
  end if;

  select * into v_new
  from public.user_roles
  where user_id = to_user_id and organization_id = org_id
  for update;

  if not found then
    raise exception 'transfer_primary_admin: target user is not in this organization' using errcode = '22023';
  end if;
  if v_new.approval_status <> 'approved' or v_new.role not in ('org_admin', 'admin') then
    raise exception 'transfer_primary_admin: target must be an approved admin of this organization'
      using errcode = '22023';
  end if;

  -- allow the guard trigger (20261014_authz_03) to let this change through
  perform set_config('app.allow_primary_admin_change', 'on', true);

  update public.user_roles
     set is_primary_admin = false, updated_at = now()
   where user_id = from_user_id and organization_id = org_id;

  -- is_primary_admin requires role = 'org_admin' (check_primary_admin_role)
  update public.user_roles
     set role = 'org_admin', is_primary_admin = true, assigned_by = v_actor, updated_at = now()
   where user_id = to_user_id and organization_id = org_id;

  update public.organizations
     set primary_admin_id = to_user_id, updated_at = now()
   where id = org_id;

  return jsonb_build_object(
    'organization_id', org_id,
    'from_user_id', from_user_id,
    'to_user_id', to_user_id,
    'transferred_by', v_actor
  );
end;
$$;

revoke execute on function public.transfer_primary_admin(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.transfer_primary_admin(uuid, uuid, uuid, uuid) to service_role;

commit;
