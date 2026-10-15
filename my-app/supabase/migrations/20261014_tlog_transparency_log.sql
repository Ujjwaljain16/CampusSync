-- migrate: skip
-- OPTIONAL module, NOT applied in production (feature is off by default). Idempotent. Needed only with TRANSPARENCY_LOG_ENABLED=true.
--
-- Transparency log for credential events (issue / revoke): an append-only list of
-- entries plus signed tree heads (Merkle roots signed with the issuer key).
-- Design: docs/TRANSPARENCY-LOG.md. Nothing in the app depends on these objects until
-- TRANSPARENCY_LOG_ENABLED=true; with the flag on but this migration missing, the
-- app treats the feature as unavailable and issue/revoke keep working.
--
-- Access model: RLS is ENABLED and there are deliberately NO policies, so anon and
-- authenticated users (PostgREST) can read or write nothing. Only the service role
-- (which bypasses RLS) is used: the public /api/transparency/* routes serve the data
-- through it. tlog_append is SECURITY DEFINER, executable by service_role only.
--
-- Honest limits: the triggers below stop accidental or application-level edits. A
-- database superuser can still disable them or rewrite rows - that is exactly the case
-- the signed tree heads + consistency proofs exist to expose to outside observers.
--
-- Apply order: any time; independent of the other 20261014_* drafts.

begin;

-- 1. Tables ---------------------------------------------------------------------------

create table if not exists public.tlog_entries (
  leaf_index  bigint      primary key check (leaf_index >= 0),
  leaf_hash   text        not null check (leaf_hash ~ '^[0-9a-f]{64}$'),
  entry       jsonb       not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.tlog_tree_heads (
  tree_size   bigint      primary key check (tree_size >= 0),
  root_hash   text        not null check (root_hash ~ '^[0-9a-f]{64}$'),
  signed_jws  text        not null,
  -- Hashes of the maximal perfect subtrees ("frontier") so the next head can be computed
  -- from this one plus the new entries only, without re-reading every leaf.
  frontier    jsonb,
  created_at  timestamptz not null default now()
);

-- Look-up of a credential's events (GET /api/transparency/entries?credentialId=...)
create index if not exists tlog_entries_credential_id_idx
  on public.tlog_entries ((entry ->> 'credentialId'));

-- 2. Row level security: enabled, no policies (service role only) ----------------------

alter table public.tlog_entries    enable row level security;
alter table public.tlog_tree_heads enable row level security;

revoke all on table public.tlog_entries    from public, anon, authenticated;
revoke all on table public.tlog_tree_heads from public, anon, authenticated;
grant select, insert on table public.tlog_entries    to service_role;
grant select, insert on table public.tlog_tree_heads to service_role;

-- 3. Append-only enforcement ------------------------------------------------------------

create or replace function public.tlog_forbid_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'transparency log is append-only: % on % is not allowed', tg_op, tg_table_name
    using errcode = '55000';
end;
$$;

drop trigger if exists tlog_entries_no_update on public.tlog_entries;
create trigger tlog_entries_no_update
  before update or delete on public.tlog_entries
  for each row execute function public.tlog_forbid_mutation();

drop trigger if exists tlog_entries_no_truncate on public.tlog_entries;
create trigger tlog_entries_no_truncate
  before truncate on public.tlog_entries
  for each statement execute function public.tlog_forbid_mutation();

drop trigger if exists tlog_tree_heads_no_update on public.tlog_tree_heads;
create trigger tlog_tree_heads_no_update
  before update or delete on public.tlog_tree_heads
  for each row execute function public.tlog_forbid_mutation();

drop trigger if exists tlog_tree_heads_no_truncate on public.tlog_tree_heads;
create trigger tlog_tree_heads_no_truncate
  before truncate on public.tlog_tree_heads
  for each statement execute function public.tlog_forbid_mutation();

-- 4. Concurrency-safe append -------------------------------------------------------------
-- One writer at a time (transaction-scoped advisory lock, released at commit). Because the
-- lock is held until commit, each appender sees every earlier committed entry, so leaf
-- indexes are gap-free and committed in order. The caller computes leaf_hash
-- (SHA-256(0x00 || canonical JSON of entry)); the database only enforces its format.

create or replace function public.tlog_append(entry jsonb, leaf_hash text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_index bigint;
begin
  if entry is null or jsonb_typeof(entry) <> 'object' then
    raise exception 'entry must be a JSON object' using errcode = '22023';
  end if;
  if leaf_hash is null or leaf_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'leaf_hash must be 64 lowercase hex characters' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('campussync.tlog_append', 0));

  select coalesce(max(e.leaf_index) + 1, 0) into next_index from public.tlog_entries e;

  insert into public.tlog_entries (leaf_index, leaf_hash, entry)
  values (next_index, tlog_append.leaf_hash, tlog_append.entry);

  return next_index;
end;
$$;

revoke all on function public.tlog_append(jsonb, text) from public, anon, authenticated;
grant execute on function public.tlog_append(jsonb, text) to service_role;

commit;

-- Make PostgREST pick up the new tables/function without a restart.
notify pgrst, 'reload schema';
