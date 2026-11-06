# REPFORGE

Count push-ups and sit-ups with your phone camera, earn **Grit**, climb from **Rookie to Legend**, and top the **public leaderboards**.

- **Train**: camera body tracking counts push-ups, sit-ups and squats (or tap to count, for half rewards). Set timer, voice count, live rank card, daily drop, active boosts.
- **Hub**: today / week / month / lifetime reps, rank, level, Grit, streak, an activity chart (7 days, 30 days, 12 weeks, with a table view), consistency, personal records with history, a training calendar with per-day detail, recent achievements and workouts.
- **Quests**: a daily check-in plus 3 rotating daily quests, and 5 weekly quests. Rewards are claimed once per period and checked by the server. Rest days (up to 2 a week) keep your streak and count for the check-in.
- **Progression**: a four-branch skill tree (Discipline, Strength, Experience, Mastery) paid for with skill points (one per level), and 24 achievements across six categories, each with progress and rewards.
- **Customisation**: frames, avatars, name effects, rank effects, animated profile backgrounds, themes and titles, earned from achievements and skills or bought with Grit. Pin up to 3 achievements to your profile showcase.
- **Friends** (online): find players by name, send and answer friend requests, see who's training right now, open any player's profile (also from the leaderboards) to compare stats side by side, and start private challenges (rivalries) with up to 7 friends for 1–14 days.
- **Guilds** (online): found a guild (300 Grit) or join one. Owner, officer and member roles; open or invite-only with applications; members' reps level the guild; guild leaderboard and activity feed.
- **World boss** (online): the whole community fights one boss. Every finished set deals damage, a new boss rotates in after each one falls or escapes, and everyone who hit it claims a reward.
- **Seasons** (online): a new season every month with its own points, tiers (Bronze to Legend), leaderboard and end-of-season rewards. Your permanent rank never resets.
- **Ranks**: public leaderboards for this week, rank points, push-ups, sit-ups and all reps, with a podium and your own position pinned.
- **Store**: boosts, titles, frames, avatars, name and rank effects, backgrounds and themes, each with a rarity (Common to Legendary). Tap any item to preview it on your own profile; buying takes two taps. No real money, no random loot.
- **Profile**: your card with equipped cosmetics, showcase, stats, a locker to equip or unequip everything you own, the rank ladder, settings and account.
- **Spotify**: shows what's playing with play/pause/skip, and pays +10% Grit while music plays.

Live at `https://lexlexzerrico-cmyk.github.io/Jmania/repforge/` once GitHub Pages is on (see the bottom of this file).

Until you add keys it runs in **local mode**: everything works, but progress and the leaderboard stay on that one device.

---

## 1. Public leaderboards (Supabase, free)

1. Sign up at **supabase.com** and create a project (any name and region; save the database password somewhere).
2. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and press **Run**. It should say "Success".
3. Open **Authentication → Sign In / Providers** and turn on **Allow anonymous sign-ins**. Players get an account instantly with no email.
4. Open **Authentication → URL Configuration** and set **Site URL** to `https://lexlexzerrico-cmyk.github.io/Jmania/repforge/`. Email sign-in links use this.
5. Open **Project Settings → API** (or **Data API / API Keys**). Copy the **Project URL** and the **anon / publishable** key into [`js/config.js`](js/config.js):
   ```js
   SUPABASE_URL: "https://abcdxyz.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```
   The anon key is designed to be public. Never paste the `service_role` / secret key.
6. Commit and push. The Ranks tab now says **Live**.

**Upgrading:** when a new version of `schema.sql` comes out, paste and run the whole file again. It upgrades the database in place and keeps every player, set and purchase.

**One daily cap for everything competitive:** guild XP, boss damage, season points and challenge scores each count at most 300 reps per player per day, so training more than that earns nothing extra. All four are computed on the server from sets it has already validated.

**Challenges are fair by design:** scores are recomputed from server-checked sets inside the challenge window (never stored or sent by the app), camera-only by default, with at most 300 reps a day counted per player. Rewards (150 Grit for first, 50 for taking part) only pay out when two or more players actually trained, at most 3 times a week.

**Why scores can be trusted:** players can read public tables but can't write any of them directly. Every change goes through a database function that checks the rules: 1–300 reps per set, at most 2 reps a second, 5 seconds between sets, store prices, boost timers, streaks, quest progress (recomputed from real sets), one claim per quest per period, records and title unlocks. Days reset at each player's local midnight, and the time zone can only change once a week. Tap-counted sets earn half rank points and never count for single-set records.

Want to wipe a cheater? In Supabase **Table Editor → profiles**, delete their row. Their sets are removed with it.

## 2. Spotify (optional)

1. Go to **developer.spotify.com → Dashboard → Create app**.
2. Add this **Redirect URI** exactly: `https://lexlexzerrico-cmyk.github.io/Jmania/repforge/` (the Profile → Settings screen shows the exact one for wherever you host it). Tick **Web API**, then save.
3. Copy the **Client ID** (not the secret) into `js/config.js` as `SPOTIFY_CLIENT_ID`, then commit and push.
4. **Who can connect:** new Spotify apps start in *development mode*. Only accounts you add under **User Management** in the dashboard can connect. Opening it to everyone needs Spotify's extended-quota approval, which Spotify only grants to registered businesses. Everyone else can still use the whole app; they just don't get the Spotify card.
5. Play/pause/skip needs **Spotify Premium**. Free accounts still see what's playing and still get the +10% Grit.

## 3. Put it online (GitHub Pages)

GitHub repo → **Settings → Pages** → *Deploy from a branch* → pick the branch with this folder, folder `/ (root)` → Save. A minute later it's at the link above. The camera only works on `https://` pages, so open the Pages link, not a downloaded file.

The body-tracking files are shared with the simpler counter in [`../rep-tally/mediapipe/`](../rep-tally/mediapipe), so keep both folders.

## Game rules (quick reference)

| | Camera set | Tap set |
|---|---|---|
| Grit | 1 per rep | ½ per rep |
| Rank points | 1 per push-up, 0.8 per sit-up | half that |
| XP | 2 per rep | 2 per rep |
| Single-set records | yes | no |

- **Daily drop:** 50 Grit + 10 per streak day (up to +100).
- **Titles you earn:** each gives +100 Grit (First Rep, Half Century, Centurion, Thousand Club, Ten-K Machine, Week Warrior, Iron Habit, Gilded, Living Legend, Questbound, Restwise, Record Breaker).
- **Skill points:** one per level after the first; 36 points unlock the whole tree. Skills are permanent, and every bonus is a percentage or a one-off unlock, so none of them asks for more reps.
- **Friends:** up to 200 each; requests are limited to 25 pending and 30 a day. Sending a request to someone who already asked you accepts it. Friends see each other's activity status (training now, trained today, rest day).
- **Guilds:** up to 50 members, one guild per player. Owners promote/demote officers and hand over ownership; owners and officers answer applications and remove members below them.
- **World boss:** 1 damage per camera rep, ½ per tapped rep. Rewards after it falls: 100 / 200 / 300 Grit and XP for 1+ / 100+ / 300+ damage. Health scales with how many people trained that week.
- **Season tiers:** Bronze 0, Silver 300, Gold 900, Platinum 2,000, Diamond 4,000, Legend 7,000 SP; rewards 50–600 Grit. 300+ SP earns the Season Veteran title; top 10 with 900+ earns the Victor name effect.
- **Personal records:** most push-ups / sit-ups / squats in one set (camera only), best day, best week, longest session (sets less than 15 minutes apart), most training days in a week.
- **Ranks:** Rookie → Bronze → Silver → Gold → Platinum → Diamond → Titan (three divisions each) → Legend at 14,000 RP.
- **Changing prices, items or quests:** edit both `js/catalog.js` and the matching `insert` list in `supabase/schema.sql`, then re-run the SQL.

See [ROADMAP.md](ROADMAP.md) for what's coming next.
