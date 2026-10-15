-- migrate: baseline
-- APPLIED to production (docs/DATABASE-SCHEMA.md, "Migration status"). Idempotent. Some functions were later removed by 20261015_08.
--
-- Function hardening:
--   * is_super_admin(uuid): pin search_path (SECURITY DEFINER functions without a
--     fixed search_path can be hijacked through a schema earlier in the path);
--     keep the body, only change the config. Not callable by anon.
--   * check_and_reserve_slug(text): not callable by anon; the misleading
--     "advisory lock / reserve" claim is removed - it only CHECKS whether the slug
--     exists. Uniqueness is guaranteed by the unique constraint on
--     organizations.slug (the API maps 23505 to HTTP 409).
--
-- Signatures taken from how the API calls them:
--   rpc('is_super_admin', { p_user_id })      -> is_super_admin(p_user_id uuid)
--   rpc('check_and_reserve_slug', { slug_to_check }) -> check_and_reserve_slug(slug_to_check text)
-- If your live signatures differ, adjust the argument lists below.
--
-- Idempotent.

begin;

alter function public.is_super_admin(uuid) set search_path = public;
revoke execute on function public.is_super_admin(uuid) from public, anon;
grant  execute on function public.is_super_admin(uuid) to authenticated, service_role;

alter function public.check_and_reserve_slug(text) set search_path = public;
revoke execute on function public.check_and_reserve_slug(text) from public, anon;
grant  execute on function public.check_and_reserve_slug(text) to authenticated, service_role;

comment on function public.check_and_reserve_slug(text) is
  'Checks whether an organization slug already exists. It does NOT reserve the slug and takes NO advisory lock; uniqueness is enforced by the unique constraint on organizations.slug.';

commit;
