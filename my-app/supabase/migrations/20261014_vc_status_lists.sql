-- OPTIONAL module, NOT applied in production (feature is off by default). Idempotent. Needed only with VC_STATUS_LIST_ENABLED=true.
--
-- Revocation status lists for src/lib/statusList.ts (only used when VC_STATUS_LIST_ENABLED=true).
-- The application degrades gracefully while this migration is NOT applied: issuance and
-- verification keep working, credentials are simply issued without a credentialStatus entry.
--
-- Access model: RLS is enabled and NO policies are created, so anon/authenticated roles cannot read
-- or write the table. Only the service role (which bypasses RLS) and the SECURITY DEFINER
-- functions below touch it. The public view of a list is the signed JWS served by
-- /api/status/revocation/[listId], never the raw table.
--
-- `bits` holds the RAW (uncompressed) bitstring as standard base64 WITHOUT line breaks.
-- Bit order: index 0 is the most significant bit of byte 0 (so index i is bit (7 - i % 8) of
-- byte floor(i / 8)); Postgres numbers bytea bits from the least significant bit, which the
-- functions compensate for.

create table if not exists public.vc_status_lists (
  id          text primary key,
  purpose     text not null,
  bits        text not null,
  next_index  integer not null default 0,
  size        integer not null,
  updated_at  timestamptz default now(),
  constraint vc_status_lists_id_format check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  constraint vc_status_lists_purpose_check check (purpose in ('revocation')),
  constraint vc_status_lists_size_check check (size > 0 and size % 8 = 0),
  constraint vc_status_lists_next_index_check check (next_index >= 0 and next_index <= size)
);

alter table public.vc_status_lists enable row level security;
-- Intentionally no policies: service-role only.
revoke all on table public.vc_status_lists from anon, authenticated;

-- Atomically allocate the next free index of a list (creating the list on first use).
-- Returns NULL when the list is full, so the caller moves on to the next list id.
create or replace function public.allocate_status_index(list_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_index integer;
begin
  if list_id is null or list_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
    raise exception 'invalid status list id';
  end if;

  insert into public.vc_status_lists (id, purpose, bits, next_index, size)
  values (
    list_id,
    'revocation',
    replace(encode(decode(repeat('00', 16384), 'hex'), 'base64'), E'\n', ''),
    0,
    131072
  )
  on conflict (id) do nothing;

  -- RETURNING sees the updated row, so next_index - 1 is the index that was just handed out.
  update public.vc_status_lists
     set next_index = next_index + 1,
         updated_at = now()
   where id = list_id
     and next_index < size
  returning next_index - 1 into v_index;

  return v_index; -- NULL when no row matched (list full)
end;
$$;

-- Atomically set the revocation bit of an ALLOCATED index. Returns true when the bit was set
-- (idempotent: setting an already-set bit also returns true), false when the list or index
-- does not exist / was never allocated.
create or replace function public.set_status_bit(list_id text, bit_index integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  update public.vc_status_lists
     set bits = replace(
           encode(
             set_bit(decode(bits, 'base64'), (bit_index / 8) * 8 + 7 - (bit_index % 8), 1),
             'base64'
           ),
           E'\n', ''
         ),
         updated_at = now()
   where id = list_id
     and bit_index >= 0
     and bit_index < next_index
     and bit_index < size
  returning true into v_found;

  return coalesce(v_found, false);
end;
$$;

revoke all on function public.allocate_status_index(text) from public, anon, authenticated;
revoke all on function public.set_status_bit(text, integer) from public, anon, authenticated;
grant execute on function public.allocate_status_index(text) to service_role;
grant execute on function public.set_status_bit(text, integer) to service_role;

-- Verification after applying (as service role):
--   select public.allocate_status_index('rev-1');         -- 0, then 1, 2, ...
--   select public.set_status_bit('rev-1', 0);             -- true
--   select get_bit(decode(bits, 'base64'), 7) from public.vc_status_lists where id = 'rev-1';
--   -- bit 7 of the bytea (LSB of byte 0) == status index 0, so this returns 1
