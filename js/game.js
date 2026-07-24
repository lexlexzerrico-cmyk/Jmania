/* ============================================================
   game.js — match engine: scoring, combo, CPS, 1v1 bot
   ------------------------------------------------------------
   Emits "tick", "clap", "combo", "end" events. The UI subscribes
   and renders. Fast clapping raises the combo multiplier, which
   makes the score climb faster — the core game feel.
   ============================================================ */

export const BASE_POINTS = 10;
const FAST_GAP_MS = 250;     // clap gaps under this build combo (>4 cps)
const COMBO_DECAY_MS = 700;  // no clap for this long => combo cools down
const MAX_MULT = 6;

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
    this._botTimer = null;
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
    const gap = this.lastClapAt ? now - this.lastClapAt : 9999;
    this.lastClapAt = now;

    // Combo: sustained fast clapping ramps the multiplier
    if (gap < FAST_GAP_MS) this.combo += 1;
    else if (gap < COMBO_DECAY_MS) this.combo = Math.max(0, this.combo - 1);
    else this.combo = 0;

    this.mult = Math.min(MAX_MULT, 1 + this.combo * 0.2);

    const pts = Math.round(BASE_POINTS * this.mult * (0.65 + strength * 0.35));
    this.score += pts;
    this.totalClaps += 1;
    this.peakCombo = Math.max(this.peakCombo, this.combo);

    // CPS bookkeeping
    this.clapTimes.push(now);

    this.dispatchEvent(new CustomEvent("clap", {
      detail: { pts, score: this.score, combo: this.combo, mult: this.mult, strength },
    }));
  }

  _cps(now) {
    const cutoff = now - 1000;
    while (this.clapTimes.length && this.clapTimes[0] < cutoff) this.clapTimes.shift();
    return this.clapTimes.length;
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const remainMs = Math.max(0, this.endAt - now);
    const remain = remainMs / 1000;

    // Combo cools if idle
    if (this.lastClapAt && now - this.lastClapAt > COMBO_DECAY_MS && this.combo > 0) {
      // decay gradually
      if (now - this.lastClapAt > COMBO_DECAY_MS + 250) {
        this.combo = Math.max(0, this.combo - 1);
        this.mult = Math.min(MAX_MULT, 1 + this.combo * 0.2);
        this.lastClapAt = now - COMBO_DECAY_MS; // stagger decay
      }
    }

    const cps = this._cps(now);
    this.peakCps = Math.max(this.peakCps, cps);

    this.dispatchEvent(new CustomEvent("tick", {
      detail: {
        remain,
        remainPct: remainMs / (this.duration * 1000),
        score: this.score,
        cps,
        combo: this.combo,
        mult: this.mult,
        botScore: this.botScore,
        botClaps: this.botClaps,
      },
    }));

    if (remainMs <= 0) return this._finish();
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
    // Bot builds combo similarly for fairness
    this.botClaps += 1;
    this._botCombo = (this._botCombo || 0);
    this._botCombo += 1;
    const mult = Math.min(MAX_MULT, 1 + this._botCombo * 0.2);
    this.botScore += Math.round(BASE_POINTS * mult * 0.9);
  }

  _finish() {
    if (!this.running) return;
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._botTimer) clearTimeout(this._botTimer);

    const won = this.bot ? this.score >= this.botScore : true;
    const margin = this.bot ? Math.abs(this.score - this.botScore) : this.score;

    const result = {
      mode: this.cfg.mode,
      ranked: !!this.cfg.ranked,
      score: this.score,
      totalClaps: this.totalClaps,
      peakCps: this.peakCps,
      peakCombo: this.peakCombo,
      duration: this.duration,
      hasOpponent: !!this.bot,
      botScore: this.botScore,
      botName: this.bot ? this.bot.name : null,
      won,
      margin,
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
