-- DRAFT — review against live schema before applying
--
-- Per-student privacy switches used by the recruiter routes, the public
-- portfolio and the PDF export (see src/lib/privacy/visibility.ts).
--
--   public_portfolio_enabled : anyone with the link may open /public/portfolio/<id>
--   recruiter_share_contact  : approved recruiters may see email / phone /
--                              linkedin / github / portfolio link and GPA
--
-- Both default to false (private). The application treats a missing column the
-- same as false, so this migration can be applied before or after the code.
-- Idempotent: safe to run more than once.

alter table public.profiles
  add column if not exists public_portfolio_enabled boolean not null default false;

alter table public.profiles
  add column if not exists recruiter_share_contact boolean not null default false;

comment on column public.profiles.public_portfolio_enabled is
  'Opt-in: unauthenticated visitors may view the verified-credential portfolio. Default false.';
comment on column public.profiles.recruiter_share_contact is
  'Opt-in: approved recruiters may see contact details and GPA. Default false.';
