-- DRAFT - review before applying
--
-- Selective-disclosure (SD-JWT) issuance accounting. OPTIONAL: the application
-- tolerates this table not existing (undefined-table errors 42P01 / PGRST205 are
-- ignored) and only writes to it when SD_JWT_ENABLED=true.
--
-- Privacy by design: this table stores NO disclosures, NO claim values and NO
-- student identifiers. Only:
--   credential_id    the verifiable_credentials.id (urn:uuid:...) the SD-JWT was derived from
--   sd_jti           the `jti` of the issued SD-JWT
--   digest_list_hash SHA-256 (hex) of the comma-joined sorted `_sd` digest list
--   created_at       issuance time
-- credential_id is intentionally NOT a foreign key: the id type of
-- verifiable_credentials.id was not verified against the live schema.
--
-- Idempotent. RLS is enabled with no policies, so only the service role (which
-- bypasses RLS) can read or write it; anon/authenticated get nothing.

begin;

create table if not exists public.sd_issuances (
  id               uuid primary key default gen_random_uuid(),
  credential_id    text not null,
  sd_jti           text not null,
  digest_list_hash text not null,
  created_at       timestamptz not null default now()
);

create index if not exists sd_issuances_credential_id_idx on public.sd_issuances (credential_id);
create unique index if not exists sd_issuances_sd_jti_key on public.sd_issuances (sd_jti);

alter table public.sd_issuances enable row level security;

revoke all on table public.sd_issuances from anon, authenticated;

commit;
