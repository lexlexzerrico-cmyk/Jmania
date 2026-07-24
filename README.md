# 👏 JERKMANIA — AI Clap Speed Arena

An **omoggle-inspired** browser game: clap as fast as you can and an AI-powered
acoustic detector turns your applause into score. Climb a Valorant-style rank
ladder from **Iron to Radiant**, level up, and battle an AI rival 1v1 — all in a
polished neon arena with its own procedurally-generated lobby music.

No installs, no backend, no build step. It's a pure static site.

## ▶️ Run it

Because it uses ES modules, open it through a local web server (not `file://`):

```bash
# from the project root
python3 -m http.server 8000
# then visit http://localhost:8000
```

Any static host works too (GitHub Pages, Netlify, Vercel, `npx serve`, …).

## 🎮 Features

- **AI clap detection** — real-time onset detection over the microphone stream
  (`js/audio.js`). It measures energy + high-frequency content against an
  adaptive noise floor with a refractory gate, so a single clap counts once and
  background rumble is ignored. Adjustable sensitivity + one-tap calibration.
- **Keyboard / tap fallback** — no mic? Press **Space** or tap the stage.
- **Game modes**
  - 🏆 **Ranked** — win to gain RR and climb divisions toward Radiant.
  - ⚡ **Classic** — a clean 30-second high-score sprint.
  - ⚔️ **Duel (1v1)** — head-to-head vs an AI rival scaled to your rank.
  - 🎛️ **Custom** — pick the duration and rival difficulty.
- **1v1 Clash bar** — a Clash-Royale-style tug-of-war. Instead of a score, a
  single bar is split between you (blue) and your rival (red) with a **lightning
  bolt** at the seam. Every clap shoves the bolt toward the opponent — clap
  faster than they do and their bar shrinks toward 0 for a **KNOCKOUT**. If the
  timer runs out, whoever owns more of the bar wins.
- **Fast-clap scoring (solo modes)** — sustained fast clapping ramps a **combo
  multiplier** (up to ×6), so the score climbs faster the harder you go. A live
  CPS meter turns *hot* when you break 6 claps/second. In 1v1 the same multiplier
  makes each clap shove the lightning bar harder.
- **Valorant-style ranks** — Iron · Bronze · Silver · Gold · Platinum · Diamond ·
  Ascendant · Immortal (three divisions each) · **Radiant**, with RR gains/losses
  and promotions/demotions.
- **Levels & XP** — an escalating XP curve with playful level titles
  (Rookie Clapper → Clap Deity), persisted in `localStorage`.
- **Lobby music** — a self-contained synth-wave loop generated with the Web Audio
  API (`js/music.js`) — no audio files, fully royalty-free.
- **Polished UI** — glassmorphism, animated gradient background, particle field,
  clap bursts, countdown, timer ring, and reward animations.

## 🗂️ Structure

```
index.html          markup + app shell
css/styles.css      design system + all screens
js/
  main.js           app controller: router, input, match lifecycle
  audio.js          microphone clap-detection engine
  music.js          procedural lobby music synth
  game.js           match engine: scoring, combo, CPS, 1v1 bot
  ranks.js          rank ladder + level curve
  storage.js        profile persistence + progression math
  ui.js             screen templates + view helpers
```

## 🔒 Notes

- All progress is stored locally in your browser (`localStorage`) — nothing is
  uploaded anywhere.
- The microphone stream is analyzed on-device only and is never recorded or sent.

Have fun. Clap responsibly. 👏
