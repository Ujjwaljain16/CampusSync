-- Global rate limiter storage (see docs/RATE-LIMITING.md).
--
-- A fixed-window counter shared by every server instance. Only the service role
-- touches it: RLS is enabled with no policies, table and function privileges are
-- revoked from anon / authenticated. Idempotent; apply AFTER the application code
-- that calls it is deployed (the code fails open while this migration is missing).

begin;

create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null,
  primary key (key, window_start)
);

-- cleanup of expired windows scans by age
create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
-- deliberately NO policies: with RLS on, non-bypass roles see and change nothing
revoke all on table public.rate_limits from public, anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'rate_limit_hit: key must be 1..200 characters' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate_limit_hit: window must be 1..86400 seconds' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    raise exception 'rate_limit_hit: limit must be 1..100000' using errcode = '22023';
  end if;

  -- start of the current fixed window, aligned to the epoch
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  -- atomic: concurrent callers serialize on the row lock of the conflict target
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set count = rl.count + 1
  returning rl.count into v_count;

  -- opportunistic cleanup: a small batch of long-expired windows per call
  delete from public.rate_limits d
  where (d.key, d.window_start) in (
    select e.key, e.window_start
    from public.rate_limits e
    where e.window_start < now() - interval '1 day'
    limit 20
    for update skip locked
  );

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at := v_window_start + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

commit;
