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

-- ---- v3 upgrades: skills, achievements, cosmetics ----
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('title','theme','boost','frame','namefx','rankfx','background','avatar'));
alter table public.items add column if not exists rarity     text not null default 'common';
alter table public.items add column if not exists granted_by text;      -- achievement / skill id that grants it, or 'default' (everyone owns it)
alter table public.items drop constraint if exists items_rarity_check;
alter table public.items add constraint items_rarity_check check (rarity in ('common','rare','epic','legendary'));

alter table public.profiles add column if not exists skills     text[] not null default '{}';
alter table public.profiles add column if not exists frame      text not null default 'none';
alter table public.profiles add column if not exists namefx     text not null default 'none';
alter table public.profiles add column if not exists rankfx     text not null default 'none';
alter table public.profiles add column if not exists background text not null default 'none';
alter table public.profiles add column if not exists avatar     text not null default 'a_letter';
alter table public.profiles add column if not exists showcase   text[] not null default '{}';

create table if not exists public.skill_defs (
  id          text primary key,
  branch      text not null check (branch in ('discipline','strength','experience','mastery')),
  tier        int  not null check (tier between 1 and 5),
  cost        int  not null check (cost > 0),
  requires    text references public.skill_defs(id),
  name        text not null,
  description text not null
);

create table if not exists public.achievement_defs (
  id          text primary key,
  category    text not null,
  name        text not null,
  description text not null,
  grit        int  not null default 100,
  sort        int  not null default 0
);

-- =================================================================== v4: friends and rivalries
alter table public.profiles add column if not exists comp_done int not null default 0;
alter table public.profiles add column if not exists comp_wins int not null default 0;

create table if not exists public.friend_requests (
  id           bigint generated always as identity primary key,
  from_id      uuid not null references public.profiles(id) on delete cascade,
  to_id        uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);
-- at most one open request between two players, whichever direction
create unique index if not exists friend_requests_open on public.friend_requests (least(from_id, to_id), greatest(from_id, to_id)) where status = 'pending';
create index if not exists friend_requests_to on public.friend_requests (to_id, status);

create table if not exists public.friends (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  since     timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.competitions (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 3 and 40),
  metric     text not null check (metric in ('reps','push','sit','squat','days')),
  cam_only   boolean not null default true,
  daily_cap  int not null default 300,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.competition_members (
  comp_id   bigint not null references public.competitions(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  status    text not null check (status in ('invited','joined','declined','left')),
  joined_at timestamptz,
  primary key (comp_id, user_id)
);
create index if not exists competition_members_user on public.competition_members (user_id, status);

create table if not exists public.competition_claims (
  comp_id    bigint not null references public.competitions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  place      int not null,
  grit       int not null,
  claimed_at timestamptz not null default now(),
  primary key (comp_id, user_id)
);


-- =================================================================== v5: guilds, world bosses, seasons
create table if not exists public.guilds (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 3 and 24),
  tag         text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  emblem      text not null default 'shield' check (emblem in ('shield','flame','bolt','crown','skull','star','moon','dumbbell')),
  color       text not null default '#ff8a3d' check (color ~ '^#[0-9a-f]{6}$'),
  description text not null default '' check (char_length(description) <= 200),
  open        boolean not null default true,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  xp          int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists guilds_name_lower on public.guilds (lower(name));
create unique index if not exists guilds_tag on public.guilds (tag);

create table if not exists public.guild_members (
  user_id       uuid primary key references public.profiles(id) on delete cascade,   -- one guild per player
  guild_id      bigint not null references public.guilds(id) on delete cascade,
  role          text not null check (role in ('owner','officer','member')),
  joined_at     timestamptz not null default now(),
  contrib       int not null default 0,
  contrib_day   date,
  contrib_today int not null default 0
);
create index if not exists guild_members_guild on public.guild_members (guild_id);

create table if not exists public.guild_applications (
  guild_id   bigint not null references public.guilds(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create table if not exists public.guild_events (
  id         bigint generated always as identity primary key,
  guild_id   bigint not null references public.guilds(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  kind       text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists guild_events_guild on public.guild_events (guild_id, created_at desc);

create table if not exists public.boss_defs (
  id            text primary key,
  name          text not null,
  title         text not null,
  color         text not null,
  base_hp       int not null,
  hp_per_player int not null,
  sort          int not null
);
create table if not exists public.bosses (
  id          bigint generated always as identity primary key,
  def_id      text not null references public.boss_defs(id),
  max_hp      int not null check (max_hp > 0),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  defeated_at timestamptz
);
create table if not exists public.boss_hits (
  boss_id  bigint not null references public.bosses(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  damage   int not null default 0,
  day      date,
  day_reps int not null default 0,
  primary key (boss_id, user_id)
);
create index if not exists boss_hits_boss on public.boss_hits (boss_id, damage desc);
create table if not exists public.boss_claims (
  boss_id    bigint not null references public.bosses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  grit       int not null,
  xp         int not null,
  claimed_at timestamptz not null default now(),
  primary key (boss_id, user_id)
);

create table if not exists public.seasons (
  id        int primary key,
  name      text not null,
  starts_at timestamptz not null,
  ends_at   timestamptz not null
);
create table if not exists public.season_scores (
  season_id int not null references public.seasons(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  sp        int not null default 0,
  day       date,
  day_reps  int not null default 0,
  primary key (season_id, user_id)
);
create index if not exists season_scores_rank on public.season_scores (season_id, sp desc);
create table if not exists public.season_claims (
  season_id  int not null references public.seasons(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  sp         int not null,
  place      int not null,
  tier       text not null,
  grit       int not null,
  claimed_at timestamptz not null default now(),
  primary key (season_id, user_id)
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
insert into public.items (id, kind, price, minutes, buyable, rarity, granted_by) values
  -- titles earned from achievements (granted_by = the achievement)
  ('rookie','title',0,null,false,'common','default'),
  ('first_set','title',0,null,false,'common','first_set'), ('fifty','title',0,null,false,'common','fifty'),
  ('century','title',0,null,false,'rare','century'), ('k1','title',0,null,false,'rare','k1'), ('k10','title',0,null,false,'epic','k10'),
  ('streak7','title',0,null,false,'rare','streak7'), ('streak30','title',0,null,false,'epic','streak30'),
  ('gilded','title',0,null,false,'rare','gilded'), ('legend','title',0,null,false,'legendary','legend'),
  ('questbound','title',0,null,false,'rare','questbound'), ('restwise','title',0,null,false,'common','restwise'),
  ('recordbreaker','title',0,null,false,'rare','recordbreaker'),
  ('triple','title',0,null,false,'common','triple'), ('dawn','title',0,null,false,'rare','dawn'), ('night','title',0,null,false,'rare','night'),
  ('questmaster','title',0,null,false,'epic','questmaster'), ('level25','title',0,null,false,'epic','level25'),
  ('collector','title',0,null,false,'epic','collector'),
  ('champ','title',0,null,false,'epic','champion'),
  ('seasonvet','title',0,null,false,'rare','season_vet'),
  -- titles from capstone skills
  ('unbroken','title',0,null,false,'legendary','d5'), ('unyielding','title',0,null,false,'legendary','s5'),
  ('sage','title',0,null,false,'legendary','e5'), ('grandmaster','title',0,null,false,'legendary','m5'),
  -- store titles
  ('gymrat','title',300,null,true,'common',null), ('corecrusher','title',450,null,true,'common',null), ('plank','title',600,null,true,'rare',null),
  ('beast','title',900,null,true,'rare',null), ('unit','title',1200,null,true,'epic',null), ('maincharacter','title',2000,null,true,'epic',null),
  ('finalboss','title',5000,null,true,'legendary',null),
  -- themes
  ('ember','theme',0,null,false,'common','default'), ('cobalt','theme',400,null,true,'common',null), ('jade','theme',400,null,true,'common',null),
  ('magenta','theme',600,null,true,'rare',null), ('ice','theme',600,null,true,'rare',null), ('crimson','theme',800,null,true,'rare',null),
  ('champion','theme',3000,null,true,'legendary',null),
  -- boosts
  ('grit2x','boost',250,30,true,'common',null), ('xpsurge','boost',200,30,true,'common',null), ('rankrush','boost',400,20,true,'rare',null),
  ('shield','boost',300,null,true,'rare',null),
  -- profile frames
  ('f_iron','frame',300,null,true,'common',null), ('f_ember','frame',700,null,true,'rare',null), ('f_runic','frame',1500,null,true,'epic',null),
  ('f_laurel','frame',0,null,false,'epic','questbound'), ('f_duelist','frame',0,null,false,'rare','rival1'),
  ('f_colossus','frame',0,null,false,'epic','bossslayer'), ('n_victor','namefx',0,null,false,'legendary','season_elite'), ('f_gilded','frame',0,null,false,'legendary','m2'), ('f_titan','frame',0,null,false,'legendary','s5'),
  -- name effects
  ('n_gold','namefx',800,null,true,'rare',null), ('n_frost','namefx',800,null,true,'rare',null), ('n_fire','namefx',1600,null,true,'epic',null),
  ('n_glow','namefx',0,null,false,'epic','e5'), ('n_prism','namefx',0,null,false,'legendary','m4'),
  -- rank effects
  ('r_pulse','rankfx',900,null,true,'rare',null), ('r_halo','rankfx',2500,null,true,'legendary',null), ('r_aura','rankfx',0,null,false,'epic','m3'),
  -- profile backgrounds
  ('b_dusk','background',400,null,true,'common',null), ('b_runes','background',1000,null,true,'rare',null),
  ('b_aurora','background',1800,null,true,'epic',null), ('b_forge','background',0,null,false,'legendary','m5'),
  -- avatars
  ('a_letter','avatar',0,null,false,'common','default'), ('a_bolt','avatar',0,null,false,'common','default'), ('a_dumbbell','avatar',0,null,false,'common','default'),
  ('a_shield','avatar',400,null,true,'rare',null), ('a_skull','avatar',1200,null,true,'epic',null),
  ('a_flame','avatar',0,null,false,'rare','streak7'), ('a_moon','avatar',0,null,false,'rare','restwise'),
  ('a_crown','avatar',0,null,false,'epic','gilded'), ('a_star','avatar',0,null,false,'epic','recordbreaker')
on conflict (id) do update set kind = excluded.kind, price = excluded.price, minutes = excluded.minutes,
  buyable = excluded.buyable, rarity = excluded.rarity, granted_by = excluded.granted_by;

insert into public.boss_defs (id, name, title, color, base_hp, hp_per_player, sort) values
  ('iron',  'The Iron Colossus', 'Golem of the Old Forge',     '#9aa6b8', 1500, 120, 1),
  ('ember', 'Ember Wyrm',        'Serpent of the Ash Pits',    '#ff6a3d', 1800, 140, 2),
  ('frost', 'The Frost Titan',   'Warden of the Long Winter',  '#86d8ff', 2000, 150, 3),
  ('void',  'Void Warden',       'Keeper of the Empty Hour',   '#b07dff', 2200, 160, 4)
on conflict (id) do update set name = excluded.name, title = excluded.title, color = excluded.color,
  base_hp = excluded.base_hp, hp_per_player = excluded.hp_per_player, sort = excluded.sort;

-- Skill tree. Bonuses are flat percentages or one-off unlocks: none of them asks for more reps.
insert into public.skill_defs (id, branch, tier, cost, requires, name, description) values
  ('d1','discipline',1,1,null,'Steady Habit','+50% Grit from the daily Show up quest'),
  ('d2','discipline',2,1,'d1','Second Wind','Hold 4 Streak Shields instead of 3'),
  ('d3','discipline',3,2,'d2','Quest Ledger','+10% Grit from every quest'),
  ('d4','discipline',4,2,'d3','Rest Ritual','Log 3 rest days a week instead of 2'),
  ('d5','discipline',5,3,'d4','Unbroken','+25 Grit from the daily drop. Unlocks the Unbroken title'),
  ('s1','strength',1,1,null,'Iron Will','+10% Grit from camera-tracked sets'),
  ('s2','strength',2,1,'s1','Milestone Hunter','Achievements pay +50 Grit more'),
  ('s3','strength',3,2,'s2','Clean Reps','+10% rank points from camera-tracked sets'),
  ('s4','strength',4,2,'s3','Record Bounty','+50 Grit every time you beat a personal record'),
  ('s5','strength',5,3,'s4','Unyielding','Unlocks the Titan frame and the Unyielding title'),
  ('e1','experience',1,1,null,'Quick Study','+10% XP from sets'),
  ('e2','experience',2,1,'e1','Scholar','+25% XP from quests'),
  ('e3','experience',3,2,'e2','Veteran','Another +10% XP from sets'),
  ('e4','experience',4,2,'e3','Record Keeper','+100 XP every time you beat a personal record'),
  ('e5','experience',5,3,'e4','Sage','Unlocks the Glow name effect and the Sage title'),
  ('m1','mastery',1,1,null,'Showcase','Show 3 achievements on your profile instead of 1'),
  ('m2','mastery',2,1,'m1','Gilded','Unlocks the Gilded frame'),
  ('m3','mastery',3,2,'m2','Aura','Unlocks the Aura rank effect'),
  ('m4','mastery',4,2,'m3','Prismatic','Unlocks the Prism name effect'),
  ('m5','mastery',5,3,'m4','Grandmaster','Unlocks the Forge background and the Grandmaster title')
on conflict (id) do update set branch = excluded.branch, tier = excluded.tier, cost = excluded.cost,
  requires = excluded.requires, name = excluded.name, description = excluded.description;

insert into public.achievement_defs (id, category, name, description, grit, sort) values
  ('first_set','Training','First Rep','Finish your first set',100,1),
  ('fifty','Training','Half Century','50 reps in one set',100,2),
  ('century','Training','Centurion','100 reps in one set',100,3),
  ('triple','Training','Triple Threat','Push-ups, sit-ups and squats on the same day',100,4),
  ('dawn','Training','Dawn Patrol','Finish a set before 7 am',100,5),
  ('night','Training','Night Owl','Finish a set after 10 pm',100,6),
  ('k1','Milestones','Thousand Club','1,000 total reps',100,10),
  ('k10','Milestones','Ten-K Machine','10,000 total reps',100,11),
  ('push500','Milestones','Press Pilgrim','500 push-ups in total',100,12),
  ('sit500','Milestones','Core of Steel','500 sit-ups in total',100,13),
  ('squat500','Milestones','Leg Legend','500 squats in total',100,14),
  ('streak7','Consistency','Week Warrior','7-day streak',100,20),
  ('streak30','Consistency','Iron Habit','30-day streak',100,21),
  ('restwise','Consistency','Restwise','Log 5 rest days',100,22),
  ('questbound','Consistency','Questbound','Claim 25 quest rewards',100,23),
  ('questmaster','Consistency','Quest Master','Claim 100 quest rewards',150,24),
  ('recordbreaker','Records','Record Breaker','Beat your personal records 5 times',100,30),
  ('gilded','Progression','Gilded','Reach Gold rank',100,40),
  ('legend','Progression','Living Legend','Reach Legend rank',200,41),
  ('level10','Progression','Seasoned','Reach level 10',100,42),
  ('level25','Progression','Veteran Soul','Reach level 25',150,43),
  ('apprentice','Progression','Apprentice','Unlock your first skill',100,44),
  ('capstone','Progression','Capstone','Unlock the last skill in any branch',150,45),
  ('collector','Collection','Collector','Own 10 cosmetics',150,50),
  ('friend1','Social','Squad Up','Add your first friend',100,60),
  ('rival1','Social','Worthy Rival','Finish a challenge with friends',100,61),
  ('champion','Social','Champion','Win a challenge',150,62),
  ('guild1','Social','Banner Bearer','Join or found a guild',100,63),
  ('bossslayer','Events','Boss Slayer','Help defeat a world boss',150,70),
  ('season_vet','Seasons','Season Veteran','Finish a season with 300+ season points',100,80),
  ('season_elite','Seasons','Season Elite','Finish a season in the top 10 with 900+ points',200,81)
on conflict (id) do update set category = excluded.category, name = excluded.name, description = excluded.description,
  grit = excluded.grit, sort = excluded.sort;

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

create or replace function public._has(p public.profiles, skill text) returns boolean
language sql immutable as $$ select skill = any(p.skills) $$;

-- Level L needs 40(L-1)^2 + 60(L-1) XP in total (same formula as js/catalog.js).
create or replace function public._level(xp int) returns int
language sql immutable as $$ select 1 + floor((-60 + sqrt(3600 + 160 * greatest(xp, 0)::float8)) / 80)::int $$;

-- One skill point per level after the first, minus what has been spent.
create or replace function public._sp_free(p public.profiles) returns int
language sql stable security definer set search_path = public as $$
  select public._level(p.xp) - 1 - coalesce((select sum(cost) from skill_defs where id = any(p.skills)), 0)::int
$$;

-- Unlocks an achievement once: logs it, pays its Grit, and grants every item it unlocks.
-- (Item ids passed here are achievement or skill ids; legacy callers passed title ids, which are the same.)
create or replace function public._unlock(p public.profiles, item text, src text, today date) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare g int; extra text[];
begin
  if exists (select 1 from public.unlocks where user_id = p.id and item_id = item) then return p; end if;
  insert into public.unlocks (user_id, item_id, source, local_day) values (p.id, item, src, today) on conflict do nothing;
  select coalesce(array_agg(id), '{}') into extra from public.items where granted_by = item and not (id = any(p.inventory));
  p.inventory := p.inventory || extra;
  if exists (select 1 from public.achievement_defs where id = item) then
    g := (select grit from public.achievement_defs where id = item) + (case when public._has(p, 's2') then 50 else 0 end);
    p.grit := p.grit + g;
  end if;
  return p;
end $$;

-- Achievements the player has just earned (not yet unlocked).
create or replace function public._ach_due(p public.profiles, today date) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.id order by d.sort), '{}') from achievement_defs d
  where not exists (select 1 from unlocks u where u.user_id = p.id and u.item_id = d.id)
    and not (d.id = any(p.inventory))
    and case d.id
      when 'first_set'     then p.sets_count >= 1
      when 'fifty'         then p.best_set >= 50
      when 'century'       then p.best_set >= 100
      when 'triple'        then (select count(distinct kind) from sets where user_id = p.id and local_day = today) = 3
      when 'dawn'          then exists (select 1 from sets where user_id = p.id and local_day = today and extract(hour from created_at at time zone p.tz) < 7)
      when 'night'         then exists (select 1 from sets where user_id = p.id and local_day = today and extract(hour from created_at at time zone p.tz) >= 22)
      when 'k1'            then p.total_push + p.total_sit + p.total_squat >= 1000
      when 'k10'           then p.total_push + p.total_sit + p.total_squat >= 10000
      when 'push500'       then p.total_push >= 500
      when 'sit500'        then p.total_sit >= 500
      when 'squat500'      then p.total_squat >= 500
      when 'streak7'       then p.streak >= 7
      when 'streak30'      then p.streak >= 30
      when 'restwise'      then p.rest_count >= 5
      when 'questbound'    then p.quests_done >= 25
      when 'questmaster'   then p.quests_done >= 100
      when 'recordbreaker' then p.records_count >= 5
      when 'gilded'        then p.rp >= 1750
      when 'legend'        then p.rp >= 14000
      when 'level10'       then public._level(p.xp) >= 10
      when 'level25'       then public._level(p.xp) >= 25
      when 'apprentice'    then cardinality(p.skills) >= 1
      when 'capstone'      then exists (select 1 from skill_defs s where s.id = any(p.skills) and s.tier = 5)
      when 'friend1'       then exists (select 1 from friends f where f.user_id = p.id)
      when 'rival1'        then p.comp_done >= 1
      when 'guild1'        then exists (select 1 from guild_members gm where gm.user_id = p.id)
      when 'champion'      then p.comp_wins >= 1
      when 'collector'     then (select count(*) from items i where i.id = any(p.inventory) and i.kind in ('frame','namefx','rankfx','background','avatar') and i.granted_by is distinct from 'default') >= 10
      else false end
$$;

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
  today date; wk date; cam boolean := p_source = 'cam';
  v_rp int; v_xp int; v_grit int; g0 int; v_set bigint; v_sess timestamptz;
  last_set public.sets;
  unl text[] := '{}'; recs jsonb := '[]'; r int; a text; i int; n_rec int; extra jsonb;
begin
  p := public._me();
  today := public._local_today(p.tz); wk := public._week_start(today);
  if p_kind not in ('push','sit','squat') then raise exception 'Unknown exercise'; end if;
  if p_source not in ('cam','tap') then raise exception 'Unknown counting mode'; end if;
  if p_reps is null or p_reps < 1 or p_reps > 300 then raise exception 'A set has to be 1-300 reps'; end if;
  if p_secs is null or p_secs < ceil(p_reps * 0.5) or p_secs > 7200 then raise exception 'That set was too fast to count (max 2 reps a second)'; end if;
  select * into last_set from public.sets where user_id = p.id order by created_at desc limit 1;
  if found and last_set.created_at > now() - interval '5 seconds' then raise exception 'Wait a few seconds between sets'; end if;

  -- rewards (mirrored by previewEarn() in js/backend.js)
  v_rp := round(p_reps
    * (case when p_kind = 'push' then 1.0 else 0.8 end)
    * (case when cam then 1.0 else 0.5 end)
    * (case when public._boost_on(p.boosts, 'rankrush') then 1.25 else 1.0 end)
    * (case when cam and public._has(p, 's3') then 1.1 else 1.0 end));
  v_xp := round(p_reps * 2
    * (case when public._boost_on(p.boosts, 'xpsurge') then 2 else 1 end)
    * (1 + (case when public._has(p, 'e1') then 0.1 else 0 end) + (case when public._has(p, 'e3') then 0.1 else 0 end)));
  v_grit := round(p_reps
    * (case when cam then 1.0 else 0.5 end)
    * (case when public._boost_on(p.boosts, 'grit2x') then 2.0 else 1.0 end)
    * (case when coalesce(p_music, false) then 1.1 else 1.0 end)
    * (case when cam and public._has(p, 's1') then 1.1 else 1.0 end));

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

  -- a session is a run of sets with less than 15 minutes between them
  v_sess := case when last_set.id is not null and last_set.created_at > now() - interval '15 minutes'
                 then last_set.session_start else now() - make_interval(secs => p_secs) end;
  insert into public.sets (user_id, kind, reps, secs, source, rp, xp, grit, local_day, session_start)
  values (p.id, p_kind, p_reps, p_secs, p_source, v_rp, v_xp, v_grit, today, v_sess)
  returning id into v_set;

  -- personal records (single-set records need camera tracking)
  if cam then
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
  n_rec := jsonb_array_length(recs);
  p.records_count := p.records_count + n_rec;
  g0 := p.grit;
  if public._has(p, 's4') then p.grit := p.grit + 50 * n_rec; end if;    -- Record Bounty
  if public._has(p, 'e4') then p.xp := p.xp + 100 * n_rec; end if;      -- Record Keeper

  -- achievements (two passes: an unlock can complete another, e.g. Collector)
  for i in 1..2 loop
    foreach a in array public._ach_due(p, today) loop p := public._unlock(p, a, 'set', today); unl := unl || a; end loop;
  end loop;

  update public.profiles set
    rp = p.rp, xp = p.xp, grit = p.grit, total_push = p.total_push, total_sit = p.total_sit, total_squat = p.total_squat,
    best_set = p.best_set, sets_count = p.sets_count, streak = p.streak, last_active = p.last_active,
    inventory = p.inventory, boosts = p.boosts, records_count = p.records_count, rest_count = p.rest_count
  where id = p.id
  returning * into p;

  extra := public._contribute(p, p_kind, p_reps, cam, today);    -- world boss, season, guild (capped per day)

  return jsonb_build_object(
    'profile', to_jsonb(p),
    'earned', jsonb_build_object('rp', v_rp, 'xp', v_xp, 'grit', v_grit, 'bonus', p.grit - g0),
    'unlocks', to_jsonb(unl),
    'records', recs,
    'contrib', extra);
end $$;

create or replace function public.log_rest_day() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; today date; wk date; unl text[] := '{}'; a text; i int; lim int;
begin
  p := public._me();
  today := public._local_today(p.tz); wk := public._week_start(today);
  lim := case when public._has(p, 'd4') then 3 else 2 end;    -- Rest Ritual
  if exists (select 1 from public.sets where user_id = p.id and local_day = today) then
    raise exception 'You trained today already. Rest days are for days off.';
  end if;
  if exists (select 1 from public.rest_days where user_id = p.id and day = today) then raise exception 'Today is already a rest day'; end if;
  if (select count(*) from public.rest_days where user_id = p.id and day between wk and wk + 6) >= lim then
    raise exception 'You can log up to % rest days a week', lim;
  end if;
  insert into public.rest_days (user_id, day) values (p.id, today);
  p := public._streak(p, today);
  p.rest_count := p.rest_count + 1;
  -- achievements (two passes: an unlock can complete another, e.g. Collector)
  for i in 1..2 loop
    foreach a in array public._ach_due(p, today) loop p := public._unlock(p, a, 'rest', today); unl := unl || a; end loop;
  end loop;
  update public.profiles set streak = p.streak, last_active = p.last_active, boosts = p.boosts,
    rest_count = p.rest_count, inventory = p.inventory, grit = p.grit
  where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p), 'unlocks', to_jsonb(unl));
end $$;

-- Quest rewards after skills (Steady Habit, Quest Ledger, Scholar).
create or replace function public._quest_grit(p public.profiles, q public.quest_defs) returns int
language sql immutable as $$
  select round(q.grit * (case when q.id = 'd_checkin' and public._has(p, 'd1') then 1.5 else 1 end)
                      * (case when public._has(p, 'd3') then 1.1 else 1 end))::int
$$;
create or replace function public._quest_xp(p public.profiles, q public.quest_defs) returns int
language sql immutable as $$ select round(q.xp * (case when public._has(p, 'e2') then 1.25 else 1 end))::int $$;

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
      'metric', q.metric, 'target', q.target, 'progress', least(prog, q.target),
      'xp', public._quest_xp(p, q), 'grit', public._quest_grit(p, q),
      'claimed', exists (select 1 from public.quest_claims c where c.user_id = p.id and c.quest_id = q.id and c.period_start = d0));
  end loop;
  return jsonb_build_object(
    'today', today, 'week_start', wk, 'tz', p.tz,
    'daily_reset', ((today + 1)::timestamp at time zone p.tz),
    'weekly_reset', ((wk + 7)::timestamp at time zone p.tz),
    'quests', res, 'quests_done', p.quests_done,
    'trained_today', exists (select 1 from public.sets where user_id = p.id and local_day = today),
    'rested_today', exists (select 1 from public.rest_days where user_id = p.id and day = today),
    'rest_this_week', (select count(*) from public.rest_days where user_id = p.id and day between wk and wk + 6),
    'rest_limit', case when public._has(p, 'd4') then 3 else 2 end);
end $$;

create or replace function public.claim_quest(p_quest text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; today date; q public.quest_defs; d0 date; d1 date; prog int; unl text[] := '{}'; a text; i int; v_xp int; v_grit int;
begin
  p := public._me();
  today := public._local_today(p.tz);
  select * into q from public._assigned(p.id, today) x where x.id = p_quest;
  if not found then raise exception 'That quest isn''t active right now'; end if;
  if q.period = 'daily' then d0 := today; d1 := today; else d0 := public._week_start(today); d1 := d0 + 6; end if;
  if exists (select 1 from public.quest_claims where user_id = p.id and quest_id = q.id and period_start = d0) then
    raise exception 'Reward already claimed';
  end if;
  prog := public._metric(p.id, q.metric, d0, d1);
  if prog < q.target then raise exception 'Not finished yet (% of %)', prog, q.target; end if;
  v_xp := public._quest_xp(p, q); v_grit := public._quest_grit(p, q);
  insert into public.quest_claims (user_id, quest_id, period_start, xp, grit, local_day) values (p.id, q.id, d0, v_xp, v_grit, today);
  p.xp := p.xp + v_xp;
  p.grit := p.grit + v_grit;
  p.quests_done := p.quests_done + 1;
  -- achievements (two passes: an unlock can complete another, e.g. Collector)
  for i in 1..2 loop
    foreach a in array public._ach_due(p, today) loop p := public._unlock(p, a, 'quest', today); unl := unl || a; end loop;
  end loop;
  update public.profiles set xp = p.xp, grit = p.grit, quests_done = p.quests_done, inventory = p.inventory
  where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p), 'xp', v_xp, 'grit', v_grit, 'unlocks', to_jsonb(unl));
end $$;

create or replace function public.claim_daily() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; amt int; today date;
begin
  p := public._me();
  today := public._local_today(p.tz);
  if p.last_daily >= today then raise exception 'Daily drop already claimed. Come back tomorrow'; end if;
  amt := 50 + 10 * least(p.streak, 10) + (case when public._has(p, 'd5') then 25 else 0 end);
  update public.profiles set grit = grit + amt, last_daily = today where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p), 'amount', amt);
end $$;

create or replace function public.buy_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; it public.items; v_until timestamptz; sh int; cap int; today date; unl text[] := '{}'; a text; i int;
begin
  p := public._me();
  today := public._local_today(p.tz);
  select * into it from public.items where id = p_item and buyable;
  if not found then raise exception 'That item is not for sale'; end if;
  if p.grit < it.price then raise exception 'Not enough Grit yet'; end if;

  if it.kind <> 'boost' then
    if p_item = any(p.inventory) then raise exception 'You already own this'; end if;
    p.inventory := p.inventory || p_item;
  elsif p_item = 'shield' then
    sh := coalesce((p.boosts->>'shield')::int, 0);
    cap := case when public._has(p, 'd2') then 4 else 3 end;    -- Second Wind
    if sh >= cap then raise exception 'You can hold up to % Streak Shields', cap; end if;
    p.boosts := jsonb_set(p.boosts, '{shield}', to_jsonb(sh + 1));
  else
    v_until := greatest(now(), coalesce((p.boosts->>p_item)::timestamptz, now())) + make_interval(mins => it.minutes);
    p.boosts := jsonb_set(p.boosts, array[p_item], to_jsonb(v_until));
  end if;
  p.grit := p.grit - it.price;
  -- achievements (two passes: an unlock can complete another, e.g. Collector)
  for i in 1..2 loop
    foreach a in array public._ach_due(p, today) loop p := public._unlock(p, a, 'store', today); unl := unl || a; end loop;
  end loop;
  update public.profiles set grit = p.grit, inventory = p.inventory, boosts = p.boosts
  where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p), 'unlocks', to_jsonb(unl));
end $$;

-- Equip anything you own (or a default item everyone owns).
create or replace function public.equip(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; it public.items;
begin
  p := public._me();
  select * into it from public.items where id = p_item;
  if not found then raise exception 'Unknown item'; end if;
  if not (p_item = any(p.inventory)) and it.granted_by is distinct from 'default' then raise exception 'Unlock this first'; end if;
  case it.kind
    when 'title'      then update public.profiles set title = p_item      where id = p.id returning * into p;
    when 'theme'      then update public.profiles set theme = p_item      where id = p.id returning * into p;
    when 'frame'      then update public.profiles set frame = p_item      where id = p.id returning * into p;
    when 'namefx'     then update public.profiles set namefx = p_item     where id = p.id returning * into p;
    when 'rankfx'     then update public.profiles set rankfx = p_item     where id = p.id returning * into p;
    when 'background' then update public.profiles set background = p_item where id = p.id returning * into p;
    when 'avatar'     then update public.profiles set avatar = p_item     where id = p.id returning * into p;
    else raise exception 'That can''t be equipped';
  end case;
  return jsonb_build_object('profile', to_jsonb(p));
end $$;

create or replace function public.unequip(p_slot text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me();
  case p_slot
    when 'title'      then update public.profiles set title = 'rookie'     where id = p.id returning * into p;
    when 'theme'      then update public.profiles set theme = 'ember'      where id = p.id returning * into p;
    when 'frame'      then update public.profiles set frame = 'none'       where id = p.id returning * into p;
    when 'namefx'     then update public.profiles set namefx = 'none'      where id = p.id returning * into p;
    when 'rankfx'     then update public.profiles set rankfx = 'none'      where id = p.id returning * into p;
    when 'background' then update public.profiles set background = 'none'  where id = p.id returning * into p;
    when 'avatar'     then update public.profiles set avatar = 'a_letter'  where id = p.id returning * into p;
    else raise exception 'Unknown slot';
  end case;
  return jsonb_build_object('profile', to_jsonb(p));
end $$;

create or replace function public.unlock_skill(p_skill text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; sk public.skill_defs; today date; unl text[] := '{}'; a text; i int; free int; granted text[];
begin
  p := public._me();
  today := public._local_today(p.tz);
  select * into sk from public.skill_defs where id = p_skill;
  if not found then raise exception 'Unknown skill'; end if;
  if public._has(p, p_skill) then raise exception 'You already have this skill'; end if;
  if sk.requires is not null and not public._has(p, sk.requires) then raise exception 'Unlock the skill before it first'; end if;
  free := public._sp_free(p);
  if free < sk.cost then raise exception 'Needs % skill point%. You have %.', sk.cost, case when sk.cost = 1 then '' else 's' end, free; end if;
  p.skills := p.skills || p_skill;
  select coalesce(array_agg(id), '{}') into granted from public.items where granted_by = p_skill and not (id = any(p.inventory));
  p.inventory := p.inventory || granted;
  -- achievements (two passes: an unlock can complete another, e.g. Collector)
  for i in 1..2 loop
    foreach a in array public._ach_due(p, today) loop p := public._unlock(p, a, 'skill', today); unl := unl || a; end loop;
  end loop;
  update public.profiles set skills = p.skills, inventory = p.inventory, grit = p.grit where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p), 'granted', to_jsonb(granted), 'unlocks', to_jsonb(unl));
end $$;

-- Pick which unlocked achievements show on your profile (1 slot, 3 with the Showcase skill).
create or replace function public.set_showcase(p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; slots int; x text;
begin
  p := public._me();
  p_ids := coalesce(p_ids, '{}');
  slots := case when public._has(p, 'm1') then 3 else 1 end;
  if cardinality(p_ids) > slots then raise exception 'You can show % achievement%', slots, case when slots = 1 then '' else 's' end; end if;
  if cardinality(p_ids) <> (select count(distinct v) from unnest(p_ids) v) then raise exception 'Pick each achievement once'; end if;
  foreach x in array p_ids loop
    if not exists (select 1 from public.unlocks where user_id = p.id and item_id = x)
       or not exists (select 1 from public.achievement_defs where id = x) then
      raise exception 'You haven''t unlocked that achievement';
    end if;
  end loop;
  update public.profiles set showcase = p_ids where id = p.id returning * into p;
  return jsonb_build_object('profile', to_jsonb(p));
end $$;

create or replace function public.get_achievements() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me_read();
  return jsonb_build_object(
    'unlocked', (select coalesce(jsonb_agg(jsonb_build_object('id', u.item_id, 'at', u.created_at, 'day', u.local_day)), '[]')
                 from public.unlocks u join public.achievement_defs d on d.id = u.item_id where u.user_id = p.id),
    'sp_free', public._sp_free(p),
    'level', public._level(p.xp));
end $$;

-- =================================================================== social helpers
-- Unlocks whatever achievements a player now qualifies for (used for the *other* player in social actions).
create or replace function public._award_user(uid uuid, src text) returns text[]
language plpgsql security definer set search_path = public as $$
declare p public.profiles; unl text[] := '{}'; a text; i int; today date;
begin
  select * into p from public.profiles where id = uid for update;
  if not found then return unl; end if;
  today := public._local_today(p.tz);
  for i in 1..2 loop
    foreach a in array public._ach_due(p, today) loop p := public._unlock(p, a, src, today); unl := unl || a; end loop;
  end loop;
  if cardinality(unl) > 0 then update public.profiles set inventory = p.inventory, grit = p.grit where id = uid; end if;
  return unl;
end $$;

-- A competitor's score: legitimate sets inside the window, at most daily_cap reps counted per day.
create or replace function public._comp_score(c public.competitions, uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when c.metric = 'days' then 1 else least(v, c.daily_cap) end), 0)::int
  from (select s.local_day, sum(s.reps) v from public.sets s
        where s.user_id = uid and s.created_at >= c.starts_at and s.created_at < c.ends_at
          and (not c.cam_only or s.source = 'cam')
          and (c.metric in ('reps','days') or s.kind = c.metric)
        group by s.local_day) d
$$;

-- What other players may see about someone (public profile fields only).
create or replace function public._public(p public.profiles) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', p.id, 'username', p.username, 'title', p.title, 'theme', p.theme, 'avatar', p.avatar,
    'frame', p.frame, 'namefx', p.namefx, 'rankfx', p.rankfx, 'background', p.background, 'rp', p.rp, 'xp', p.xp,
    'streak', p.streak, 'total_push', p.total_push, 'total_sit', p.total_sit, 'total_squat', p.total_squat,
    'total_reps', p.total_reps, 'best_set', p.best_set, 'sets_count', p.sets_count, 'showcase', p.showcase,
    'comp_wins', p.comp_wins, 'created_at', p.created_at)
$$;

create or replace function public._relation(me uuid, them uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when me = them then 'self'
    when exists (select 1 from friends where user_id = me and friend_id = them) then 'friend'
    when exists (select 1 from friend_requests where from_id = me and to_id = them and status = 'pending') then 'outgoing'
    when exists (select 1 from friend_requests where from_id = them and to_id = me and status = 'pending') then 'incoming'
    else 'none' end
$$;

-- "Training now" / "Trained today" / "Rest day" / last seen, like a chat app's status dot.
create or replace function public._activity(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', case
      when (select max(created_at) from sets where user_id = p.id) > now() - interval '15 minutes' then 'training'
      when exists (select 1 from sets where user_id = p.id and local_day = public._local_today(p.tz)) then 'trained'
      when exists (select 1 from rest_days where user_id = p.id and day = public._local_today(p.tz)) then 'resting'
      else 'idle' end,
    'last_set_at', (select max(created_at) from sets where user_id = p.id),
    'week_reps', (select coalesce(sum(reps), 0) from sets where user_id = p.id and created_at > now() - interval '7 days'))
$$;

-- =================================================================== friends
create or replace function public.search_players(p_q text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; q text;
begin
  p := public._me_read();
  q := trim(coalesce(p_q, ''));
  if char_length(q) < 2 then raise exception 'Type at least 2 characters'; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return (select coalesce(jsonb_agg(x order by x->>'starts' desc, x->>'username'), '[]') from (
    select public._public(o) || jsonb_build_object('relation', public._relation(p.id, o.id), 'starts', lower(o.username) like lower(q) || '%') x
    from public.profiles o where o.id <> p.id and o.username ilike '%' || q || '%'
    order by (lower(o.username) like lower(q) || '%') desc, o.rp desc limit 20) t);
end $$;

create or replace function public._befriend(a uuid, b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from friends where user_id = a) >= 200 or (select count(*) from friends where user_id = b) >= 200 then
    raise exception 'Friend lists are capped at 200';
  end if;
  insert into friends (user_id, friend_id) values (a, b), (b, a) on conflict do nothing;
end $$;

create or replace function public.send_friend_request(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; inc public.friend_requests; unl text[];
begin
  p := public._me();
  if p_user = p.id then raise exception 'That''s you'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'Player not found'; end if;
  if exists (select 1 from friends where user_id = p.id and friend_id = p_user) then raise exception 'You''re already friends'; end if;
  if exists (select 1 from friend_requests where from_id = p.id and to_id = p_user and status = 'pending') then raise exception 'Request already sent'; end if;
  -- they already asked you: sending back accepts it
  select * into inc from friend_requests where from_id = p_user and to_id = p.id and status = 'pending';
  if found then
    update friend_requests set status = 'accepted', responded_at = now() where id = inc.id;
    perform public._befriend(p.id, p_user);
    unl := public._award_user(p.id, 'social'); perform public._award_user(p_user, 'social');
    return jsonb_build_object('status', 'accepted', 'unlocks', to_jsonb(unl));
  end if;
  if (select count(*) from friend_requests where from_id = p.id and status = 'pending') >= 25 then raise exception 'You have 25 requests waiting. Cancel some first'; end if;
  if (select count(*) from friend_requests where from_id = p.id and created_at > now() - interval '1 day') >= 30 then raise exception 'That''s enough requests for today'; end if;
  insert into friend_requests (from_id, to_id) values (p.id, p_user);
  return jsonb_build_object('status', 'sent');
end $$;

create or replace function public.respond_friend_request(p_request bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; r public.friend_requests; unl text[] := '{}';
begin
  p := public._me();
  select * into r from friend_requests where id = p_request for update;
  if not found or r.to_id <> p.id then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'That request was already answered'; end if;
  update friend_requests set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now() where id = r.id;
  if p_accept then
    perform public._befriend(p.id, r.from_id);
    unl := public._award_user(p.id, 'social'); perform public._award_user(r.from_id, 'social');
  end if;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end, 'unlocks', to_jsonb(unl));
end $$;

create or replace function public.cancel_friend_request(p_request bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me();
  update friend_requests set status = 'cancelled', responded_at = now() where id = p_request and from_id = p.id and status = 'pending';
  if not found then raise exception 'Request not found'; end if;
  return jsonb_build_object('status', 'cancelled');
end $$;

create or replace function public.remove_friend(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me();
  delete from friends where (user_id = p.id and friend_id = p_user) or (user_id = p_user and friend_id = p.id);
  if not found then raise exception 'You weren''t friends'; end if;
  return jsonb_build_object('status', 'removed');
end $$;

create or replace function public.get_social() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me_read();
  return jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(public._public(o) || public._activity(o) || jsonb_build_object('since', f.since) order by o.username), '[]')
                from friends f join profiles o on o.id = f.friend_id where f.user_id = p.id),
    'incoming', (select coalesce(jsonb_agg(jsonb_build_object('request', r.id, 'at', r.created_at, 'player', public._public(o)) order by r.created_at desc), '[]')
                 from friend_requests r join profiles o on o.id = r.from_id where r.to_id = p.id and r.status = 'pending'),
    'outgoing', (select coalesce(jsonb_agg(jsonb_build_object('request', r.id, 'at', r.created_at, 'player', public._public(o)) order by r.created_at desc), '[]')
                 from friend_requests r join profiles o on o.id = r.to_id where r.from_id = p.id and r.status = 'pending'),
    'invites', (select count(*) from competition_members m join competitions c on c.id = m.comp_id
                where m.user_id = p.id and m.status = 'invited' and c.ends_at > now()));
end $$;

-- A player's public profile, plus how they relate to you.
create or replace function public.get_player(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; o public.profiles;
begin
  p := public._me_read();
  select * into o from profiles where id = p_user;
  if not found then raise exception 'Player not found'; end if;
  return public._public(o) || public._activity(o) || jsonb_build_object(
    'relation', public._relation(p.id, o.id),
    'achievements', (select count(*) from unlocks u join achievement_defs d on d.id = u.item_id where u.user_id = o.id),
    'records', (select coalesce(jsonb_agg(x), '[]') from (select distinct on (key) key, value, day from records where user_id = o.id order by key, value desc) x),
    'recent_unlocks', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select item_id, created_at from unlocks where user_id = o.id order by created_at desc limit 6) x),
    'recent_sets', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select kind, reps, source, created_at from sets where user_id = o.id order by created_at desc limit 6) x),
    'friends_count', (select count(*) from friends where user_id = o.id));
end $$;

-- =================================================================== rivalries / private competitions
create or replace function public.create_competition(p_name text, p_metric text, p_days int, p_cam_only boolean, p_invite uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; cid bigint; x uuid;
begin
  p := public._me();
  p_name := trim(coalesce(p_name, ''));
  p_invite := coalesce(p_invite, '{}');
  if char_length(p_name) < 3 or char_length(p_name) > 40 then raise exception 'Give it a name of 3-40 characters'; end if;
  if p_metric not in ('reps','push','sit','squat','days') then raise exception 'Unknown scoring'; end if;
  if p_days is null or p_days < 1 or p_days > 30 then raise exception 'Pick 1 to 30 days'; end if;
  if cardinality(p_invite) < 1 or cardinality(p_invite) > 7 then raise exception 'Invite 1 to 7 friends'; end if;
  if cardinality(p_invite) <> (select count(distinct v) from unnest(p_invite) v) then raise exception 'Invite each friend once'; end if;
  foreach x in array p_invite loop
    if not exists (select 1 from friends where user_id = p.id and friend_id = x) then raise exception 'You can only challenge friends'; end if;
  end loop;
  if (select count(*) from competitions where owner_id = p.id and ends_at > now()) >= 5 then raise exception 'You already run 5 challenges'; end if;
  insert into competitions (owner_id, name, metric, cam_only, ends_at)
  values (p.id, p_name, p_metric, coalesce(p_cam_only, true), now() + make_interval(days => p_days))
  returning id into cid;
  insert into competition_members (comp_id, user_id, status, joined_at) values (cid, p.id, 'joined', now());
  insert into competition_members (comp_id, user_id, status) select cid, v, 'invited' from unnest(p_invite) v;
  return jsonb_build_object('id', cid);
end $$;

create or replace function public.respond_competition(p_comp bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me();
  if not exists (select 1 from competitions where id = p_comp and ends_at > now()) then raise exception 'That challenge has ended'; end if;
  update competition_members set status = case when p_accept then 'joined' else 'declined' end, joined_at = case when p_accept then now() end
  where comp_id = p_comp and user_id = p.id and status = 'invited';
  if not found then raise exception 'No invite for that challenge'; end if;
  return jsonb_build_object('status', case when p_accept then 'joined' else 'declined' end);
end $$;

create or replace function public.leave_competition(p_comp bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me();
  if not exists (select 1 from competitions where id = p_comp and ends_at > now()) then raise exception 'That challenge has ended'; end if;
  update competition_members set status = 'left' where comp_id = p_comp and user_id = p.id and status = 'joined';
  if not found then raise exception 'You''re not in that challenge'; end if;
  return jsonb_build_object('status', 'left');
end $$;

create or replace function public.get_competitions() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me_read();
  return (select coalesce(jsonb_agg(x order by (x->>'ends_at') desc), '[]') from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'metric', c.metric, 'cam_only', c.cam_only, 'daily_cap', c.daily_cap,
      'starts_at', c.starts_at, 'ends_at', c.ends_at, 'owner_id', c.owner_id, 'my_status', mine.status,
      'finished', c.ends_at <= now(),
      'claimed', (select to_jsonb(cc) from competition_claims cc where cc.comp_id = c.id and cc.user_id = p.id),
      'members', (select jsonb_agg(public._public(o) || jsonb_build_object('status', m.status,
                    'score', case when m.status = 'joined' then public._comp_score(c, o.id) else 0 end)
                  order by case when m.status = 'joined' then public._comp_score(c, o.id) else -1 end desc, o.username)
                  from competition_members m join profiles o on o.id = m.user_id where m.comp_id = c.id and m.status in ('joined','invited'))) x
    from competitions c join competition_members mine on mine.comp_id = c.id and mine.user_id = p.id
    where mine.status in ('joined','invited') and (c.ends_at > now() - interval '30 days')) t);
end $$;

-- After the end: 150 Grit for first place (ties share it), 50 for taking part. Only counts when at least two
-- players actually trained, and at most 3 paid claims a week, so it can't be farmed.
create or replace function public.claim_competition(p_comp bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; c public.competitions; my int; best int; active int; place int; g int := 0; unl text[];
begin
  p := public._me();
  select * into c from competitions where id = p_comp;
  if not found then raise exception 'Challenge not found'; end if;
  if c.ends_at > now() then raise exception 'That challenge is still running'; end if;
  if not exists (select 1 from competition_members where comp_id = c.id and user_id = p.id and status = 'joined') then raise exception 'You didn''t take part'; end if;
  if exists (select 1 from competition_claims where comp_id = c.id and user_id = p.id) then raise exception 'Reward already claimed'; end if;
  my := public._comp_score(c, p.id);
  select max(s), count(*) filter (where s > 0) into best, active
    from (select public._comp_score(c, m.user_id) s from competition_members m where m.comp_id = c.id and m.status = 'joined') t;
  place := 1 + (select count(*) from competition_members m where m.comp_id = c.id and m.status = 'joined' and public._comp_score(c, m.user_id) > my);
  if my > 0 and active >= 2 then
    g := case when my = best then 150 else 50 end;
    if (select count(*) from competition_claims cc where cc.user_id = p.id and cc.grit > 0 and cc.claimed_at > now() - interval '7 days') >= 3 then g := 0; end if;
  end if;
  insert into competition_claims (comp_id, user_id, place, grit) values (c.id, p.id, place, g);
  update profiles set grit = grit + g, comp_done = comp_done + 1, comp_wins = comp_wins + (case when my > 0 and my = best and active >= 2 then 1 else 0 end)
  where id = p.id;
  unl := public._award_user(p.id, 'rival');
  select * into p from profiles where id = p.id;
  return jsonb_build_object('profile', to_jsonb(p), 'place', place, 'grit', g, 'score', my, 'unlocks', to_jsonb(unl));
end $$;

-- =================================================================== guilds, bosses, seasons: helpers
create or replace function public._glevel(xp int) returns int language sql immutable as $$ select public._level(xp / 5) $$;

create or replace function public._season_tier(sp int) returns text language sql immutable as $$
  select case when sp >= 7000 then 'legend' when sp >= 4000 then 'diamond' when sp >= 2000 then 'platinum'
              when sp >= 900 then 'gold' when sp >= 300 then 'silver' else 'bronze' end $$;

-- The current season (one per calendar month, UTC), created on first use.
create or replace function public._season() returns public.seasons
language plpgsql security definer set search_path = public as $$
declare s public.seasons; m timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'; n int;
begin
  n := (extract(year from m at time zone 'UTC')::int - 2026) * 12 + extract(month from m at time zone 'UTC')::int - 10;
  select * into s from seasons where id = n;
  if found then return s; end if;
  insert into seasons (id, name, starts_at, ends_at)
  values (n, 'Season ' || n || ' · ' || (array['Ember','Frost','Storm','Iron','Dawn','Night'])[1 + ((n - 1) % 6 + 6) % 6], m, m + interval '1 month')
  on conflict (id) do nothing;
  select * into s from seasons where id = n;
  return s;
end $$;

-- The current world boss, spawning the next one in the rotation when the last escaped or fell 12 hours ago.
create or replace function public._boss() returns public.bosses
language plpgsql security definer set search_path = public as $$
declare b public.bosses; d public.boss_defs; active int;
begin
  select * into b from bosses order by id desc limit 1;
  if found and now() < b.ends_at and (b.defeated_at is null or now() < b.defeated_at + interval '12 hours') then return b; end if;
  perform pg_advisory_xact_lock(4242);
  select * into b from bosses order by id desc limit 1;     -- re-check under the lock
  if found and now() < b.ends_at and (b.defeated_at is null or now() < b.defeated_at + interval '12 hours') then return b; end if;
  select * into d from boss_defs where sort > coalesce((select sort from boss_defs where id = b.def_id), 0) order by sort limit 1;
  if not found then select * into d from boss_defs order by sort limit 1; end if;
  select count(distinct user_id) into active from sets where created_at > now() - interval '7 days';
  insert into bosses (def_id, max_hp, ends_at) values (d.id, greatest(d.base_hp, d.hp_per_player * active), now() + interval '7 days')
  returning * into b;
  return b;
end $$;

-- Called by submit_set: credits a set to the boss, the season and the guild.
-- Each counts at most 300 reps per player per day, so nobody is rewarded for overdoing it.
create or replace function public._contribute(p public.profiles, kind text, reps int, cam boolean, today date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bosses; s public.seasons; h public.boss_hits; sc public.season_scores; gm public.guild_members;
  credit int; dmg int := 0; spg int := 0; gc int := 0; total int; fell boolean := false;
begin
  -- world boss
  b := public._boss();
  if b.defeated_at is null and now() < b.ends_at then
    insert into boss_hits (boss_id, user_id) values (b.id, p.id) on conflict do nothing;
    select * into h from boss_hits where boss_id = b.id and user_id = p.id for update;
    if h.day is distinct from today then h.day_reps := 0; end if;
    credit := greatest(0, least(reps, 300 - h.day_reps));
    dmg := round(credit * (case when cam then 1.0 else 0.5 end));
    update boss_hits set damage = damage + dmg, day = today, day_reps = h.day_reps + credit where boss_id = b.id and user_id = p.id;
    select sum(damage) into total from boss_hits where boss_id = b.id;
    if total >= b.max_hp then update bosses set defeated_at = now() where id = b.id and defeated_at is null; fell := found; end if;
  end if;
  -- season points (same weights as rank points)
  s := public._season();
  insert into season_scores (season_id, user_id) values (s.id, p.id) on conflict do nothing;
  select * into sc from season_scores where season_id = s.id and user_id = p.id for update;
  if sc.day is distinct from today then sc.day_reps := 0; end if;
  credit := greatest(0, least(reps, 300 - sc.day_reps));
  spg := round(credit * (case when kind = 'push' then 1.0 else 0.8 end) * (case when cam then 1.0 else 0.5 end));
  update season_scores set sp = sp + spg, day = today, day_reps = sc.day_reps + credit where season_id = s.id and user_id = p.id;
  -- guild
  select * into gm from guild_members where user_id = p.id for update;
  if found then
    if gm.contrib_day is distinct from today then gm.contrib_today := 0; end if;
    gc := greatest(0, least(reps, 300 - gm.contrib_today));
    update guild_members set contrib = contrib + gc, contrib_day = today, contrib_today = gm.contrib_today + gc where user_id = p.id;
    update guilds set xp = xp + gc where id = gm.guild_id;
  end if;
  return jsonb_build_object('boss_damage', dmg, 'boss_fell', fell, 'season_points', spg, 'guild_contrib', gc);
end $$;

create or replace function public._guild_role(uid uuid, gid bigint) returns text
language sql stable security definer set search_path = public as $$ select role from guild_members where user_id = uid and guild_id = gid $$;

create or replace function public._guild_event(gid bigint, uid uuid, k text, d text default '') returns void
language sql security definer set search_path = public as $$ insert into guild_events (guild_id, user_id, kind, detail) values (gid, uid, k, d) $$;

create or replace function public._guild_card(g public.guilds) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'emblem', g.emblem, 'color', g.color, 'description', g.description,
    'open', g.open, 'xp', g.xp, 'level', public._glevel(g.xp), 'owner_id', g.owner_id, 'created_at', g.created_at,
    'members', (select count(*) from guild_members where guild_id = g.id),
    'week_reps', (select coalesce(sum(s.reps), 0) from sets s join guild_members m on m.user_id = s.user_id
                  where m.guild_id = g.id and s.created_at > greatest(now() - interval '7 days', m.joined_at)))
$$;

-- =================================================================== guild actions
create or replace function public.create_guild(p_name text, p_tag text, p_emblem text, p_color text, p_description text, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; gid bigint; unl text[];
begin
  p := public._me();
  p_name := trim(coalesce(p_name, '')); p_tag := upper(trim(coalesce(p_tag, '')));
  if exists (select 1 from guild_members where user_id = p.id) then raise exception 'Leave your guild first'; end if;
  if char_length(p_name) < 3 or char_length(p_name) > 24 then raise exception 'Guild names are 3-24 characters'; end if;
  if p_tag !~ '^[A-Z0-9]{2,5}$' then raise exception 'Tags are 2-5 letters or numbers'; end if;
  if exists (select 1 from guilds where lower(name) = lower(p_name)) then raise exception 'That guild name is taken'; end if;
  if exists (select 1 from guilds where tag = p_tag) then raise exception 'That tag is taken'; end if;
  if p.grit < 300 then raise exception 'Founding a guild costs 300 Grit'; end if;
  insert into guilds (name, tag, emblem, color, description, open, owner_id)
  values (p_name, p_tag, coalesce(p_emblem, 'shield'), lower(coalesce(p_color, '#ff8a3d')), left(coalesce(p_description, ''), 200), coalesce(p_open, true), p.id)
  returning id into gid;
  insert into guild_members (user_id, guild_id, role) values (p.id, gid, 'owner');
  update profiles set grit = grit - 300 where id = p.id;
  perform public._guild_event(gid, p.id, 'founded', p_name);
  unl := public._award_user(p.id, 'guild');
  return jsonb_build_object('id', gid, 'unlocks', to_jsonb(unl), 'profile', (select to_jsonb(x) from profiles x where x.id = p.id));
end $$;

create or replace function public.join_guild(p_guild bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; g public.guilds; unl text[];
begin
  p := public._me();
  select * into g from guilds where id = p_guild;
  if not found then raise exception 'Guild not found'; end if;
  if exists (select 1 from guild_members where user_id = p.id) then raise exception 'Leave your guild first'; end if;
  if (select count(*) from guild_members where guild_id = g.id) >= 50 then raise exception 'That guild is full (50 members)'; end if;
  if not g.open then
    if (select count(*) from guild_applications where user_id = p.id) >= 5 then raise exception 'You have 5 applications waiting'; end if;
    insert into guild_applications (guild_id, user_id) values (g.id, p.id) on conflict do nothing;
    return jsonb_build_object('status', 'applied');
  end if;
  insert into guild_members (user_id, guild_id, role) values (p.id, g.id, 'member');
  delete from guild_applications where user_id = p.id;
  perform public._guild_event(g.id, p.id, 'joined');
  unl := public._award_user(p.id, 'guild');
  return jsonb_build_object('status', 'joined', 'unlocks', to_jsonb(unl));
end $$;

create or replace function public.cancel_guild_application(p_guild bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  p := public._me();
  delete from guild_applications where guild_id = p_guild and user_id = p.id;
  if not found then raise exception 'No application to cancel'; end if;
  return jsonb_build_object('status', 'cancelled');
end $$;

create or replace function public.respond_guild_application(p_user uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; gid bigint;
begin
  p := public._me();
  select guild_id into gid from guild_members where user_id = p.id and role in ('owner','officer');
  if not found then raise exception 'Only owners and officers can answer applications'; end if;
  delete from guild_applications where guild_id = gid and user_id = p_user;
  if not found then raise exception 'Application not found'; end if;
  if p_accept then
    if exists (select 1 from guild_members where user_id = p_user) then raise exception 'They joined another guild'; end if;
    if (select count(*) from guild_members where guild_id = gid) >= 50 then raise exception 'Your guild is full'; end if;
    insert into guild_members (user_id, guild_id, role) values (p_user, gid, 'member');
    delete from guild_applications where user_id = p_user;
    perform public._guild_event(gid, p_user, 'joined');
    perform public._award_user(p_user, 'guild');
  end if;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end $$;

create or replace function public.leave_guild() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; m public.guild_members;
begin
  p := public._me();
  select * into m from guild_members where user_id = p.id;
  if not found then raise exception 'You''re not in a guild'; end if;
  if m.role = 'owner' then
    if (select count(*) from guild_members where guild_id = m.guild_id) > 1 then raise exception 'Hand ownership to another member first'; end if;
    delete from guilds where id = m.guild_id;      -- last member out closes the guild
    return jsonb_build_object('status', 'disbanded');
  end if;
  delete from guild_members where user_id = p.id;
  perform public._guild_event(m.guild_id, p.id, 'left');
  return jsonb_build_object('status', 'left');
end $$;

-- Owner: promote/demote officers, hand over ownership. Owner and officers: remove members below them.
create or replace function public.manage_member(p_user uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; me public.guild_members; t public.guild_members;
begin
  p := public._me();
  select * into me from guild_members where user_id = p.id;
  if not found then raise exception 'You''re not in a guild'; end if;
  select * into t from guild_members where user_id = p_user and guild_id = me.guild_id;
  if not found then raise exception 'They''re not in your guild'; end if;
  if p_user = p.id then raise exception 'You can''t do that to yourself'; end if;
  if p_action = 'kick' then
    if not (me.role = 'owner' or (me.role = 'officer' and t.role = 'member')) then raise exception 'You can only remove members below your rank'; end if;
    delete from guild_members where user_id = p_user;
    perform public._guild_event(me.guild_id, p_user, 'removed');
  elsif p_action in ('promote','demote','transfer') then
    if me.role <> 'owner' then raise exception 'Only the owner can change roles'; end if;
    if p_action = 'promote' then update guild_members set role = 'officer' where user_id = p_user;
    elsif p_action = 'demote' then update guild_members set role = 'member' where user_id = p_user;
    else
      update guild_members set role = 'officer' where user_id = p.id;
      update guild_members set role = 'owner' where user_id = p_user;
      update guilds set owner_id = p_user where id = me.guild_id;
    end if;
    perform public._guild_event(me.guild_id, p_user, p_action);
  else raise exception 'Unknown action'; end if;
  return jsonb_build_object('status', 'ok');
end $$;

create or replace function public.update_guild(p_description text, p_emblem text, p_color text, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; me public.guild_members;
begin
  p := public._me();
  select * into me from guild_members where user_id = p.id;
  if not found or me.role not in ('owner','officer') then raise exception 'Only owners and officers can edit the guild'; end if;
  update guilds set description = left(coalesce(p_description, description), 200),
    emblem = case when me.role = 'owner' then coalesce(p_emblem, emblem) else emblem end,
    color = case when me.role = 'owner' then lower(coalesce(p_color, color)) else color end,
    open = case when me.role = 'owner' then coalesce(p_open, open) else open end
  where id = me.guild_id;
  perform public._guild_event(me.guild_id, p.id, 'edited');
  return jsonb_build_object('status', 'ok');
end $$;

create or replace function public.get_guilds(p_q text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; q text := trim(coalesce(p_q, ''));
begin
  p := public._me_read();
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return jsonb_build_object(
    'mine', (select guild_id from guild_members where user_id = p.id),
    'applied', (select coalesce(jsonb_agg(guild_id), '[]') from guild_applications where user_id = p.id),
    'guilds', (select coalesce(jsonb_agg(x order by (x->>'week_reps')::int desc, (x->>'xp')::int desc), '[]') from (
      select public._guild_card(g) x from guilds g where q = '' or g.name ilike '%' || q || '%' or g.tag ilike q || '%' limit 50) t));
end $$;

create or replace function public.get_guild(p_guild bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; g public.guilds; myrole text;
begin
  p := public._me_read();
  select * into g from guilds where id = p_guild;
  if not found then raise exception 'Guild not found'; end if;
  myrole := public._guild_role(p.id, g.id);
  return public._guild_card(g) || jsonb_build_object(
    'my_role', myrole,
    'applied', exists (select 1 from guild_applications where guild_id = g.id and user_id = p.id),
    'rank', 1 + (select count(*) from guilds o where o.xp > g.xp),
    'members_list', (select coalesce(jsonb_agg(public._public(o) || jsonb_build_object('role', m.role, 'contrib', m.contrib, 'joined_at', m.joined_at,
                       'week_reps', (select coalesce(sum(reps), 0) from sets s where s.user_id = o.id and s.created_at > greatest(now() - interval '7 days', m.joined_at)))
                       order by case m.role when 'owner' then 0 when 'officer' then 1 else 2 end, m.contrib desc), '[]')
                     from guild_members m join profiles o on o.id = m.user_id where m.guild_id = g.id),
    'events', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
                 select e.kind, e.detail, e.created_at, o.username from guild_events e left join profiles o on o.id = e.user_id
                 where e.guild_id = g.id order by e.created_at desc limit 20) x),
    'recent_sets', case when myrole is null then '[]'::jsonb else (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
                 select s.kind, s.reps, s.created_at, o.username from sets s join guild_members m on m.user_id = s.user_id join profiles o on o.id = s.user_id
                 where m.guild_id = g.id and s.created_at >= m.joined_at order by s.created_at desc limit 12) x) end,
    'applications', case when myrole in ('owner','officer') then (select coalesce(jsonb_agg(public._public(o) || jsonb_build_object('at', a.created_at) order by a.created_at), '[]')
                     from guild_applications a join profiles o on o.id = a.user_id where a.guild_id = g.id) else '[]'::jsonb end);
end $$;

-- =================================================================== world boss
create or replace function public.get_boss() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; b public.bosses; d public.boss_defs; dealt int;
begin
  p := public._me_read();
  b := public._boss();
  select * into d from boss_defs where id = b.def_id;
  select coalesce(sum(damage), 0) into dealt from boss_hits where boss_id = b.id;
  return jsonb_build_object(
    'id', b.id, 'def', d.id, 'name', d.name, 'title', d.title, 'color', d.color, 'max_hp', b.max_hp,
    'hp', greatest(0, b.max_hp - dealt), 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'defeated_at', b.defeated_at,
    'fighters', (select count(*) from boss_hits where boss_id = b.id and damage > 0),
    'my_damage', coalesce((select damage from boss_hits where boss_id = b.id and user_id = p.id), 0),
    'my_today', coalesce((select case when day = public._local_today(p.tz) then day_reps else 0 end from boss_hits where boss_id = b.id and user_id = p.id), 0),
    'top', (select coalesce(jsonb_agg(public._public(o) || jsonb_build_object('damage', h.damage) order by h.damage desc), '[]') from (
              select * from boss_hits where boss_id = b.id and damage > 0 order by damage desc limit 20) h join profiles o on o.id = h.user_id),
    'guilds', (select coalesce(jsonb_agg(x order by (x->>'damage')::int desc), '[]') from (
              select jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'emblem', g.emblem, 'color', g.color, 'damage', sum(h.damage)) x
              from boss_hits h join guild_members m on m.user_id = h.user_id join guilds g on g.id = m.guild_id
              where h.boss_id = b.id group by g.id order by sum(h.damage) desc limit 10) t),
    'claimable', (select coalesce(jsonb_agg(jsonb_build_object('id', bb.id, 'name', dd.name, 'damage', h.damage)), '[]')
              from bosses bb join boss_defs dd on dd.id = bb.def_id join boss_hits h on h.boss_id = bb.id and h.user_id = p.id
              where bb.defeated_at is not null and h.damage > 0 and not exists (select 1 from boss_claims c where c.boss_id = bb.id and c.user_id = p.id)),
    'history', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
              select jsonb_build_object('id', bb.id, 'name', dd.name, 'defeated', bb.defeated_at is not null, 'ends_at', bb.ends_at,
                'my_damage', coalesce((select damage from boss_hits where boss_id = bb.id and user_id = p.id), 0)) x
              from bosses bb join boss_defs dd on dd.id = bb.def_id where bb.id <> b.id order by bb.id desc limit 5) t));
end $$;

-- Rewards for a defeated boss you hit: 100 / 200 / 300 Grit and XP for 1+ / 100+ / 300+ damage. Once per boss.
create or replace function public.claim_boss(p_boss bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; b public.bosses; dmg int; g int; today date; unl text[] := '{}'; a text; i int;
begin
  p := public._me();
  today := public._local_today(p.tz);
  select * into b from bosses where id = p_boss;
  if not found then raise exception 'Boss not found'; end if;
  if b.defeated_at is null then raise exception 'That boss hasn''t fallen'; end if;
  select damage into dmg from boss_hits where boss_id = b.id and user_id = p.id;
  if coalesce(dmg, 0) <= 0 then raise exception 'You didn''t fight this boss'; end if;
  if exists (select 1 from boss_claims where boss_id = b.id and user_id = p.id) then raise exception 'Reward already claimed'; end if;
  g := case when dmg >= 300 then 300 when dmg >= 100 then 200 else 100 end;
  insert into boss_claims (boss_id, user_id, grit, xp) values (b.id, p.id, g, g);
  p.grit := p.grit + g; p.xp := p.xp + g;
  if not exists (select 1 from unlocks where user_id = p.id and item_id = 'bossslayer') then unl := unl || 'bossslayer'::text; end if;
  p := public._unlock(p, 'bossslayer', 'boss', today);
  update profiles set grit = p.grit, xp = p.xp, inventory = p.inventory where id = p.id;
  unl := unl || public._award_user(p.id, 'boss');
  return jsonb_build_object('grit', g, 'xp', g, 'unlocks', to_jsonb(unl), 'profile', (select to_jsonb(x) from profiles x where x.id = p.id));
end $$;

-- =================================================================== seasons
create or replace function public.get_season() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; s public.seasons; mine int;
begin
  p := public._me_read();
  s := public._season();
  mine := coalesce((select sp from season_scores where season_id = s.id and user_id = p.id), 0);
  return jsonb_build_object(
    'id', s.id, 'name', s.name, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'my_sp', mine, 'my_tier', public._season_tier(mine),
    'my_place', case when mine > 0 then 1 + (select count(*) from season_scores where season_id = s.id and sp > mine) end,
    'players', (select count(*) from season_scores where season_id = s.id and sp > 0),
    'my_today', coalesce((select case when day = public._local_today(p.tz) then day_reps else 0 end from season_scores where season_id = s.id and user_id = p.id), 0),
    'top', (select coalesce(jsonb_agg(public._public(o) || jsonb_build_object('sp', x.sp, 'tier', public._season_tier(x.sp)) order by x.sp desc), '[]') from (
              select * from season_scores where season_id = s.id and sp > 0 order by sp desc limit 100) x join profiles o on o.id = x.user_id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', ss.id, 'name', ss.name, 'ends_at', ss.ends_at, 'sp', sc.sp,
                  'tier', public._season_tier(sc.sp), 'claimed', (select to_jsonb(c) from season_claims c where c.season_id = ss.id and c.user_id = p.id))
                  order by ss.id desc), '[]')
                from seasons ss join season_scores sc on sc.season_id = ss.id and sc.user_id = p.id where ss.ends_at <= now() and sc.sp > 0));
end $$;

-- End-of-season reward by tier, once. 300+ SP earns Season Veteran; top 10 with 900+ earns Season Elite.
create or replace function public.claim_season(p_season int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; s public.seasons; mine int; place int; tier text; g int; today date; unl text[] := '{}'; had text[];
begin
  p := public._me();
  today := public._local_today(p.tz);
  select * into s from seasons where id = p_season;
  if not found then raise exception 'Season not found'; end if;
  if s.ends_at > now() then raise exception 'That season is still running'; end if;
  mine := coalesce((select sp from season_scores where season_id = s.id and user_id = p.id), 0);
  if mine <= 0 then raise exception 'You didn''t score in that season'; end if;
  if exists (select 1 from season_claims where season_id = s.id and user_id = p.id) then raise exception 'Reward already claimed'; end if;
  place := 1 + (select count(*) from season_scores where season_id = s.id and sp > mine);
  tier := public._season_tier(mine);
  g := case tier when 'legend' then 600 when 'diamond' then 450 when 'platinum' then 300 when 'gold' then 200 when 'silver' then 100 else 50 end;
  insert into season_claims (season_id, user_id, sp, place, tier, grit) values (s.id, p.id, mine, place, tier, g);
  p.grit := p.grit + g;
  had := array(select item_id from unlocks where user_id = p.id);
  if mine >= 300 then p := public._unlock(p, 'season_vet', 'season', today); end if;
  if place <= 10 and mine >= 900 then p := public._unlock(p, 'season_elite', 'season', today); end if;
  unl := array(select item_id from unlocks where user_id = p.id and not (item_id = any(had)));
  update profiles set grit = p.grit, inventory = p.inventory where id = p.id;
  return jsonb_build_object('grit', g, 'place', place, 'tier', tier, 'sp', mine, 'unlocks', to_jsonb(unl),
    'profile', (select to_jsonb(x) from profiles x where x.id = p.id));
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

-- titles earned before achievements existed get their unlock rows
insert into public.unlocks (user_id, item_id, source, local_day, created_at)
select p.id, d.id, 'legacy', (p.created_at at time zone 'UTC')::date, p.created_at
from public.profiles p join public.achievement_defs d on d.id = any(p.inventory)
on conflict do nothing;

-- items that unlocked achievements now grant (e.g. Gilded -> Crown avatar) for players who earned them earlier
update public.profiles p set inventory = p.inventory || x.add
from (select u.user_id, array_agg(distinct i.id) add
      from public.unlocks u join public.items i on i.granted_by = u.item_id join public.profiles p2 on p2.id = u.user_id
      where not (i.id = any(p2.inventory)) group by u.user_id) x
where x.user_id = p.id;

-- =================================================================== leaderboards
create or replace view public.lb_weekly with (security_invoker = on) as
  select p.id, p.username, p.title, p.theme, p.rp, sum(s.reps)::int as reps, p.avatar, p.frame, p.namefx, p.rankfx
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
alter table public.skill_defs   enable row level security;
alter table public.achievement_defs enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;
alter table public.competition_claims enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_applications enable row level security;
alter table public.guild_events enable row level security;
alter table public.boss_defs enable row level security;
alter table public.bosses enable row level security;
alter table public.boss_hits enable row level security;
alter table public.boss_claims enable row level security;
alter table public.seasons enable row level security;
alter table public.season_scores enable row level security;
alter table public.season_claims enable row level security;

drop policy if exists "Anyone can read profiles"   on public.profiles;
drop policy if exists "Anyone can read sets"       on public.sets;
drop policy if exists "Anyone can read items"      on public.items;
drop policy if exists "Anyone can read records"    on public.records;
drop policy if exists "Anyone can read quests"     on public.quest_defs;
drop policy if exists "Anyone can read unlocks"    on public.unlocks;
drop policy if exists "Players read own rest days" on public.rest_days;
drop policy if exists "Players read own claims"    on public.quest_claims;
drop policy if exists "Anyone can read skills"     on public.skill_defs;
drop policy if exists "Anyone can read achievements" on public.achievement_defs;
create policy "Anyone can read skills"       on public.skill_defs       for select using (true);
drop policy if exists "Players read own requests"  on public.friend_requests;
drop policy if exists "Players read own friends"   on public.friends;
drop policy if exists "Members read competitions"  on public.competitions;
drop policy if exists "Players read own memberships" on public.competition_members;
drop policy if exists "Players read own claims c"  on public.competition_claims;
create policy "Players read own requests"    on public.friend_requests for select using (auth.uid() in (from_id, to_id));
create policy "Players read own friends"     on public.friends for select using (user_id = auth.uid());
create policy "Members read competitions"    on public.competitions for select using (exists (select 1 from public.competition_members m where m.comp_id = id and m.user_id = auth.uid()));
create policy "Players read own memberships" on public.competition_members for select using (user_id = auth.uid());
create policy "Players read own claims c"    on public.competition_claims for select using (user_id = auth.uid());
drop policy if exists "Anyone can read guilds" on public.guilds;
create policy "Anyone can read guilds" on public.guilds for select using (true);
drop policy if exists "Anyone can read guild_members" on public.guild_members;
create policy "Anyone can read guild_members" on public.guild_members for select using (true);
drop policy if exists "Anyone can read guild_events" on public.guild_events;
create policy "Anyone can read guild_events" on public.guild_events for select using (true);
drop policy if exists "Anyone can read boss_defs" on public.boss_defs;
create policy "Anyone can read boss_defs" on public.boss_defs for select using (true);
drop policy if exists "Anyone can read bosses" on public.bosses;
create policy "Anyone can read bosses" on public.bosses for select using (true);
drop policy if exists "Anyone can read boss_hits" on public.boss_hits;
create policy "Anyone can read boss_hits" on public.boss_hits for select using (true);
drop policy if exists "Anyone can read seasons" on public.seasons;
create policy "Anyone can read seasons" on public.seasons for select using (true);
drop policy if exists "Anyone can read season_scores" on public.season_scores;
create policy "Anyone can read season_scores" on public.season_scores for select using (true);
drop policy if exists "Players read own guild_applications" on public.guild_applications;
create policy "Players read own guild_applications" on public.guild_applications for select using (user_id = auth.uid());
drop policy if exists "Players read own boss_claims" on public.boss_claims;
create policy "Players read own boss_claims" on public.boss_claims for select using (user_id = auth.uid());
drop policy if exists "Players read own season_claims" on public.season_claims;
create policy "Players read own season_claims" on public.season_claims for select using (user_id = auth.uid());

create policy "Anyone can read achievements" on public.achievement_defs for select using (true);
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
  public.quest_defs, public.quest_claims, public.unlocks, public.skill_defs, public.achievement_defs,
  public.friend_requests, public.friends, public.competitions, public.competition_members, public.competition_claims,
  public.guilds, public.guild_members, public.guild_applications, public.guild_events, public.boss_defs, public.bosses, public.boss_hits, public.boss_claims, public.seasons, public.season_scores, public.season_claims
  from anon, authenticated;
grant select on public.guilds, public.guild_members, public.guild_events, public.boss_defs, public.bosses, public.boss_hits, public.seasons, public.season_scores to anon, authenticated;
grant select on public.guild_applications, public.boss_claims, public.season_claims to authenticated;
grant select on public.friend_requests, public.friends, public.competitions, public.competition_members, public.competition_claims to authenticated;
grant select on
  public.profiles, public.sets, public.items, public.rest_days, public.records,
  public.quest_defs, public.quest_claims, public.unlocks, public.skill_defs, public.achievement_defs, public.lb_weekly
  to anon, authenticated;

-- internal helpers: never callable from the app
revoke execute on function
  public._me(), public._me_read(), public._boost_on(jsonb, text), public._today(), public._local_today(text),
  public._week_start(date), public._streak(public.profiles, date), public._unlock(public.profiles, text, text, date),
  public._metric(uuid, text, date, date), public._assigned(uuid, date), public._record(uuid, text, int, text, bigint, date),
  public._has(public.profiles, text), public._level(int), public._sp_free(public.profiles), public._ach_due(public.profiles, date),
  public._quest_grit(public.profiles, public.quest_defs), public._quest_xp(public.profiles, public.quest_defs),
  public._award_user(uuid, text), public._comp_score(public.competitions, uuid), public._public(public.profiles),
  public._relation(uuid, uuid), public._activity(public.profiles), public._befriend(uuid, uuid),
  public._glevel(int), public._season_tier(int), public._season(), public._boss(), public._contribute(public.profiles, text, int, boolean, date),
  public._guild_role(uuid, bigint), public._guild_event(bigint, uuid, text, text), public._guild_card(public.guilds)
  from public, anon, authenticated;

-- player actions: signed-in players only
revoke execute on function
  public.create_profile(text), public.set_timezone(text), public.submit_set(text, int, int, text, boolean),
  public.log_rest_day(), public.get_quests(), public.claim_quest(text), public.claim_daily(),
  public.buy_item(text), public.equip(text), public.get_dashboard(int), public.day_detail(date), public.record_history(text),
  public.unequip(text), public.unlock_skill(text), public.set_showcase(text[]), public.get_achievements(),
  public.search_players(text), public.send_friend_request(uuid), public.respond_friend_request(bigint, boolean),
  public.cancel_friend_request(bigint), public.remove_friend(uuid), public.get_social(), public.get_player(uuid),
  public.create_competition(text, text, int, boolean, uuid[]), public.respond_competition(bigint, boolean),
  public.leave_competition(bigint), public.get_competitions(), public.claim_competition(bigint),
  public.create_guild(text, text, text, text, text, boolean), public.join_guild(bigint), public.cancel_guild_application(bigint),
  public.respond_guild_application(uuid, boolean), public.leave_guild(), public.manage_member(uuid, text),
  public.update_guild(text, text, text, boolean), public.get_guilds(text), public.get_guild(bigint),
  public.get_boss(), public.claim_boss(bigint), public.get_season(), public.claim_season(int)
  from public, anon;
grant execute on function
  public.create_profile(text), public.set_timezone(text), public.submit_set(text, int, int, text, boolean),
  public.log_rest_day(), public.get_quests(), public.claim_quest(text), public.claim_daily(),
  public.buy_item(text), public.equip(text), public.get_dashboard(int), public.day_detail(date), public.record_history(text),
  public.unequip(text), public.unlock_skill(text), public.set_showcase(text[]), public.get_achievements(),
  public.search_players(text), public.send_friend_request(uuid), public.respond_friend_request(bigint, boolean),
  public.cancel_friend_request(bigint), public.remove_friend(uuid), public.get_social(), public.get_player(uuid),
  public.create_competition(text, text, int, boolean, uuid[]), public.respond_competition(bigint, boolean),
  public.leave_competition(bigint), public.get_competitions(), public.claim_competition(bigint),
  public.create_guild(text, text, text, text, text, boolean), public.join_guild(bigint), public.cancel_guild_application(bigint),
  public.respond_guild_application(uuid, boolean), public.leave_guild(), public.manage_member(uuid, text),
  public.update_guild(text, text, text, boolean), public.get_guilds(text), public.get_guild(bigint),
  public.get_boss(), public.claim_boss(bigint), public.get_season(), public.claim_season(int)
  to authenticated;
