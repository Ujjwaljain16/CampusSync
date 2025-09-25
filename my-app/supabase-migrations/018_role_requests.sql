-- 018_role_requests.sql
-- Create role_requests table for recruiter/faculty/admin elevation workflow

create table if not exists public.role_requests (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('recruiter','faculty','admin')),
  metadata jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid null references public.profiles(id),
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_role_requests_user on public.role_requests (user_id, status);
create index if not exists idx_role_requests_status on public.role_requests (status);

-- Optional RLS placeholders (leave disabled if not using):
-- alter table public.role_requests enable row level security;
-- You can add policies later, e.g., user can see own requests, admins can see all


