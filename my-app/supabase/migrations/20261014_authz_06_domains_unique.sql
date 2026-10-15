-- migrate: baseline
-- APPLIED to production (docs/DATABASE-SCHEMA.md, "Migration status"). Idempotent.
--
-- Domain squatting: nothing prevented two organizations from claiming the same
-- e-mail domain in allowed_domains. The API now rejects a domain that another
-- organization already claims (exact or wildcard overlap); this adds the
-- database-level backstop for the exact-match case.
--
-- Pre-flight (must return no rows, resolve duplicates by hand first):
--   select lower(domain), count(*), array_agg(organization_id)
--     from public.allowed_domains group by 1 having count(*) > 1;
--
-- Idempotent.

begin;

create unique index if not exists allowed_domains_domain_lower_uniq
  on public.allowed_domains (lower(domain));

commit;
