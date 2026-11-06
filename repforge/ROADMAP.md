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
4. **Community**: guilds with owner/officer/member roles, guild levels and leaderboards; rotating world bosses whose health only the server changes.
5. **Competitive**: seasons with their own RP, seasonal boards, end-of-season rewards and history; daily contribution caps.
6. **Polish**: sound, motion, performance, accessibility, migration and security test pass.

Bonuses stay capped and never scale with extra volume past a quest target: no reward should push anyone to over-train.
