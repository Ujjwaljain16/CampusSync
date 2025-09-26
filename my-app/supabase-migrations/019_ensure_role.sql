-- 019_ensure_role.sql
-- Generic role assignment RPC for admin workflows

create or replace function public.ensure_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('student','faculty','recruiter','admin') then
    raise exception 'invalid role %', p_role;
  end if;
  insert into public.user_roles (user_id, role, assigned_by)
  select p_user_id, p_role, p_user_id
  where not exists (
    select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role = p_role
  );
end;
$$;

revoke all on function public.ensure_role(uuid, text) from public;
grant execute on function public.ensure_role(uuid, text) to authenticated;


