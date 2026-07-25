/* ============================================================
   rpg.js — JerkWorld: boss-rush RPG mode
   ------------------------------------------------------------
   A map of bosses beaten by clapping. Claps deal damage (scaled
   by the combo multiplier); bosses regenerate HP, raise shields
   on a telegraphed cycle, and enrage below 25% HP. Beat a boss
   before the timer dies to unlock the next node.
   ============================================================ */
import { comboToMult } from "./game.js";

// Each boss grants a unique "mantle" title on first kill (dropTitle), and the
// tougher ones also drop an UNBUYABLE clap effect (dropEffect) you can't get
// from the shop — the only way to own it is to beat the boss.
export const BOSSES = [
  { id: "jerkling",   name: "Jerkling",        title: "The Wannabe",       emoji: "👺",
    hp: 120,  time: 25, regen: 0, rewardJc: 60,   rewardXp: 80,
    dropTitle: "bt_jerkling",
    taunt: "You call that clapping?" },
  { id: "slapsalot",  name: "Sir Slapsalot",   title: "Knight of the Palm", emoji: "🤺",
    hp: 260,  time: 30, regen: 1, rewardJc: 100,  rewardXp: 130,
    dropTitle: "bt_slapsalot",
    taunt: "Thou shalt not out-clap me!" },
  { id: "clapzilla",  name: "Clapzilla",       title: "City Crusher",      emoji: "🦖",
    hp: 420,  time: 32, regen: 2, rewardJc: 160,  rewardXp: 200,
    dropTitle: "bt_clapzilla", dropEffect: "bfx_kaiju",
    taunt: "RAWR. Your hands are tiny." },
  { id: "djjerk",     name: "DJ Jerkbeat",     title: "Drop Lord",         emoji: "🎧",
    hp: 560,  time: 33, regen: 3, rewardJc: 210,  rewardXp: 260,
    dropTitle: "bt_djjerk",
    taunt: "Can't clap on beat? Sit down." },
  { id: "palmfather", name: "The Palmfather",  title: "Don of the Deal",   emoji: "🤌",
    hp: 720,  time: 35, regen: 3, rewardJc: 280,  rewardXp: 340,
    dropTitle: "bt_palmfather",
    taunt: "You come to me... with soft claps?" },
  { id: "jerkinator", name: "Jerkinator 3000", title: "Machine of Menace", emoji: "🤖",
    hp: 950,  time: 38, regen: 4, rewardJc: 360,  rewardXp: 440,
    dropTitle: "bt_jerkinator", dropEffect: "bfx_overclock",
    taunt: "CLAP.EXE NOT FOUND." },
  { id: "mechamittens", name: "Mecha-Mittens", title: "Frostgear Colossus", emoji: "🦾",
    hp: 1150, time: 39, regen: 4, rewardJc: 440,  rewardXp: 540,
    dropTitle: "bt_mechamittens", dropEffect: "bfx_frostgear",
    taunt: "COLD HANDS. WARM KILL." },
  { id: "thunderjerk", name: "Thunder Jerk",   title: "Storm Herald",      emoji: "🌩️",
    hp: 1400, time: 40, regen: 5, rewardJc: 540,  rewardXp: 650,
    dropTitle: "bt_thunderjerk", dropEffect: "bfx_tempest",
    taunt: "I AM the applause." },
  { id: "jerkzilla",  name: "Jerkzilla",       title: "The Kaiju King",    emoji: "🐲",
    hp: 1750, time: 44, regen: 6, rewardJc: 680,  rewardXp: 800,
    dropTitle: "bt_jerkzilla", dropEffect: "bfx_kaijusoul",
    taunt: "A whole city couldn't stop me. You?" },
  { id: "countess",   name: "Countess Applause", title: "Queen of the Court", emoji: "👑",
    hp: 2050, time: 45, regen: 7, rewardJc: 820,  rewardXp: 960,
    dropTitle: "bt_countess",
    taunt: "Silence in MY court." },
  { id: "jerkmaster", name: "Jerkmaster",      title: "Grandmaster of the Clap", emoji: "🥋",
    hp: 2400, time: 47, regen: 7, rewardJc: 1000, rewardXp: 1150,
    dropTitle: "bt_jerkmaster", dropEffect: "bfx_grandpalm",
    taunt: "Ten thousand claps, and you bring me... this?" },
  { id: "omega",      name: "OMEGA JERKGOD",   title: "The Final Palm",    emoji: "👹",
    hp: 3000, time: 52, regen: 8, rewardJc: 1500, rewardXp: 1700,
    dropTitle: "bt_omega", dropEffect: "bfx_jerkgod",
    taunt: "KNEEL BEFORE THE PALM." },
];

const SHIELD_OPEN_MS = 7000;   // boss is vulnerable...
const SHIELD_UP_MS = 1600;     // ...then shields briefly
const ENRAGE_AT = 0.25;        // below 25% HP regen multiplies

export class BossFight extends EventTarget {
  constructor(boss, opts = {}) {
    super();
    this.boss = boss;
    this.dmgMult = opts.dmgMult || 1;   // admin god-clap hook
    this.hp = boss.hp;
    this.running = false;
    this.raf = null;
    this.startAt = 0;
    this.endAt = 0;
    this.shielded = false;
    this._cycleStart = 0;

    this.combo = 0;
    this.mult = 1;
    this.totalClaps = 0;
    this.peakCps = 0;
    this.peakCombo = 0;
    this.lastClapAt = 0;
    this.clapTimes = [];
    this.blocked = 0;      // claps eaten by the shield
    this.dmgDealt = 0;
  }

  start() {
    this.running = true;
    this.startAt = performance.now();
    this.endAt = this.startAt + this.boss.time * 1000;
    this._cycleStart = this.startAt;
    this._loop();
  }

  registerClap(strength = 1) {
    if (!this.running) return;
    const now = performance.now();
    if (this._cps(now) >= 16) return;   // same anti-autoclick cap as matches

    const gap = this.lastClapAt ? now - this.lastClapAt : 9999;
    this.lastClapAt = now;
    if (gap < 250) this.combo += 1;
    else if (gap < 700) this.combo = Math.max(0, this.combo - 1);
    else this.combo = 0;
    this.mult = comboToMult(this.combo);
    this.peakCombo = Math.max(this.peakCombo, this.combo);
    this.totalClaps += 1;
    this.clapTimes.push(now);

    if (this.shielded) {
      this.blocked += 1;
      this.dispatchEvent(new CustomEvent("blocked", { detail: {} }));
      return;
    }

    const dmg = (1 + Math.random() * 0.3) * this.mult * (0.75 + strength * 0.25) * this.dmgMult;
    this.hp = Math.max(0, this.hp - dmg);
    this.dmgDealt += dmg;
    this.dispatchEvent(new CustomEvent("hit", {
      detail: { dmg, hp: this.hp, pct: this.hp / this.boss.hp, combo: this.combo, mult: this.mult, strength },
    }));
    if (this.hp <= 0) this._finish(true);
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

    // Shield cycle: open -> shield -> open ...
    const inCycle = (now - this._cycleStart) % (SHIELD_OPEN_MS + SHIELD_UP_MS);
    const shouldShield = inCycle >= SHIELD_OPEN_MS;
    if (shouldShield !== this.shielded) {
      this.shielded = shouldShield;
      this.dispatchEvent(new CustomEvent(shouldShield ? "shieldup" : "shielddown", { detail: {} }));
    }

    // Regen (enraged below 25%)
    const enraged = this.hp / this.boss.hp < ENRAGE_AT;
    const regen = this.boss.regen * (enraged ? 2.5 : 1) / 60;
    if (this.hp > 0 && regen) this.hp = Math.min(this.boss.hp, this.hp + regen);

    const cps = this._cps(now);
    this.peakCps = Math.max(this.peakCps, cps);

    this.dispatchEvent(new CustomEvent("tick", {
      detail: {
        remain: remainMs / 1000,
        remainPct: remainMs / (this.boss.time * 1000),
        hp: this.hp, pct: this.hp / this.boss.hp,
        cps, combo: this.combo, mult: this.mult,
        shielded: this.shielded, enraged,
      },
    }));

    if (remainMs <= 0) return this._finish(false);
    this.raf = requestAnimationFrame(() => this._loop());
  }

  _finish(won) {
    if (!this.running) return;
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.dispatchEvent(new CustomEvent("end", {
      detail: {
        won,
        boss: this.boss,
        totalClaps: this.totalClaps,
        peakCps: this.peakCps,
        peakCombo: this.peakCombo,
        blocked: this.blocked,
        dmgDealt: Math.round(this.dmgDealt),
        hpLeft: Math.round(this.hp),
      },
    }));
  }

  abort() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }
}
