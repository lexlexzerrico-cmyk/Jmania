-- REPFORGE database
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run again after updates (everything is "create or replace" / "if not exists").
--
-- Players can READ everything (public leaderboards) but can never write tables directly.
-- Every change goes through the functions below, which check the rules server-side:
-- rep limits, speed limits, prices, boosts, streaks and unlocks.

-- ---------------------------------------------------------------- tables
create table if not exists public.items (
  id       text primary key,
  kind     text not null check (kind in ('title','theme','boost')),
  price    int  not null default 0 check (price >= 0),
  minutes  int,
  buyable  boolean not null default true
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  title       text not null default 'rookie',
  theme       text not null default 'ember',
  grit        int  not null default 150,
  xp          int  not null default 0,
  rp          int  not null default 0,
  total_push  int  not null default 0,
  total_sit   int  not null default 0,
  total_reps  int  generated always as (total_push + total_sit) stored,
  best_set    int  not null default 0,
  sets_count  int  not null default 0,
  streak      int  not null default 0,
  last_active date,
  last_daily  date,
  inventory   text[] not null default array['rookie','ember'],
  boosts      jsonb  not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));
create index if not exists profiles_rp_idx    on public.profiles (rp desc);
create index if not exists profiles_push_idx  on public.profiles (total_push desc);
create index if not exists profiles_sit_idx   on public.profiles (total_sit desc);
create index if not exists profiles_total_idx on public.profiles (total_reps desc);

create table if not exists public.sets (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('push','sit')),
  reps       int  not null check (reps between 1 and 300),
  secs       int  not null check (secs between 0 and 7200),
  source     text not null check (source in ('cam','tap')),
  rp         int  not null,
  xp         int  not null,
  grit       int  not null,
  created_at timestamptz not null default now()
);
create index if not exists sets_created_idx on public.sets (created_at desc);
create index if not exists sets_user_idx    on public.sets (user_id, created_at desc);

-- ---------------------------------------------------------------- store catalog
-- Keep in sync with js/catalog.js (that file has names and descriptions; prices here win).
insert into public.items (id, kind, price, minutes, buyable) values
  -- earned titles (not for sale)
  ('rookie','title',0,null,false), ('first_set','title',0,null,false), ('fifty','title',0,null,false),
  ('century','title',0,null,false), ('k1','title',0,null,false), ('k10','title',0,null,false),
  ('streak7','title',0,null,false), ('streak30','title',0,null,false), ('gilded','title',0,null,false),
  ('legend','title',0,null,false),
  -- store titles
  ('gymrat','title',300,null,true), ('corecrusher','title',450,null,true), ('plank','title',600,null,true),
  ('beast','title',900,null,true), ('unit','title',1200,null,true), ('maincharacter','title',2000,null,true),
  ('finalboss','title',5000,null,true),
  -- themes
  ('ember','theme',0,null,false), ('cobalt','theme',400,null,true), ('jade','theme',400,null,true),
  ('magenta','theme',600,null,true), ('ice','theme',600,null,true), ('crimson','theme',800,null,true),
  ('champion','theme',3000,null,true),
  -- boosts
  ('grit2x','boost',250,30,true), ('xpsurge','boost',200,30,true), ('rankrush','boost',400,20,true),
  ('shield','boost',300,null,true)
on conflict (id) do update set kind = excluded.kind, price = excluded.price,
  minutes = excluded.minutes, buyable = excluded.buyable;

-- ---------------------------------------------------------------- helpers
create or replace function public._me() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Create your player name first'; end if;
  return p;
end $$;

create or replace function public._boost_on(b jsonb, k text) returns boolean
language sql stable as $$
  select coalesce((b->>k)::timestamptz > now(), false)
$$;

create or replace function public._today() returns date
language sql stable as $$ select (now() at time zone 'utc')::date $$;

-- ---------------------------------------------------------------- player actions
create or replace function public.create_profile(p_username text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Names are 3-16 letters, numbers or underscores';
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username) and id <> auth.uid()) then
    raise exception 'That name is taken';
  end if;
  insert into public.profiles (id, username) values (auth.uid(), p_username)
  on conflict (id) do update set username = excluded.username
  returning * into p;
  return p;
end $$;

create or replace function public.submit_set(p_kind text, p_reps int, p_secs int, p_source text, p_music boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  today date := public._today();
  v_rp int; v_xp int; v_grit int; v_bonus int := 0;
  unlocks text[] := '{}';
  t text; total int; sh int;
begin
  p := public._me();
  if p_kind not in ('push','sit') then raise exception 'Unknown exercise'; end if;
  if p_source not in ('cam','tap') then raise exception 'Unknown counting mode'; end if;
  if p_reps is null or p_reps < 1 or p_reps > 300 then raise exception 'A set has to be 1-300 reps'; end if;
  if p_secs is null or p_secs < ceil(p_reps * 0.5) then raise exception 'That set was too fast to count (max 2 reps a second)'; end if;
  if exists (select 1 from public.sets where user_id = p.id and created_at > now() - interval '5 seconds') then
    raise exception 'Wait a few seconds between sets';
  end if;

  v_rp := round(p_reps
    * (case when p_kind = 'push' then 1.0 else 0.8 end)
    * (case when p_source = 'tap' then 0.5 else 1.0 end)
    * (case when public._boost_on(p.boosts, 'rankrush') then 1.25 else 1.0 end));
  v_xp := p_reps * 2 * (case when public._boost_on(p.boosts, 'xpsurge') then 2 else 1 end);
  v_grit := round(p_reps
    * (case when p_source = 'tap' then 0.5 else 1.0 end)
    * (case when public._boost_on(p.boosts, 'grit2x') then 2.0 else 1.0 end)
    * (case when coalesce(p_music, false) then 1.1 else 1.0 end));

  -- daily streak (a Streak Shield covers one missed day)
  sh := coalesce((p.boosts->>'shield')::int, 0);
  if p.last_active = today then
    null;
  elsif p.last_active = today - 1 then
    p.streak := p.streak + 1;
  elsif p.last_active = today - 2 and sh > 0 then
    p.streak := p.streak + 1;
    p.boosts := jsonb_set(p.boosts, '{shield}', to_jsonb(sh - 1));
  else
    p.streak := 1;
  end if;
  p.last_active := today;

  p.rp := p.rp + v_rp;
  p.xp := p.xp + v_xp;
  p.grit := p.grit + v_grit;
  if p_kind = 'push' then p.total_push := p.total_push + p_reps; else p.total_sit := p.total_sit + p_reps; end if;
  p.best_set := greatest(p.best_set, p_reps);
  p.sets_count := p.sets_count + 1;
  total := p.total_push + p.total_sit;

  -- earned titles: +100 Grit each
  foreach t in array array['first_set','fifty','century','k1','k10','streak7','streak30','gilded','legend'] loop
    if not (t = any(p.inventory)) and (
         t = 'first_set'
      or (t = 'fifty'    and p_reps >= 50)
      or (t = 'century'  and p_reps >= 100)
      or (t = 'k1'       and total >= 1000)
      or (t = 'k10'      and total >= 10000)
      or (t = 'streak7'  and p.streak >= 7)
      or (t = 'streak30' and p.streak >= 30)
      or (t = 'gilded'   and p.rp >= 1750)
      or (t = 'legend'   and p.rp >= 14000)) then
      unlocks := unlocks || t;
      p.inventory := p.inventory || t;
      v_bonus := v_bonus + 100;
    end if;
  end loop;
  p.grit := p.grit + v_bonus;

  insert into public.sets (user_id, kind, reps, secs, source, rp, xp, grit)
  values (p.id, p_kind, p_reps, p_secs, p_source, v_rp, v_xp, v_grit);

  update public.profiles set
    rp = p.rp, xp = p.xp, grit = p.grit, total_push = p.total_push, total_sit = p.total_sit,
    best_set = p.best_set, sets_count = p.sets_count, streak = p.streak, last_active = p.last_active,
    inventory = p.inventory, boosts = p.boosts
  where id = p.id
  returning * into p;

  return jsonb_build_object(
    'profile', to_jsonb(p),
    'earned', jsonb_build_object('rp', v_rp, 'xp', v_xp, 'grit', v_grit, 'bonus', v_bonus),
    'unlocks', to_jsonb(unlocks));
end $$;

create or replace function public.claim_daily() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; amt int;
begin
  p := public._me();
  if p.last_daily = public._today() then raise exception 'Daily drop already claimed. Come back tomorrow'; end if;
  amt := 50 + 10 * least(p.streak, 10);
  update public.profiles set grit = grit + amt, last_daily = public._today() where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p), 'amount', amt);
end $$;

create or replace function public.buy_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; it public.items; v_until timestamptz; sh int;
begin
  p := public._me();
  select * into it from public.items where id = p_item and buyable;
  if not found then raise exception 'That item is not for sale'; end if;
  if p.grit < it.price then raise exception 'Not enough Grit yet'; end if;

  if it.kind in ('title','theme') then
    if p_item = any(p.inventory) then raise exception 'You already own this'; end if;
    p.inventory := p.inventory || p_item;
  elsif p_item = 'shield' then
    sh := coalesce((p.boosts->>'shield')::int, 0);
    if sh >= 3 then raise exception 'You can hold up to 3 Streak Shields'; end if;
    p.boosts := jsonb_set(p.boosts, '{shield}', to_jsonb(sh + 1));
  else
    v_until := greatest(now(), coalesce((p.boosts->>p_item)::timestamptz, now())) + make_interval(mins => it.minutes);
    p.boosts := jsonb_set(p.boosts, array[p_item], to_jsonb(v_until));
  end if;

  update public.profiles set grit = p.grit - it.price, inventory = p.inventory, boosts = p.boosts
  where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p));
end $$;

create or replace function public.equip(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; k text;
begin
  p := public._me();
  if not (p_item = any(p.inventory)) then raise exception 'Unlock this first'; end if;
  select kind into k from public.items where id = p_item;
  if k = 'theme' then
    update public.profiles set theme = p_item where id = p.id returning * into p;
  elsif k = 'title' then
    update public.profiles set title = p_item where id = p.id returning * into p;
  else
    raise exception 'That can''t be equipped';
  end if;
  return jsonb_build_object('profile', to_jsonb(p));
end $$;

-- ---------------------------------------------------------------- leaderboards
create or replace view public.lb_weekly with (security_invoker = on) as
  select p.id, p.username, p.title, p.theme, p.rp, sum(s.reps)::int as reps
  from public.sets s join public.profiles p on p.id = s.user_id
  where s.created_at > now() - interval '7 days'
  group by p.id
  order by reps desc
  limit 100;

-- ---------------------------------------------------------------- security
alter table public.profiles enable row level security;
alter table public.sets     enable row level security;
alter table public.items    enable row level security;

drop policy if exists "Anyone can read profiles" on public.profiles;
drop policy if exists "Anyone can read sets"     on public.sets;
drop policy if exists "Anyone can read items"    on public.items;
create policy "Anyone can read profiles" on public.profiles for select using (true);
create policy "Anyone can read sets"     on public.sets     for select using (true);
create policy "Anyone can read items"    on public.items    for select using (true);

revoke insert, update, delete, truncate on public.profiles, public.sets, public.items from anon, authenticated;
grant select on public.profiles, public.sets, public.items, public.lb_weekly to anon, authenticated;

revoke execute on function public._me(), public._boost_on(jsonb, text), public._today() from public, anon, authenticated;
revoke execute on function public.create_profile(text), public.submit_set(text, int, int, text, boolean),
  public.claim_daily(), public.buy_item(text), public.equip(text) from public, anon;
grant execute on function public.create_profile(text), public.submit_set(text, int, int, text, boolean),
  public.claim_daily(), public.buy_item(text), public.equip(text) to authenticated;
