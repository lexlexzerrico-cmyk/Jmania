-- REPFORGE database
-- Run in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- It is safe to run again: it creates what is missing and upgrades an older REPFORGE
-- database in place without losing players, sets or purchases.
--
-- Players can READ public data but never write tables directly. Every change goes
-- through the functions below, which check the rules server-side: rep limits, speed
-- limits, prices, boosts, streaks, quests, records and unlocks.

-- =================================================================== tables
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
  total_squat int  not null default 0,
  total_reps  int  generated always as (total_push + total_sit + total_squat) stored,
  best_set    int  not null default 0,
  sets_count  int  not null default 0,
  streak      int  not null default 0,
  last_active date,
  last_daily  date,
  inventory   text[] not null default array['rookie','ember'],
  boosts      jsonb  not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.sets (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  reps       int  not null check (reps between 1 and 300),
  secs       int  not null check (secs between 0 and 7200),
  source     text not null check (source in ('cam','tap')),
  rp         int  not null,
  xp         int  not null,
  grit       int  not null,
  created_at timestamptz not null default now()
);

-- ---- v2 upgrades (no-ops on a fresh install) ----
alter table public.profiles add column if not exists total_squat   int not null default 0;
alter table public.profiles add column if not exists tz            text not null default 'UTC';
alter table public.profiles add column if not exists tz_changed_at timestamptz;
alter table public.profiles add column if not exists quests_done   int not null default 0;
alter table public.profiles add column if not exists rest_count    int not null default 0;
alter table public.profiles add column if not exists records_count int not null default 0;

do $$ begin
  -- v1 computed total_reps without squats: rebuild the generated column if needed.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'total_reps'
                   and generation_expression like '%total_squat%') then
    alter table public.profiles drop column if exists total_reps;
    alter table public.profiles add column total_reps int generated always as (total_push + total_sit + total_squat) stored;
  end if;
end $$;

alter table public.sets drop constraint if exists sets_kind_check;
alter table public.sets add constraint sets_kind_check check (kind in ('push','sit','squat'));
alter table public.sets add column if not exists local_day     date;
alter table public.sets add column if not exists session_start timestamptz;
update public.sets set local_day = (created_at at time zone 'UTC')::date where local_day is null;
update public.sets set session_start = created_at - make_interval(secs => secs) where session_start is null;
alter table public.sets alter column local_day set not null;
alter table public.sets alter column session_start set not null;

create table if not exists public.rest_days (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.records (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  key         text not null check (key in ('set_push','set_sit','set_squat','day_reps','week_reps','session_secs','week_days')),
  value       int  not null,
  prev        int  not null default 0,
  period      text not null,           -- the set / day / week / session this record belongs to
  set_id      bigint references public.sets(id) on delete set null,
  day         date not null,
  achieved_at timestamptz not null default now()
);

create table if not exists public.quest_defs (
  id          text primary key,
  period      text not null check (period in ('daily','weekly')),
  slot        text not null check (slot in ('fixed','pool')),
  metric      text not null check (metric in ('reps','reps_push','reps_sit','reps_squat','sets','cam_sets','secs','days','records','rest','checkin')),
  target      int  not null check (target > 0),
  xp          int  not null check (xp >= 0),
  grit        int  not null check (grit >= 0),
  title       text not null,
  description text not null,
  active      boolean not null default true
);

create table if not exists public.quest_claims (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  quest_id     text not null references public.quest_defs(id),
  period_start date not null,
  xp           int  not null,
  grit         int  not null,
  local_day    date not null,
  claimed_at   timestamptz not null default now(),
  primary key (user_id, quest_id, period_start)   -- one claim per quest per period, even under races
);

create table if not exists public.unlocks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  item_id    text not null,
  source     text not null,
  local_day  date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create unique index if not exists profiles_username_lower on public.profiles (lower(username));
create index if not exists profiles_rp_idx     on public.profiles (rp desc);
create index if not exists profiles_push_idx   on public.profiles (total_push desc);
create index if not exists profiles_sit_idx    on public.profiles (total_sit desc);
create index if not exists profiles_squat_idx  on public.profiles (total_squat desc);
create index if not exists profiles_total_idx  on public.profiles (total_reps desc);
create index if not exists sets_created_idx    on public.sets (created_at desc);
create index if not exists sets_user_idx       on public.sets (user_id, created_at desc);
create index if not exists sets_user_day_idx   on public.sets (user_id, local_day);
create index if not exists records_user_idx    on public.records (user_id, key, value desc);
create index if not exists quest_claims_day    on public.quest_claims (user_id, local_day);

-- =================================================================== catalog
-- Keep in sync with js/catalog.js (names and descriptions live there; prices here win).
insert into public.items (id, kind, price, minutes, buyable) values
  -- earned titles (not for sale)
  ('rookie','title',0,null,false), ('first_set','title',0,null,false), ('fifty','title',0,null,false),
  ('century','title',0,null,false), ('k1','title',0,null,false), ('k10','title',0,null,false),
  ('streak7','title',0,null,false), ('streak30','title',0,null,false), ('gilded','title',0,null,false),
  ('legend','title',0,null,false), ('questbound','title',0,null,false), ('restwise','title',0,null,false),
  ('recordbreaker','title',0,null,false),
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

-- Quests. Targets are deliberately moderate and rewards never grow past the target.
insert into public.quest_defs (id, period, slot, metric, target, xp, grit, title, description) values
  ('d_checkin', 'daily',  'fixed', 'checkin',    1,   20,  15, 'Show up',          'Finish any set, or log a rest day'),
  ('d_reps50',  'daily',  'pool',  'reps',       50,  40,  30, 'Fifty strong',     'Do 50 reps of anything'),
  ('d_push30',  'daily',  'pool',  'reps_push',  30,  40,  30, 'Press day',        'Do 30 push-ups'),
  ('d_sit30',   'daily',  'pool',  'reps_sit',   30,  40,  30, 'Core work',        'Do 30 sit-ups'),
  ('d_squat30', 'daily',  'pool',  'reps_squat', 30,  40,  30, 'Leg day',          'Do 30 squats'),
  ('d_sets3',   'daily',  'pool',  'sets',       3,   35,  25, 'Three rounds',     'Finish 3 sets'),
  ('d_cam',     'daily',  'pool',  'cam_sets',   1,   30,  25, 'On camera',        'Finish a camera-tracked set'),
  ('d_secs180', 'daily',  'pool',  'secs',       180, 35,  25, 'Three minutes',    'Train for 3 minutes in total'),
  ('w_reps250', 'weekly', 'fixed', 'reps',       250, 150, 120, 'Quarter thousand', 'Do 250 reps this week'),
  ('w_days4',   'weekly', 'fixed', 'days',       4,   150, 120, 'Four-day week',    'Train on 4 different days'),
  ('w_sets10',  'weekly', 'fixed', 'sets',       10,  120, 100, 'Ten sets',         'Finish 10 sets this week'),
  ('w_record',  'weekly', 'fixed', 'records',    1,   120, 100, 'New personal best','Beat one of your personal records'),
  ('w_rest',    'weekly', 'fixed', 'rest',       1,   80,  80,  'Recover',          'Log a rest day. Muscles grow while you recover.')
on conflict (id) do update set period = excluded.period, slot = excluded.slot, metric = excluded.metric,
  target = excluded.target, xp = excluded.xp, grit = excluded.grit, title = excluded.title, description = excluded.description;

-- =================================================================== helpers
create or replace function public._me() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into p from public.profiles where id = auth.uid() for update;   -- serialises a player's writes
  if not found then raise exception 'Create your player name first'; end if;
  return p;
end $$;

create or replace function public._me_read() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'Create your player name first'; end if;
  return p;
end $$;

create or replace function public._boost_on(b jsonb, k text) returns boolean
language sql stable as $$ select coalesce((b->>k)::timestamptz > now(), false) $$;

create or replace function public._today() returns date
language sql stable as $$ select (now() at time zone 'utc')::date $$;

create or replace function public._local_today(p_tz text) returns date
language sql stable as $$ select (now() at time zone coalesce(nullif(p_tz, ''), 'UTC'))::date $$;

create or replace function public._week_start(d date) returns date
language sql immutable as $$ select d - (extract(isodow from d)::int - 1) $$;

-- Daily streak. A training day or a logged rest day both count; a Streak Shield covers one missed day.
create or replace function public._streak(p public.profiles, today date) returns public.profiles
language plpgsql as $$
declare sh int := coalesce((p.boosts->>'shield')::int, 0);
begin
  if p.last_active >= today then return p; end if;
  if p.last_active = today - 1 then
    p.streak := p.streak + 1;
  elsif p.last_active = today - 2 and sh > 0 then
    p.streak := p.streak + 1;
    p.boosts := jsonb_set(p.boosts, '{shield}', to_jsonb(sh - 1));
  else
    p.streak := 1;
  end if;
  p.last_active := today;
  return p;
end $$;

-- Gives an earned title once (+100 Grit) and logs when it happened.
create or replace function public._unlock(p public.profiles, item text, src text, today date) returns public.profiles
language plpgsql security definer set search_path = public as $$
begin
  if item = any(p.inventory) then return p; end if;
  p.inventory := p.inventory || item;
  p.grit := p.grit + 100;
  insert into public.unlocks (user_id, item_id, source, local_day) values (p.id, item, src, today) on conflict do nothing;
  return p;
end $$;

-- Quest progress, always recomputed from real history (never stored counters).
create or replace function public._metric(uid uuid, m text, d0 date, d1 date) returns int
language sql stable security definer set search_path = public as $$
  select (case m
    when 'reps'       then (select coalesce(sum(reps), 0) from sets where user_id = uid and local_day between d0 and d1)
    when 'reps_push'  then (select coalesce(sum(reps), 0) from sets where user_id = uid and local_day between d0 and d1 and kind = 'push')
    when 'reps_sit'   then (select coalesce(sum(reps), 0) from sets where user_id = uid and local_day between d0 and d1 and kind = 'sit')
    when 'reps_squat' then (select coalesce(sum(reps), 0) from sets where user_id = uid and local_day between d0 and d1 and kind = 'squat')
    when 'sets'       then (select count(*) from sets where user_id = uid and local_day between d0 and d1)
    when 'cam_sets'   then (select count(*) from sets where user_id = uid and local_day between d0 and d1 and source = 'cam')
    when 'secs'       then (select coalesce(sum(secs), 0) from sets where user_id = uid and local_day between d0 and d1)
    when 'days'       then (select count(distinct local_day) from sets where user_id = uid and local_day between d0 and d1)
    when 'records'    then (select count(*) from records where user_id = uid and day between d0 and d1 and prev > 0)
    when 'rest'       then (select count(*) from rest_days where user_id = uid and day between d0 and d1)
    when 'checkin'    then (select count(*) from (select local_day from sets where user_id = uid and local_day between d0 and d1
                                                  union select day from rest_days where user_id = uid and day between d0 and d1) x)
    else 0 end)::int
$$;

-- Today's quests: the fixed daily, 3 daily quests picked per player per day, and all weeklies.
create or replace function public._assigned(uid uuid, today date) returns setof public.quest_defs
language sql stable security definer set search_path = public as $$
  (select * from quest_defs where active and period = 'daily' and slot = 'fixed')
  union all
  (select * from quest_defs where active and period = 'daily' and slot = 'pool' order by md5(uid::text || today::text || id) limit 3)
  union all
  (select * from quest_defs where active and period = 'weekly')
$$;

-- Saves a personal record. Returns the previous best when a NEW record is set, null otherwise.
-- Growing a record inside the same day / week / session updates that record instead of adding one.
create or replace function public._record(uid uuid, k text, val int, per text, p_set bigint, today date) returns int
language plpgsql security definer set search_path = public as $$
declare best int; last public.records;
begin
  select coalesce(max(value), 0) into best from records where user_id = uid and key = k;
  if val <= best then return null; end if;
  select * into last from records where user_id = uid and key = k order by achieved_at desc, id desc limit 1;
  if found and last.period = per then
    update records set value = val, set_id = p_set, day = today, achieved_at = now() where id = last.id;
    return null;
  end if;
  insert into records (user_id, key, value, prev, period, set_id, day) values (uid, k, val, best, per, p_set, today);
  return best;
end $$;

-- =================================================================== player actions
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

-- Days reset at the player's local midnight. Changing zone is limited to once a week so it
-- can't be used to replay daily rewards.
create or replace function public.set_timezone(p_tz text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me();
  if p.tz = p_tz then return p; end if;
  if not exists (select 1 from pg_timezone_names where name = p_tz) then raise exception 'Unknown time zone'; end if;
  if p.tz_changed_at is not null and p.tz_changed_at > now() - interval '7 days' then
    raise exception 'Time zone can change once a week';
  end if;
  update public.profiles set tz = p_tz, tz_changed_at = now() where id = p.id returning * into p;
  return p;
end $$;

create or replace function public.submit_set(p_kind text, p_reps int, p_secs int, p_source text, p_music boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  today date; wk date;
  v_rp int; v_xp int; v_grit int; v_bonus int := 0; v_set bigint; v_sess timestamptz;
  last_set public.sets;
  unlocks text[] := '{}'; recs jsonb := '[]'; r int; inv0 text[];
  t text; total int;
begin
  p := public._me();
  today := public._local_today(p.tz); wk := public._week_start(today);
  if p_kind not in ('push','sit','squat') then raise exception 'Unknown exercise'; end if;
  if p_source not in ('cam','tap') then raise exception 'Unknown counting mode'; end if;
  if p_reps is null or p_reps < 1 or p_reps > 300 then raise exception 'A set has to be 1-300 reps'; end if;
  if p_secs is null or p_secs < ceil(p_reps * 0.5) or p_secs > 7200 then raise exception 'That set was too fast to count (max 2 reps a second)'; end if;
  select * into last_set from public.sets where user_id = p.id order by created_at desc limit 1;
  if found and last_set.created_at > now() - interval '5 seconds' then raise exception 'Wait a few seconds between sets'; end if;

  v_rp := round(p_reps
    * (case when p_kind = 'push' then 1.0 else 0.8 end)
    * (case when p_source = 'tap' then 0.5 else 1.0 end)
    * (case when public._boost_on(p.boosts, 'rankrush') then 1.25 else 1.0 end));
  v_xp := p_reps * 2 * (case when public._boost_on(p.boosts, 'xpsurge') then 2 else 1 end);
  v_grit := round(p_reps
    * (case when p_source = 'tap' then 0.5 else 1.0 end)
    * (case when public._boost_on(p.boosts, 'grit2x') then 2.0 else 1.0 end)
    * (case when coalesce(p_music, false) then 1.1 else 1.0 end));

  -- Training on a day logged as rest turns it back into a training day.
  delete from public.rest_days where user_id = p.id and day = today;
  if found then p.rest_count := greatest(p.rest_count - 1, 0); end if;

  p := public._streak(p, today);
  p.rp := p.rp + v_rp;
  p.xp := p.xp + v_xp;
  p.grit := p.grit + v_grit;
  if p_kind = 'push' then p.total_push := p.total_push + p_reps;
  elsif p_kind = 'sit' then p.total_sit := p.total_sit + p_reps;
  else p.total_squat := p.total_squat + p_reps; end if;
  p.best_set := greatest(p.best_set, p_reps);
  p.sets_count := p.sets_count + 1;
  total := p.total_push + p.total_sit + p.total_squat;

  -- a session is a run of sets with less than 15 minutes between them
  v_sess := case when last_set.id is not null and last_set.created_at > now() - interval '15 minutes'
                 then last_set.session_start else now() - make_interval(secs => p_secs) end;
  insert into public.sets (user_id, kind, reps, secs, source, rp, xp, grit, local_day, session_start)
  values (p.id, p_kind, p_reps, p_secs, p_source, v_rp, v_xp, v_grit, today, v_sess)
  returning id into v_set;

  -- personal records (single-set records need camera tracking)
  if p_source = 'cam' then
    r := public._record(p.id, 'set_' || p_kind, p_reps, v_set::text, v_set, today);
    if r > 0 then recs := recs || jsonb_build_object('key', 'set_' || p_kind, 'value', p_reps, 'prev', r); end if;
  end if;
  r := public._record(p.id, 'day_reps', public._metric(p.id, 'reps', today, today), today::text, v_set, today);
  if r > 0 then recs := recs || jsonb_build_object('key', 'day_reps', 'value', public._metric(p.id, 'reps', today, today), 'prev', r); end if;
  r := public._record(p.id, 'week_reps', public._metric(p.id, 'reps', wk, wk + 6), wk::text, v_set, today);
  if r > 0 then recs := recs || jsonb_build_object('key', 'week_reps', 'value', public._metric(p.id, 'reps', wk, wk + 6), 'prev', r); end if;
  r := public._record(p.id, 'session_secs', extract(epoch from now() - v_sess)::int, v_sess::text, v_set, today);
  if r > 0 then recs := recs || jsonb_build_object('key', 'session_secs', 'value', extract(epoch from now() - v_sess)::int, 'prev', r); end if;
  r := public._record(p.id, 'week_days', public._metric(p.id, 'days', wk, wk + 6), wk::text, v_set, today);
  if r > 0 then recs := recs || jsonb_build_object('key', 'week_days', 'value', public._metric(p.id, 'days', wk, wk + 6), 'prev', r); end if;
  p.records_count := p.records_count + jsonb_array_length(recs);

  -- earned titles: +100 Grit each
  inv0 := p.inventory;
  foreach t in array array['first_set','fifty','century','k1','k10','streak7','streak30','gilded','legend','recordbreaker'] loop
    if  t = 'first_set'
     or (t = 'fifty'    and p_reps >= 50)
     or (t = 'century'  and p_reps >= 100)
     or (t = 'k1'       and total >= 1000)
     or (t = 'k10'      and total >= 10000)
     or (t = 'streak7'  and p.streak >= 7)
     or (t = 'streak30' and p.streak >= 30)
     or (t = 'gilded'   and p.rp >= 1750)
     or (t = 'legend'   and p.rp >= 14000)
     or (t = 'recordbreaker' and p.records_count >= 5) then
      if not (t = any(p.inventory)) then unlocks := unlocks || t; v_bonus := v_bonus + 100; end if;
      p := public._unlock(p, t, 'set', today);
    end if;
  end loop;

  update public.profiles set
    rp = p.rp, xp = p.xp, grit = p.grit, total_push = p.total_push, total_sit = p.total_sit, total_squat = p.total_squat,
    best_set = p.best_set, sets_count = p.sets_count, streak = p.streak, last_active = p.last_active,
    inventory = p.inventory, boosts = p.boosts, records_count = p.records_count, rest_count = p.rest_count
  where id = p.id
  returning * into p;

  return jsonb_build_object(
    'profile', to_jsonb(p),
    'earned', jsonb_build_object('rp', v_rp, 'xp', v_xp, 'grit', v_grit, 'bonus', v_bonus),
    'unlocks', to_jsonb(unlocks),
    'records', recs);
end $$;

create or replace function public.log_rest_day() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; today date; wk date; unl text[] := '{}';
begin
  p := public._me();
  today := public._local_today(p.tz); wk := public._week_start(today);
  if exists (select 1 from public.sets where user_id = p.id and local_day = today) then
    raise exception 'You trained today already. Rest days are for days off.';
  end if;
  if exists (select 1 from public.rest_days where user_id = p.id and day = today) then raise exception 'Today is already a rest day'; end if;
  if (select count(*) from public.rest_days where user_id = p.id and day between wk and wk + 6) >= 2 then
    raise exception 'You can log up to 2 rest days a week';
  end if;
  insert into public.rest_days (user_id, day) values (p.id, today);
  p := public._streak(p, today);
  p.rest_count := p.rest_count + 1;
  if p.rest_count >= 5 and not ('restwise' = any(p.inventory)) then unl := unl || 'restwise'::text; end if;
  if p.rest_count >= 5 then p := public._unlock(p, 'restwise', 'rest', today); end if;
  update public.profiles set streak = p.streak, last_active = p.last_active, boosts = p.boosts,
    rest_count = p.rest_count, inventory = p.inventory, grit = p.grit
  where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p), 'unlocks', to_jsonb(unl));
end $$;

create or replace function public.get_quests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; today date; wk date; q public.quest_defs; d0 date; d1 date; prog int; res jsonb := '[]';
begin
  p := public._me_read();
  today := public._local_today(p.tz); wk := public._week_start(today);
  for q in select * from public._assigned(p.id, today) loop
    if q.period = 'daily' then d0 := today; d1 := today; else d0 := wk; d1 := wk + 6; end if;
    prog := public._metric(p.id, q.metric, d0, d1);
    res := res || jsonb_build_object('id', q.id, 'period', q.period, 'slot', q.slot, 'title', q.title, 'description', q.description,
      'metric', q.metric, 'target', q.target, 'progress', least(prog, q.target), 'xp', q.xp, 'grit', q.grit,
      'claimed', exists (select 1 from public.quest_claims c where c.user_id = p.id and c.quest_id = q.id and c.period_start = d0));
  end loop;
  return jsonb_build_object(
    'today', today, 'week_start', wk, 'tz', p.tz,
    'daily_reset', ((today + 1)::timestamp at time zone p.tz),
    'weekly_reset', ((wk + 7)::timestamp at time zone p.tz),
    'quests', res, 'quests_done', p.quests_done,
    'trained_today', exists (select 1 from public.sets where user_id = p.id and local_day = today),
    'rested_today', exists (select 1 from public.rest_days where user_id = p.id and day = today),
    'rest_this_week', (select count(*) from public.rest_days where user_id = p.id and day between wk and wk + 6));
end $$;

create or replace function public.claim_quest(p_quest text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; today date; q public.quest_defs; d0 date; d1 date; prog int; unl text[] := '{}';
begin
  p := public._me();
  today := public._local_today(p.tz);
  select * into q from public._assigned(p.id, today) a where a.id = p_quest;
  if not found then raise exception 'That quest isn''t active right now'; end if;
  if q.period = 'daily' then d0 := today; d1 := today; else d0 := public._week_start(today); d1 := d0 + 6; end if;
  if exists (select 1 from public.quest_claims where user_id = p.id and quest_id = q.id and period_start = d0) then
    raise exception 'Reward already claimed';
  end if;
  prog := public._metric(p.id, q.metric, d0, d1);
  if prog < q.target then raise exception 'Not finished yet (% of %)', prog, q.target; end if;
  insert into public.quest_claims (user_id, quest_id, period_start, xp, grit, local_day) values (p.id, q.id, d0, q.xp, q.grit, today);
  p.xp := p.xp + q.xp;
  p.grit := p.grit + q.grit;
  p.quests_done := p.quests_done + 1;
  if p.quests_done >= 25 and not ('questbound' = any(p.inventory)) then unl := unl || 'questbound'::text; end if;
  if p.quests_done >= 25 then p := public._unlock(p, 'questbound', 'quest', today); end if;
  update public.profiles set xp = p.xp, grit = p.grit, quests_done = p.quests_done, inventory = p.inventory
  where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p), 'xp', q.xp, 'grit', q.grit, 'unlocks', to_jsonb(unl));
end $$;

create or replace function public.claim_daily() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; amt int; today date;
begin
  p := public._me();
  today := public._local_today(p.tz);
  if p.last_daily >= today then raise exception 'Daily drop already claimed. Come back tomorrow'; end if;
  amt := 50 + 10 * least(p.streak, 10);
  update public.profiles set grit = grit + amt, last_daily = today where id = p.id returning * into p;
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

-- =================================================================== reading history
-- Everything the dashboard and calendar need for the last p_days days, in one call.
create or replace function public.get_dashboard(p_days int default 400) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; today date; d0 date;
begin
  p := public._me_read();
  today := public._local_today(p.tz);
  d0 := today - least(greatest(coalesce(p_days, 400), 7), 400) + 1;
  return jsonb_build_object(
    'today', today, 'tz', p.tz,
    'days', (select coalesce(jsonb_agg(x order by x.d), '[]') from (
        select local_day d,
          coalesce(sum(reps) filter (where kind = 'push'), 0)  push,
          coalesce(sum(reps) filter (where kind = 'sit'), 0)   sit,
          coalesce(sum(reps) filter (where kind = 'squat'), 0) squat,
          count(*) sets, count(*) filter (where source = 'cam') cam_sets, coalesce(sum(secs), 0) secs
        from public.sets where user_id = p.id and local_day >= d0 group by local_day) x),
    'rest', (select coalesce(jsonb_agg(day order by day), '[]') from public.rest_days where user_id = p.id and day >= d0),
    'quest_days', (select coalesce(jsonb_agg(x), '[]') from (select local_day d, count(*) n from public.quest_claims where user_id = p.id and local_day >= d0 group by local_day) x),
    'record_days', (select coalesce(jsonb_agg(x), '[]') from (select day d, count(*) n from public.records where user_id = p.id and day >= d0 and prev > 0 group by day) x),
    'unlock_days', (select coalesce(jsonb_agg(x), '[]') from (select local_day d, count(*) n from public.unlocks where user_id = p.id and local_day >= d0 group by local_day) x),
    'records', (select coalesce(jsonb_agg(x), '[]') from (
        select distinct on (key) key, value, prev, day, achieved_at from public.records where user_id = p.id order by key, value desc, achieved_at) x),
    'recent_unlocks', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select item_id, source, created_at from public.unlocks where user_id = p.id order by created_at desc limit 8) x),
    'recent_records', (select coalesce(jsonb_agg(x order by x.achieved_at desc), '[]') from (
        select key, value, prev, achieved_at from public.records where user_id = p.id and prev > 0 order by achieved_at desc limit 8) x),
    'recent_sets', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select kind, reps, secs, source, rp, grit, created_at from public.sets where user_id = p.id order by created_at desc limit 10) x));
end $$;

create or replace function public.day_detail(p_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me_read();
  return jsonb_build_object(
    'day', p_day,
    'rest', exists (select 1 from public.rest_days where user_id = p.id and day = p_day),
    'sets', (select coalesce(jsonb_agg(x order by x.created_at), '[]') from (
        select kind, reps, secs, source, rp, grit, created_at from public.sets where user_id = p.id and local_day = p_day) x),
    'records', (select coalesce(jsonb_agg(x), '[]') from (select key, value, prev from public.records where user_id = p.id and day = p_day and prev > 0) x),
    'quests', (select coalesce(jsonb_agg(x), '[]') from (
        select c.quest_id, d.title, c.xp, c.grit from public.quest_claims c join public.quest_defs d on d.id = c.quest_id
        where c.user_id = p.id and c.local_day = p_day) x),
    'unlocks', (select coalesce(jsonb_agg(item_id), '[]') from public.unlocks where user_id = p.id and local_day = p_day));
end $$;

create or replace function public.record_history(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me_read();
  return (select coalesce(jsonb_agg(x order by x.achieved_at desc), '[]') from (
    select value, prev, day, achieved_at from public.records where user_id = p.id and key = p_key order by achieved_at desc limit 30) x);
end $$;

-- =================================================================== one-time backfill
-- Players who trained before records existed get their records from their set history.
-- Only touches players with no records yet, so re-running this file changes nothing.
with fresh as (select p.id from public.profiles p where not exists (select 1 from public.records r where r.user_id = p.id)),
best_set as (
  select distinct on (s.user_id, s.kind) s.user_id, 'set_' || s.kind as key, s.reps as value, s.id::text as period, s.id as set_id, s.local_day as day, s.created_at
  from public.sets s join fresh f on f.id = s.user_id where s.source = 'cam'
  order by s.user_id, s.kind, s.reps desc, s.created_at),
by_day as (
  select s.user_id, s.local_day, sum(s.reps)::int reps, max(s.created_at) at from public.sets s join fresh f on f.id = s.user_id group by s.user_id, s.local_day),
best_day as (
  select distinct on (user_id) user_id, 'day_reps' as key, reps as value, local_day::text as period, null::bigint as set_id, local_day as day, at
  from by_day order by user_id, reps desc, local_day),
by_week as (
  select user_id, public._week_start(local_day) wk, sum(reps)::int reps, count(*)::int days, max(at) at from by_day group by user_id, public._week_start(local_day)),
best_week as (
  select distinct on (user_id) user_id, 'week_reps' as key, reps as value, wk::text as period, null::bigint as set_id, wk as day, at
  from by_week order by user_id, reps desc, wk),
best_week_days as (
  select distinct on (user_id) user_id, 'week_days' as key, days as value, wk::text as period, null::bigint as set_id, wk as day, at
  from by_week order by user_id, days desc, wk)
insert into public.records (user_id, key, value, prev, period, set_id, day, achieved_at)
select user_id, key, value, 0, period, set_id, day, created_at from best_set
union all select user_id, key, value, 0, period, set_id, day, at from best_day
union all select user_id, key, value, 0, period, set_id, day, at from best_week
union all select user_id, key, value, 0, period, set_id, day, at from best_week_days;

-- =================================================================== leaderboards
create or replace view public.lb_weekly with (security_invoker = on) as
  select p.id, p.username, p.title, p.theme, p.rp, sum(s.reps)::int as reps
  from public.sets s join public.profiles p on p.id = s.user_id
  where s.created_at > now() - interval '7 days'
  group by p.id
  order by reps desc
  limit 100;

-- =================================================================== security
alter table public.profiles     enable row level security;
alter table public.sets         enable row level security;
alter table public.items        enable row level security;
alter table public.rest_days    enable row level security;
alter table public.records      enable row level security;
alter table public.quest_defs   enable row level security;
alter table public.quest_claims enable row level security;
alter table public.unlocks      enable row level security;

drop policy if exists "Anyone can read profiles"   on public.profiles;
drop policy if exists "Anyone can read sets"       on public.sets;
drop policy if exists "Anyone can read items"      on public.items;
drop policy if exists "Anyone can read records"    on public.records;
drop policy if exists "Anyone can read quests"     on public.quest_defs;
drop policy if exists "Anyone can read unlocks"    on public.unlocks;
drop policy if exists "Players read own rest days" on public.rest_days;
drop policy if exists "Players read own claims"    on public.quest_claims;
create policy "Anyone can read profiles"   on public.profiles     for select using (true);
create policy "Anyone can read sets"       on public.sets         for select using (true);
create policy "Anyone can read items"      on public.items        for select using (true);
create policy "Anyone can read records"    on public.records      for select using (true);
create policy "Anyone can read quests"     on public.quest_defs   for select using (true);
create policy "Anyone can read unlocks"    on public.unlocks      for select using (true);
create policy "Players read own rest days" on public.rest_days    for select using (user_id = auth.uid());
create policy "Players read own claims"    on public.quest_claims for select using (user_id = auth.uid());

revoke insert, update, delete, truncate on
  public.profiles, public.sets, public.items, public.rest_days, public.records,
  public.quest_defs, public.quest_claims, public.unlocks
  from anon, authenticated;
grant select on
  public.profiles, public.sets, public.items, public.rest_days, public.records,
  public.quest_defs, public.quest_claims, public.unlocks, public.lb_weekly
  to anon, authenticated;

-- internal helpers: never callable from the app
revoke execute on function
  public._me(), public._me_read(), public._boost_on(jsonb, text), public._today(), public._local_today(text),
  public._week_start(date), public._streak(public.profiles, date), public._unlock(public.profiles, text, text, date),
  public._metric(uuid, text, date, date), public._assigned(uuid, date), public._record(uuid, text, int, text, bigint, date)
  from public, anon, authenticated;

-- player actions: signed-in players only
revoke execute on function
  public.create_profile(text), public.set_timezone(text), public.submit_set(text, int, int, text, boolean),
  public.log_rest_day(), public.get_quests(), public.claim_quest(text), public.claim_daily(),
  public.buy_item(text), public.equip(text), public.get_dashboard(int), public.day_detail(date), public.record_history(text)
  from public, anon;
grant execute on function
  public.create_profile(text), public.set_timezone(text), public.submit_set(text, int, int, text, boolean),
  public.log_rest_day(), public.get_quests(), public.claim_quest(text), public.claim_daily(),
  public.buy_item(text), public.equip(text), public.get_dashboard(int), public.day_detail(date), public.record_history(text)
  to authenticated;
