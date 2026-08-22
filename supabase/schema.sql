create table if not exists public.demirtube_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.demirtube_backups enable row level security;

revoke all on table public.demirtube_backups from anon;
grant select, insert, update, delete on table public.demirtube_backups to authenticated;

create policy "users read own demirtube backup"
on public.demirtube_backups
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users insert own demirtube backup"
on public.demirtube_backups
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update own demirtube backup"
on public.demirtube_backups
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users delete own demirtube backup"
on public.demirtube_backups
for delete
to authenticated
using ((select auth.uid()) = user_id);
