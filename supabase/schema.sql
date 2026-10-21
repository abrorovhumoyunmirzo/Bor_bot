create extension if not exists pgcrypto;
create table if not exists public.places(id uuid primary key default gen_random_uuid(),name text not null check(char_length(name) between 2 and 120),district text not null,address text not null default '',category text not null check(category in ('coffee','workspace')),latitude double precision check(latitude between -90 and 90),longitude double precision check(longitude between -180 and 180),active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.reports(id uuid primary key default gen_random_uuid(),place_id uuid not null references public.places(id) on delete cascade,user_id text not null check(user_id ~ '^[0-9]{1,20}$'),crowd text not null check(crowd in ('quiet','moderate','busy')),wifi text not null check(wifi in ('good','slow','bad','unknown')),created_at timestamptz not null default now());
create index if not exists reports_place_recent_idx on public.reports(place_id,created_at desc);
create index if not exists reports_user_recent_idx on public.reports(user_id,place_id,created_at desc);
alter table public.places enable row level security;
alter table public.reports enable row level security;
-- No anonymous policies: server-only service role credentials.
create or replace function public.enforce_report_cooldown() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(hashtextextended(new.user_id || ':' || new.place_id::text,0));if exists(select 1 from public.reports where user_id=new.user_id and place_id=new.place_id and created_at>now()-interval '5 minutes') then raise exception 'Report cooldown active';end if;return new;end;$$;
drop trigger if exists report_cooldown on public.reports;
create trigger report_cooldown before insert on public.reports for each row execute function public.enforce_report_cooldown();
