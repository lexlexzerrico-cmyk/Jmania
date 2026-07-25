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
const GOON_CAP = 0.15; // Goon Skills add at most +15% (mirror of goons.js)

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
    this.online = !!cfg.online;     // real remote opponent (foe driven by the network)
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
    // Online 1v1 is decided by cumulative push (order-independent, so both
    // peers agree once every clap has crossed the reliable channel).
    this.youPush = 0;
    this.foePush = 0;
    this.hostRole = cfg.hostRole !== false; // tie-breaker: host wins exact ties

    // ---- live events: burst windows, silence hazards, perfect pulses ----
    this.activeEvent = null;      // null | "burst" | "silence"
    this.eventEndsAt = 0;
    this._schedule = [];          // [{at, type, dur}]
    this._pulses = [];            // perfect-timing beat times
    this._nextPulseWarned = false;
    this.perfects = 0;
    this.breakdown = { base: 0, burst: 0, perfect: 0, penalty: 0, goons: 0 };

    // ---- Goon Skills loadout ----
    this.mods = cfg.loadoutMods || null;
    this.goonBonus = 0;
    this.goonContrib = {};   // skillId -> points contributed
    this.goon = {
      shieldsLeft: this.mods ? this.mods.shieldSaves : 0,
      rhythmStreak: 0, lastGap: 0,
      odCharge: 0, odActiveUntil: 0, odCdUntil: 0,
      multStacks: 0, burstUsed: 0,
    };

    // Live events only in solo timed modes (keeps 1v1 clean).
    if (!this.endless && !this.bot && !this.online && this.duration >= 15) this._planEvents();
  }

  _addGoon(id, pts) {
    this.goonBonus += pts;
    this.goonContrib[id] = (this.goonContrib[id] || 0) + pts;
  }

  // Apply equipped-skill effects to a clap. Returns bonus points (uncapped;
  // the total is capped at _finish so a build can't exceed the balance limit).
  _applyGoons(basePts, now, gap, perfect) {
    const m = this.mods;
    if (!m) return 0;
    let bonus = 0;
    const g = this.goon;

    // Rhythm: reward steady tempo (gaps within ~35% of the last)
    if (m.rhythmPct > 0) {
      if (g.lastGap && gap < 700 && Math.abs(gap - g.lastGap) < g.lastGap * 0.35) g.rhythmStreak++;
      else g.rhythmStreak = 0;
      if (g.rhythmStreak >= m.rhythmNeed) {
        const add = Math.round(basePts * m.rhythmPct);
        bonus += add; this._addGoon("rhythm", add);
      }
    }
    g.lastGap = gap < 2000 ? gap : g.lastGap;

    // Burst: bonus on PERFECT hits, respecting the per-match cap
    if (perfect && m.burstBonus > 0 && g.burstUsed < m.burstCap) {
      const add = Math.min(m.burstBonus, m.burstCap - g.burstUsed);
      g.burstUsed += add; bonus += add; this._addGoon("burst", add);
      // Overdrive charge on perfects
      if (m.overdrive && now > g.odCdUntil) {
        g.odCharge++;
        if (g.odCharge >= m.overdrive.charge) {
          g.odCharge = 0;
          g.odActiveUntil = now + m.overdrive.durMs;
          g.odCdUntil = now + m.overdrive.durMs + m.overdrive.cdMs;
          this.dispatchEvent(new CustomEvent("overdrive", { detail: { durMs: m.overdrive.durMs } }));
        }
      }
    }

    // Overdrive active boost
    if (m.overdrive && now < g.odActiveUntil) {
      const add = Math.round(basePts * m.overdrive.boostPct);
      bonus += add; this._addGoon("overdrive", add);
    }

    // Conditional multipliers (combo thresholds)
    for (const r of m.multRules) {
      const need = r.condition && r.condition.startsWith("combo") ? parseInt(r.condition.slice(5), 10) : 0;
      if (this.combo >= need) {
        let pct = r.pct;
        if (r.stackEvery) pct = Math.min(r.maxPct || r.pct, r.pct * (1 + Math.floor(this.combo / r.stackEvery)));
        const add = Math.round(basePts * pct);
        bonus += add; this._addGoon("mult", add);
      }
    }
    return bonus;
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
    if (this.bot && !this.online) this._scheduleBot();
  }

  registerClap(strength = 1) {
    if (!this.running) return;
    const now = performance.now();
    this._lastPush = 0;   // push this clap applied to the clash bar (0 = solo)

    // Anti-autoclicker: inputs beyond a humanly-possible rate are ignored.
    if (this._cps(now) >= MAX_LEGIT_CPS) {
      this.dispatchEvent(new CustomEvent("sus", { detail: { cps: this._cps(now) } }));
      return;
    }

    const gap = this.lastClapAt ? now - this.lastClapAt : 9999;
    this.lastClapAt = now;

    // Combo: sustained fast clapping ramps the multiplier
    if (gap < FAST_GAP_MS) this.combo += 1 + (this.mods && this.mods.comboFaster ? (Math.random() < this.mods.comboFaster ? 1 : 0) : 0);
    else if (gap < COMBO_DECAY_MS) this.combo = Math.max(0, this.combo - 1);
    else {
      // Combo drop — a Goon combo-shield can soften it.
      if (this.combo >= 8 && this.goon && this.goon.shieldsLeft > 0) {
        this.goon.shieldsLeft--;
        this.combo = Math.round(this.combo * (1 - this.mods.shieldReduce));
        this.dispatchEvent(new CustomEvent("shieldsave", { detail: { left: this.goon.shieldsLeft } }));
      } else {
        this.combo = 0;
      }
    }

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

    // Goon Skills bonus (capped at finish); silence hazard suppresses it.
    if (this.mods && eventMult > 0) {
      const gb = this._applyGoons(pts, now, gap, perfect);
      pts += gb;
    }

    this.breakdown.base += pts;
    this.score += pts;
    this.totalClaps += 1;
    this.peakCombo = Math.max(this.peakCombo, this.combo);

    // CPS bookkeeping
    this.clapTimes.push(now);

    if (perfect) this.dispatchEvent(new CustomEvent("perfect", { detail: { pts } }));

    // 1v1 clash: shove the lightning bar toward the opponent.
    if (this.bot) {
      const push = pushFor(this.combo, strength);
      this._lastPush = push;   // relayed to the peer so both agree on the bar
      this.youPush += push;
      this.tug = Math.min(100, this.tug + push);
      this.dispatchEvent(new CustomEvent("clash", { detail: { tug: this.tug, by: "you", strength } }));
      // Online is decided by push totals at time-out (no early KO, so both
      // peers stay in sync); the local bot keeps its instant-KO drama.
      if (!this.online && this.tug >= 100) { this.knockout = 1; return this._finish(); }
    }

    this.dispatchEvent(new CustomEvent("clap", {
      detail: { pts, score: this.score, combo: this.combo, mult: this.mult, strength, push: this._lastPush },
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

  // A clap from the REAL remote opponent arrived over the network. Mirrors
  // _botClap but is fed by net messages. Keeps counting for a short grace even
  // after the match ends, so late-arriving claps still count toward the total.
  foeClap(strength = 1, push = null) {
    const now = performance.now();
    this._foeCombo = (this._foeCombo || 0) + 1;
    // Use the exact push the sender applied (relayed over the net) so both
    // peers' bars and verdicts stay identical; fall back to a local estimate.
    const p = (push != null && isFinite(push)) ? push : pushFor(this._foeCombo, strength);
    this.foePush += p;
    this.botClaps += 1;
    this.botClapTimes.push(now);
    const mult = comboToMult(this._foeCombo);
    this.botScore += Math.round(BASE_POINTS * mult * 0.9);
    if (!this.running) return;   // still tallied above; just no live bar move
    this.tug = Math.max(0, this.tug - p);
    this.dispatchEvent(new CustomEvent("clash", { detail: { tug: this.tug, by: "foe", strength } }));
  }

  // Decide the online winner from the synced push totals (called after the
  // reconciliation grace so both peers have every clap).
  onlineVerdict() {
    if (this.youPush > this.foePush) return 1;
    if (this.youPush < this.foePush) return -1;
    if (this.totalClaps !== this.botClaps) return this.totalClaps > this.botClaps ? 1 : -1;
    return this.hostRole ? 1 : -1;
  }

  _finish() {
    if (!this.running) return;
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._botTimer) clearTimeout(this._botTimer);

    // ---- Goon end-of-match bonuses + the +15% balance cap ----
    if (this.mods) {
      // per-PERFECT end bonus
      if (this.mods.perPerfect > 0) {
        const add = this.mods.perPerfect * this.perfects;
        this.score += add; this._addGoon("encore", add);
      }
      // Cap total goon contribution so a build can't exceed the limit.
      const base = Math.max(1, this.score - this.goonBonus);
      const maxGoon = base * GOON_CAP;
      if (this.goonBonus > maxGoon) {
        const cut = Math.round(this.goonBonus - maxGoon);
        this.score -= cut;
        this.goonBonus = Math.round(maxGoon);
        // scale contributions down proportionally for honest attribution
        const factor = maxGoon / (this.goonBonus + cut || 1);
        for (const k in this.goonContrib) this.goonContrib[k] = Math.round(this.goonContrib[k] * factor);
      }
      this.breakdown.goons = Math.round(this.goonBonus);
    }

    // 1v1 is decided by the clash bar (knockout, or who owns more of it at
    // time-out). Online uses synced push totals so both peers agree. Solo
    // modes always "win" (it's a high-score run).
    let won, margin;
    if (this.online) {
      won = this.onlineVerdict() === 1;
      const total = this.youPush + this.foePush || 1;
      margin = Math.round(Math.abs(this.youPush - this.foePush) / total * 100); // 0..100
    } else if (this.bot) {
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
      hasOpponent: !!this.bot || this.online,
      online: this.online,
      botScore: this.botScore,
      botName: this.bot ? this.bot.name : null,
      won,
      margin,
      knockout: !!this.knockout,
      youBar: Math.round(this.tug),
      foeBar: Math.round(100 - this.tug),
      perfects: this.perfects,
      breakdown: this.breakdown,
      goonBonus: Math.round(this.goonBonus || 0),
      goonContrib: this.goonContrib || {},
      loadoutMods: this.mods || null,
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
