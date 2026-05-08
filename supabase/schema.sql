create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'setup' check (status in ('setup', 'group', 'knockout', 'completed')),
  court_count integer not null default 1 check (court_count >= 1 and court_count <= 32),
  created_at timestamptz not null default now()
);

alter table public.tournaments
add column if not exists court_count integer not null default 1;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_number integer not null,
  created_at timestamptz not null default now(),
  unique (tournament_id, group_number)
);

create table if not exists public.group_players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seat integer not null,
  unique (group_id, player_id),
  unique (group_id, seat)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  match_kind text not null default 'scheduled' check (match_kind in ('scheduled', 'manual')),
  stage text not null check (stage in ('group', 'quarterfinal', 'semifinal', 'final', 'third_place')),
  round_order integer not null default 1,
  court_name text,
  scheduled_label text,
  team_a_player_ids uuid[] not null,
  team_b_player_ids uuid[] not null,
  helper_player_ids uuid[] not null default '{}',
  helper_for_player_ids uuid[] not null default '{}',
  team_a_score integer not null default 0 check (team_a_score >= 0 and team_a_score <= 15),
  team_b_score integer not null default 0 check (team_b_score >= 0 and team_b_score <= 15),
  is_live boolean not null default false,
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.matches
add column if not exists match_kind text not null default 'scheduled';

alter table public.matches
add column if not exists helper_player_ids uuid[] not null default '{}';

alter table public.matches
add column if not exists helper_for_player_ids uuid[] not null default '{}';

alter table public.matches
drop constraint if exists matches_match_kind_check;

alter table public.matches
add constraint matches_match_kind_check check (match_kind in ('scheduled', 'manual'));

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;
alter table public.players enable row level security;
alter table public.groups enable row level security;
alter table public.group_players enable row level security;
alter table public.matches enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "Public read tournaments" on public.tournaments;
create policy "Public read tournaments"
on public.tournaments
for select
using (true);

drop policy if exists "Public read players" on public.players;
create policy "Public read players"
on public.players
for select
using (true);

drop policy if exists "Public read groups" on public.groups;
create policy "Public read groups"
on public.groups
for select
using (true);

drop policy if exists "Public read group players" on public.group_players;
create policy "Public read group players"
on public.group_players
for select
using (true);

drop policy if exists "Public read matches" on public.matches;
create policy "Public read matches"
on public.matches
for select
using (true);

drop policy if exists "Admin read admin list" on public.admin_users;
create policy "Admin read admin list"
on public.admin_users
for select
using (public.is_admin());

drop policy if exists "Admin manage tournaments" on public.tournaments;
create policy "Admin manage tournaments"
on public.tournaments
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admin manage players" on public.players;
create policy "Admin manage players"
on public.players
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admin manage groups" on public.groups;
create policy "Admin manage groups"
on public.groups
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admin manage group players" on public.group_players;
create policy "Admin manage group players"
on public.group_players
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admin manage matches" on public.matches;
create policy "Admin manage matches"
on public.matches
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admin manage admin list" on public.admin_users;
create policy "Admin manage admin list"
on public.admin_users
for all
using (public.is_admin())
with check (public.is_admin());
