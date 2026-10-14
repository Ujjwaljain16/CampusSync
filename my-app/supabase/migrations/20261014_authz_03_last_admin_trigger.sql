-- DRAFT - review against live schema before applying
--
-- Integrity trigger on user_roles:
--   * an organization can never lose its LAST approved org_admin/admin
--   * the primary admin row can only be demoted/deleted through the transfer
--     function (which sets app.allow_primary_admin_change = 'on' for its transaction)
--
-- The API enforces the same rules (src/lib/api/utils/roleMutations.ts) but it
-- cannot be atomic across two requests; this trigger is the backstop.
--
-- Escape hatches (set with `select set_config('<name>', 'on', true)` inside a
-- transaction, service role only):
--   app.bypass_last_admin_guard       - e.g. deliberate offboarding of an organization
--   app.allow_primary_admin_change    - set by transfer_primary_admin
--
-- NEEDS VERIFICATION: when an organization is deleted, ON DELETE CASCADE removes
-- its user_roles. The guard returns early when the organization row no longer
-- exists, which should cover that case; test it on a staging copy.
--
-- Idempotent.

begin;

create or replace function public.guard_user_roles_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_admin boolean;
  v_new_admin boolean;
begin
  if coalesce(current_setting('app.bypass_last_admin_guard', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_old_admin := old.organization_id is not null
                 and old.approval_status = 'approved'
                 and old.role in ('org_admin', 'admin');

  -- ---- primary admin protection ---------------------------------------
  if coalesce(old.is_primary_admin, false)
     and coalesce(current_setting('app.allow_primary_admin_change', true), '') <> 'on'
     and (
       tg_op = 'DELETE'
       or new.is_primary_admin is distinct from old.is_primary_admin
       or new.role is distinct from old.role
       or new.organization_id is distinct from old.organization_id
       or new.approval_status is distinct from old.approval_status
     )
  then
    -- organization being deleted: cascade is fine
    if tg_op = 'DELETE' and not exists (select 1 from public.organizations o where o.id = old.organization_id) then
      return old;
    end if;
    raise exception 'The primary admin cannot be demoted or removed; transfer primary admin status first'
      using errcode = '23514';
  end if;

  -- ---- last admin protection ------------------------------------------
  if v_old_admin then
    if tg_op = 'DELETE' then
      v_new_admin := false;
    else
      v_new_admin := new.organization_id is not distinct from old.organization_id
                     and new.approval_status = 'approved'
                     and new.role in ('org_admin', 'admin');
    end if;

    if not v_new_admin then
      -- organization being deleted: cascade is fine
      if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
        return case when tg_op = 'DELETE' then old else new end;
      end if;

      if not exists (
        select 1 from public.user_roles r
        where r.organization_id = old.organization_id
          and r.user_id <> old.user_id
          and r.approval_status = 'approved'
          and r.role in ('org_admin', 'admin')
      ) then
        raise exception 'An organization must keep at least one approved admin'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_user_roles_integrity on public.user_roles;
create trigger trg_guard_user_roles_integrity
  before update or delete on public.user_roles
  for each row execute function public.guard_user_roles_integrity();

commit;
