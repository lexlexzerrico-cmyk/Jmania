# REPFORGE 2.0 roadmap

## Audit (starting point)

| Area | State before 2.0 |
|---|---|
| Front end | Static ES modules, no build step. `app.js` (UI + routing), `backend.js` (Supabase or Local, same API), `catalog.js` (ranks, items), `tracker.js` (MediaPipe pose, push-ups + sit-ups), `spotify.js` (PKCE). |
| Views | Train, Ranks, Store, Profile. Bottom tab bar only; no desktop layout. |
| Server | `supabase/schema.sql`: `profiles`, `sets`, `items`, view `lb_weekly`. All writes go through `security definer` functions (`create_profile`, `submit_set`, `claim_daily`, `buy_item`, `equip`); RLS allows reads only. |
| Gaps | Days are UTC for everyone. No per-day history API, no records, quests, rest days or calendar. Squats not tracked. Unlock times not logged. |

Rules that hold for every milestone: `schema.sql` stays one idempotent file that upgrades an existing database in place; every reward is computed in SQL; local mode mirrors the rules in `backend.js`; no new runtime dependencies.

## Milestones

1. **Core progression** ✅ done
   - Dashboard: today/week/month/lifetime, rank, level, Grit, streak, weekly activity chart (7D/30D/12W), consistency, records, recent achievements and workouts.
   - Daily quests (1 check-in + 3 rotating) and weekly quests, claimed server-side once per period. Rest days (2 a week) keep streaks and complete the check-in.
   - Personal records with history: best set per exercise (camera sets only), best day, best week, longest session, most days in a week.
   - Training calendar with per-day detail.
   - Squats (camera-tracked by knee angle), per-player time zone (7-day change cooldown) so days reset at local midnight.
2. **RPG progression** ✅ done: skill points per level, four-branch skill tree (Discipline, Strength, Experience, Mastery), 24 achievements with progress, frames, avatars, name effects, rank effects, animated backgrounds, achievement showcase, store categories with rarity, live preview, two-tap purchase, equip and unequip. All checked server-side (`unlock_skill`, `equip`, `unequip`, `set_showcase`, `buy_item`).
3. **Social** ✅ done: player search, friend requests (send, accept, decline, cancel, auto-accept on crossing requests), remove friend, activity status, public player profiles with side-by-side comparison, rivalries / private challenges with server-computed, capped scores and once-only rewards (`search_players`, `send_friend_request`, `respond_friend_request`, `get_social`, `get_player`, `create_competition`, `claim_competition`, …). Tested end to end with two browsers against the real SQL.
4. **Community** ✅ done: guilds (found for 300 Grit, open or invite-only, owner/officer/member permissions, applications, activity feed, levels, guild leaderboard) and rotating world bosses whose health and damage only `submit_set` changes, with tiered once-only rewards.
5. **Competitive** ✅ done: monthly seasons with separate season points and tiers, seasonal leaderboard, end-of-season tier rewards, seasonal achievements and history; one 300-reps-a-day cap for guild XP, boss damage, season points and challenges.
6. **Polish** ✅ done: synthesized sound effects (with a setting), boss and record animations, offline banner and friendlier network errors, sheet focus trapping, accessibility scan (no unnamed controls or unlabelled inputs on any screen), full SQL rule tests, v1 → latest migration test, and multi-player end-to-end tests against the real SQL.

Bonuses stay capped and never scale with extra volume past a quest target: no reward should push anyone to over-train.
