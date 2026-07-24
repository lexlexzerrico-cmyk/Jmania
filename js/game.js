/* ============================================================
   game.js — match engine: scoring, combo, CPS, 1v1 clash
   ------------------------------------------------------------
   Emits "tick", "clap", "clash", "end" events. The UI subscribes
   and renders.

   Solo modes: fast clapping ramps a combo multiplier so the SCORE
   climbs faster — the core game feel.

   1v1 modes (any match with a bot): a Clash-Royale-style tug-of-war
   bar. Every clap shoves a lightning divider toward the opponent;
   whoever claps faster drives the bar until the other side hits 0
   for a KNOCKOUT.
   ============================================================ */

export const BASE_POINTS = 10;
const FAST_GAP_MS = 250;      // clap gaps under this build combo (>4 cps)
const COMBO_DECAY_MS = 700;   // no clap for this long => combo cools down
export const MAX_MULT = 2;    // hard cap — earn every point
export const MULT_STEP = 0.05; // slow ramp: 20-clap combo to reach x2
const MAX_LEGIT_CPS = 16;     // anti-autoclicker: humans top out around here

export function comboToMult(combo) {
  return Math.min(MAX_MULT, 1 + combo * MULT_STEP);
}

// --- Clash (tug-of-war) tuning ---
const BASE_PUSH = 1.35;      // bar units shoved per clap at base strength
// Fast, sustained clapping (higher combo) shoves harder.
function pushFor(combo, strength = 1) {
  return BASE_PUSH * (0.6 + strength * 0.4) * (1 + Math.min(combo, 25) * 0.03);
}

export class Match extends EventTarget {
  /**
   * @param {object} cfg
   *  mode: "classic"|"ranked"|"custom"|"duel"
   *  duration: seconds
   *  ranked: boolean
   *  bot: null | { name, skill }  (skill ~ target cps, 3..9)
   */
  constructor(cfg) {
    super();
    this.cfg = cfg;
    this.endless = !!cfg.endless;   // practice: no timer, ends on demand
    this.duration = cfg.duration;
    this.startAt = 0;
    this.endAt = 0;
    this.running = false;
    this.raf = null;

    // Player state
    this.score = 0;
    this.totalClaps = 0;
    this.combo = 0;          // sustained-tempo counter
    this.mult = 1;
    this.peakCombo = 0;
    this.peakCps = 0;
    this.lastClapAt = 0;
    this.clapTimes = [];     // rolling timestamps (last 1s) for CPS

    // Opponent
    this.bot = cfg.bot || null;
    this.botScore = 0;
    this.botClaps = 0;
    this.botClapTimes = [];
    this._botTimer = null;
    this._botCombo = 0;

    // 1v1 clash tug bar: 0..100 = the player's share of the bar.
    // 50 = dead even, 100 = player knockout, 0 = foe knockout.
    this.tug = 50;
    this.knockout = 0;       // 0 none, 1 player won, -1 foe won

    // ---- live events: burst windows, silence hazards, perfect pulses ----
    this.activeEvent = null;      // null | "burst" | "silence"
    this.eventEndsAt = 0;
    this._schedule = [];          // [{at, type, dur}]
    this._pulses = [];            // perfect-timing beat times
    this._nextPulseWarned = false;
    this.perfects = 0;
    this.breakdown = { base: 0, burst: 0, perfect: 0, penalty: 0 };
    // Live events only in solo timed modes (keeps 1v1 clean).
    if (!this.endless && !this.bot && this.duration >= 15) this._planEvents();
  }

  _planEvents() {
    const D = this.duration * 1000;
    const n = Math.max(2, Math.round(this.duration / 12)); // ~1 event / 12s
    for (let i = 0; i < n; i++) {
      const at = D * (0.2 + 0.65 * (i + Math.random() * 0.5) / n);
      const type = Math.random() < 0.6 ? "burst" : "silence";
      this._schedule.push({ at, type, dur: type === "burst" ? 5000 : 2500 });
    }
    // perfect pulses every ~5s outside the first seconds
    for (let t = 4000; t < D - 2000; t += 4200 + Math.random() * 1800) {
      this._pulses.push(t);
    }
  }

  start() {
    this.running = true;
    this.startAt = performance.now();
    this.endAt = this.startAt + this.duration * 1000;
    this._loop();
    if (this.bot) this._scheduleBot();
  }

  registerClap(strength = 1) {
    if (!this.running) return;
    const now = performance.now();

    // Anti-autoclicker: inputs beyond a humanly-possible rate are ignored.
    if (this._cps(now) >= MAX_LEGIT_CPS) {
      this.dispatchEvent(new CustomEvent("sus", { detail: { cps: this._cps(now) } }));
      return;
    }

    const gap = this.lastClapAt ? now - this.lastClapAt : 9999;
    this.lastClapAt = now;

    // Combo: sustained fast clapping ramps the multiplier
    if (gap < FAST_GAP_MS) this.combo += 1;
    else if (gap < COMBO_DECAY_MS) this.combo = Math.max(0, this.combo - 1);
    else this.combo = 0;

    this.mult = comboToMult(this.combo);

    // Burst window doubles points; silence hazard zeroes them (a "hazard").
    let eventMult = 1;
    if (this.activeEvent === "burst") eventMult = 2;
    else if (this.activeEvent === "silence") eventMult = 0;

    // PERFECT timing: clap within 140ms of a beat pulse for a bonus.
    let perfect = false;
    if (this._pulses.length) {
      const rel = now - this.startAt;
      for (let i = 0; i < this._pulses.length; i++) {
        if (Math.abs(this._pulses[i] - rel) < 140) { perfect = true; this._pulses.splice(i, 1); break; }
      }
    }

    let pts = Math.round(BASE_POINTS * this.mult * (0.65 + strength * 0.35) * eventMult);
    if (perfect && eventMult > 0) { pts += 25; this.perfects += 1; this.breakdown.perfect += 25; }
    if (eventMult === 2) this.breakdown.burst += Math.round(pts / 2);
    this.breakdown.base += pts;
    this.score += pts;
    this.totalClaps += 1;
    this.peakCombo = Math.max(this.peakCombo, this.combo);

    // CPS bookkeeping
    this.clapTimes.push(now);

    if (perfect) this.dispatchEvent(new CustomEvent("perfect", { detail: { pts } }));

    // 1v1 clash: shove the lightning bar toward the opponent.
    if (this.bot) {
      this.tug = Math.min(100, this.tug + pushFor(this.combo, strength));
      this.dispatchEvent(new CustomEvent("clash", { detail: { tug: this.tug, by: "you", strength } }));
      if (this.tug >= 100) { this.knockout = 1; return this._finish(); }
    }

    this.dispatchEvent(new CustomEvent("clap", {
      detail: { pts, score: this.score, combo: this.combo, mult: this.mult, strength },
    }));
  }

  _cps(now) {
    const cutoff = now - 1000;
    while (this.clapTimes.length && this.clapTimes[0] < cutoff) this.clapTimes.shift();
    return this.clapTimes.length;
  }

  _botCps(now) {
    const cutoff = now - 1000;
    while (this.botClapTimes.length && this.botClapTimes[0] < cutoff) this.botClapTimes.shift();
    return this.botClapTimes.length;
  }

  end() { this._finish(); }   // manual finish (practice mode)

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const elapsedMs = now - this.startAt;
    const remainMs = this.endless ? Infinity : Math.max(0, this.endAt - now);
    const remain = this.endless ? elapsedMs / 1000 : remainMs / 1000;

    // Combo cools if idle
    if (this.lastClapAt && now - this.lastClapAt > COMBO_DECAY_MS && this.combo > 0) {
      // decay gradually
      if (now - this.lastClapAt > COMBO_DECAY_MS + 250) {
        this.combo = Math.max(0, this.combo - 1);
        this.mult = comboToMult(this.combo);
        this.lastClapAt = now - COMBO_DECAY_MS; // stagger decay
      }
    }

    const cps = this._cps(now);
    this.peakCps = Math.max(this.peakCps, cps);

    // ---- live event scheduling ----
    const rel = elapsedMs;
    for (let i = this._schedule.length - 1; i >= 0; i--) {
      const ev = this._schedule[i];
      if (rel >= ev.at) {
        this.activeEvent = ev.type;
        this.eventEndsAt = now + ev.dur;
        this._schedule.splice(i, 1);
        this.dispatchEvent(new CustomEvent("event", { detail: { type: ev.type, dur: ev.dur } }));
      }
    }
    if (this.activeEvent && now >= this.eventEndsAt) {
      this.activeEvent = null;
      this.dispatchEvent(new CustomEvent("event", { detail: { type: "clear" } }));
    }
    // perfect-pulse pre-warning (200ms lead) so the player can time it
    if (this._pulses.length) {
      const next = this._pulses[0];
      this.dispatchEvent(new CustomEvent("beat", { detail: { lead: next - rel } }));
    }

    this.dispatchEvent(new CustomEvent("tick", {
      detail: {
        remain,
        endless: this.endless,
        remainPct: this.endless ? 1 : remainMs / (this.duration * 1000),
        score: this.score,
        cps,
        combo: this.combo,
        mult: this.mult,
        event: this.activeEvent,
        botScore: this.botScore,
        botClaps: this.botClaps,
        botCps: this.bot ? this._botCps(now) : 0,
        tug: this.tug,
      },
    }));

    if (!this.endless && remainMs <= 0) return this._finish();
    this.raf = requestAnimationFrame(() => this._loop());
  }

  // ---- Opponent bot ----
  _scheduleBot() {
    if (!this.running || !this.bot) return;
    const skill = this.bot.skill; // target cps
    // human-like jitter: gap around 1000/skill with variance and occasional pauses
    let gap = 1000 / skill;
    gap *= 0.7 + Math.random() * 0.6;
    if (Math.random() < 0.06) gap += 250 + Math.random() * 400; // stumble
    this._botTimer = setTimeout(() => {
      if (!this.running) return;
      this._botClap();
      this._scheduleBot();
    }, gap);
  }

  _botClap() {
    const now = performance.now();
    // Bot builds combo similarly for fairness
    this.botClaps += 1;
    this.botClapTimes.push(now);
    this._botCombo += 1;
    const mult = comboToMult(this._botCombo);
    this.botScore += Math.round(BASE_POINTS * mult * 0.9);

    // 1v1 clash: bot shoves the bar back toward the player.
    this.tug = Math.max(0, this.tug - pushFor(this._botCombo, 1));
    this.dispatchEvent(new CustomEvent("clash", { detail: { tug: this.tug, by: "foe", strength: 1 } }));
    if (this.tug <= 0) { this.knockout = -1; this._finish(); }
  }

  _finish() {
    if (!this.running) return;
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._botTimer) clearTimeout(this._botTimer);

    // 1v1 is decided by the clash bar (knockout, or who owns more of it at
    // time-out). Solo modes always "win" (it's a high-score run).
    let won, margin;
    if (this.bot) {
      won = this.knockout ? this.knockout === 1 : this.tug >= 50;
      margin = Math.abs(this.tug - (100 - this.tug)); // 0..100 bar dominance
    } else {
      won = true;
      margin = this.score;
    }

    const result = {
      mode: this.cfg.mode,
      ranked: !!this.cfg.ranked,
      practice: this.endless,
      score: this.score,
      totalClaps: this.totalClaps,
      peakCps: this.peakCps,
      peakCombo: this.peakCombo,
      duration: this.endless ? Math.round((performance.now() - this.startAt) / 1000) : this.duration,
      hasOpponent: !!this.bot,
      botScore: this.botScore,
      botName: this.bot ? this.bot.name : null,
      won,
      margin,
      knockout: !!this.knockout,
      youBar: Math.round(this.tug),
      foeBar: Math.round(100 - this.tug),
      perfects: this.perfects,
      breakdown: this.breakdown,
    };
    this.dispatchEvent(new CustomEvent("end", { detail: result }));
  }

  abort() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._botTimer) clearTimeout(this._botTimer);
  }
}

// Build a bot whose skill scales with the player's rank index (0..24).
export function makeBot(rankIndex) {
  const names = ["ClapBot-7", "Applaudo", "SmackTron", "HandStorm", "Rallybot", "Percussor", "MegaMitts", "TempoWraith"];
  const name = names[Math.floor(Math.random() * names.length)];
  // skill 3 cps at Iron up to ~8.5 near Radiant, with slight randomness
  const skill = 3 + (rankIndex / 24) * 5.2 + (Math.random() * 0.8 - 0.4);
  return { name, skill: Math.max(2.5, skill) };
}
