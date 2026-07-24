/* ============================================================
   fx.js — canvas effect engine + clap-effect catalog
   ------------------------------------------------------------
   One full-screen canvas renders everything: big particle
   bursts, slashes, shockwaves, and ANIMATED SPECIALS (spiral
   galaxy, black hole, chakra cloak, bankai wave, domain circle,
   multi-phase Susanoo guardian). Pooled + sleeps when idle.
   ============================================================ */

const SCALE = 1.8;                    // effects are BIG now
const rnd = (a, b) => a + Math.random() * (b - a);

export const EFFECTS = [
  { id: "none",     name: "Classic",           price: 0,    rarity: "free",      kind: "spark",    sfx: "clap",    colors: ["#b8a8ff", "#ffffff"],            desc: "Clean purple sparks." },
  { id: "katana",   name: "Katana",            price: 600,  rarity: "rare",      kind: "katana",   sfx: "slash",   colors: ["#ffffff", "#22e0d6", "#a8f0ff"], desc: "A huge blade-slash arc cuts the screen. SHING." },
  { id: "ember",    name: "Inferno Fist",      price: 500,  rarity: "rare",      kind: "fireball", sfx: "fire",    colors: ["#ff6a3d", "#ffb03a", "#ff2d2d"], desc: "Fireballs erupt with a roaring whoosh." },
  { id: "frost",    name: "Frostbite",         price: 500,  rarity: "rare",      kind: "frost",    sfx: "ice",     colors: ["#9fe8ff", "#7fb0ff", "#ffffff"], desc: "Ice shards + a crystal shatter chime." },
  { id: "thunder",  name: "Thunderlord",       price: 900,  rarity: "epic",      kind: "thunder",  sfx: "zap",     colors: ["#ffe75a", "#fff8c4", "#7fb0ff"], desc: "A bolt strikes from the sky. Screen flash.", screenFlash: "rgba(255,240,140,0.14)" },
  { id: "shuriken", name: "Shuriken Storm",    price: 700,  rarity: "epic",      kind: "shuriken", sfx: "throw",   colors: ["#cfe4ff", "#8fa8c8", "#ffffff"], desc: "Spinning stars fly out on every clap." },
  { id: "gun",      name: "Hand Cannon",       price: 800,  rarity: "epic",      kind: "gun",      sfx: "bang",    colors: ["#ffd05a", "#ff9f3a", "#fff"],    desc: "Muzzle flash + a sharp BANG." },
  { id: "bomb",     name: "Demolition",        price: 1000, rarity: "epic",      kind: "bomb",     sfx: "boom",    colors: ["#ff6a3d", "#ffd05a", "#555"],    desc: "Shockwave rings blow outward.", screenFlash: "rgba(255,120,40,0.10)" },
  { id: "coin",     name: "Golden Touch",      price: 1500, rarity: "legendary", kind: "coin",     sfx: "coin",    colors: ["#ffd05a", "#ffe79a", "#b8871a"], desc: "Coins spray out. Cha-ching." },
  { id: "confetti", name: "Party Mode",        price: 600,  rarity: "rare",      kind: "confetti", sfx: "pop",     colors: ["#ff3d7f", "#22e0d6", "#ffd05a", "#a6ff3a"], desc: "Confetti explosion + party pop." },
  { id: "bubble",   name: "Tidal",             price: 500,  rarity: "rare",      kind: "bubble",   sfx: "splash",  colors: ["#22e0d6", "#7fb0ff", "#ffffff"], desc: "Water bubbles + a splash ring." },
  { id: "laser",    name: "Laser Grid",        price: 900,  rarity: "epic",      kind: "laser",    sfx: "laser",   colors: ["#ff2d6f", "#ff8fbf", "#ffffff"], desc: "Twin laser beams sweep across." },
  { id: "poison",   name: "Toxic",             price: 700,  rarity: "epic",      kind: "poison",   sfx: "hiss",    colors: ["#a6ff3a", "#3ee08a", "#22c8b0"], desc: "Acid skull cloud bubbles up." },
  { id: "heart",    name: "Heartbreaker",      price: 600,  rarity: "rare",      kind: "heart",    sfx: "twinkle", colors: ["#ff3d7f", "#ff8fbf", "#ffffff"], desc: "Hearts float up with a twinkle." },
  { id: "rainbow",  name: "Prism Storm",       price: 3000, rarity: "legendary", kind: "rainbow",  sfx: "sparkle", colors: null, hueCycle: true,             desc: "Full-spectrum hue-cycling chaos." },
  // ---- animated specials ----
  { id: "void",     name: "Void Walker",       price: 2500, rarity: "legendary", kind: "blackhole", sfx: "suck",   colors: ["#b14dff", "#3a1060", "#000000"], desc: "A REAL black hole opens — accretion disk, light bending, everything gets pulled in.", screenFlash: "rgba(80,20,140,0.13)" },
  { id: "galaxy",   name: "Galaxy",            price: 2000, rarity: "premium",   kind: "galaxy",    sfx: "shimmer", colors: ["#9fe8ff", "#c7b8ff", "#ff9fdc", "#ffffff"], desc: "Premium — an actual spiral galaxy is born from your palms and slowly rotates away." },
  { id: "chakra",   name: "Nine-Tailed Cloak", price: 2800, rarity: "legendary", kind: "chakra",    sfx: "roar",    colors: ["#ff9f3a", "#ffd05a", "#ff5b2d"], desc: "A burning chakra cloak erupts around you — nine tails of fire whip outward." },
  { id: "bankai",   name: "Crimson Bankai",    price: 1800, rarity: "legendary", kind: "bankai",    sfx: "hslash",  colors: ["#ff1f3d", "#8f0f22", "#000000"], desc: "A colossal black-red crescent wave tears across the whole screen." },
  { id: "domain",   name: "Domain Expansion",  price: 3200, rarity: "legendary", kind: "domain",    sfx: "gong",    colors: ["#b14dff", "#3d1a66", "#e8d8ff"], desc: "Reality inverts — an expanding rune circle swallows the arena.", screenFlash: "rgba(60,10,90,0.18)" },
  { id: "dev",      name: "Developer",         price: 0,    rarity: "admin",     kind: "glyph",     sfx: "sparkle", colors: ["#3ee08a", "#a6ff3a", "#0a3"],    desc: "Matrix glyph rain. Admin only." },
  { id: "susanoo",  name: "Spectral Guardian", price: 0,    rarity: "admin",     kind: "spark",     sfx: "vboom",   colors: ["#7fb0ff", "#b14dff", "#22e0d6"], guardian: true, desc: "A colossal armored spirit warrior materializes and SWINGS its blade on big combos. Admin only." },
];

export function effectById(id) { return EFFECTS.find((e) => e.id === id) || EFFECTS[0]; }
export const RARITY_COLOR = {
  free: "#8a90a0", rare: "#4d9cff", epic: "#b14dff",
  legendary: "#ffd05a", premium: "#ff3d9f", admin: "#3ee08a",
};

const GLYPHS = "アカサタナハマヤラ0123456789JC";

export class FxEngine {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:65;";
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.parts = [];
    this.slashes = [];
    this.rings = [];
    this.beams = [];
    this.specials = [];       // animated set-pieces (galaxy, blackhole, …)
    this.guardianT = 0;
    this.raf = null;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.userReduced = false; // settings toggle
    this._resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = innerWidth * dpr;
      this.canvas.height = innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    this._resize();
    addEventListener("resize", this._resize);
  }

  get off() { return this.reduced || this.userReduced; }
  _wake() { if (!this.raf) this._loop(); }
  _col(e, i) { return e.hueCycle ? `hsl(${(performance.now() / 3 + i * 40) % 360},95%,65%)` : e.colors[i % e.colors.length]; }

  _spawn(x, y, opt) {
    this.parts.push(Object.assign({
      x, y, vx: 0, vy: 0, life: 1, decay: 0.025, size: 4 * SCALE,
      color: "#fff", shape: "spark", rot: 0, vr: 0, grav: 0.12, glyph: null, sink: null,
    }, opt));
  }

  burst(x, y, effect, strength = 1, combo = 0) {
    if (this.off) { this._wake(); return; }
    const k = effect.kind;
    const n = 12 + Math.round(strength * 10) + Math.round(combo / 4);

    switch (k) {
      case "katana":
        this.slashes.push({ x, y, ang: rnd(-0.9, -0.4), len: rnd(240, 420), life: 1, decay: 0.07, w: 14, color: effect.colors[1] });
        this.slashes.push({ x: x + rnd(-30, 30), y: y + rnd(-20, 20), ang: rnd(0.4, 0.9), len: rnd(160, 280), life: 1, decay: 0.09, w: 8, color: "#fff" });
        for (let i = 0; i < 10; i++) this._spawn(x, y, { vx: rnd(-6, 6), vy: rnd(-7, 1), size: rnd(3, 6) * SCALE, color: this._col(effect, i), decay: 0.05, grav: 0.05 });
        break;
      case "laser":
        this.beams.push({ x, y, ang: rnd(-0.3, 0.3), life: 1, decay: 0.08, color: effect.colors[0], w: 12 });
        this.beams.push({ x, y, ang: rnd(1.3, 1.9), life: 1, decay: 0.08, color: effect.colors[1], w: 8 });
        break;
      case "fireball":
        this.rings.push({ x, y, r: 10, vr: 9, life: 1, decay: 0.05, color: effect.colors[0], w: 8 });
        for (let i = 0; i < n; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(1, 6), vy: Math.sin(a) * rnd(1, 5) - 3.5, size: rnd(5, 11) * SCALE, color: this._col(effect, i), shape: "flame", grav: -0.05, decay: 0.028 }); }
        break;
      case "frost":
        this.rings.push({ x, y, r: 6, vr: 7, life: 1, decay: 0.06, color: effect.colors[0], w: 5 });
        for (let i = 0; i < n; i++) { const a = (i / n) * 7; this._spawn(x, y, { vx: Math.cos(a) * rnd(3, 8), vy: Math.sin(a) * rnd(3, 8), size: rnd(4, 8) * SCALE, color: this._col(effect, i), shape: "shard", rot: a, grav: 0.02, decay: 0.03 }); }
        break;
      case "thunder":
        this.slashes.push({ x, y: 0, ang: Math.PI / 2, len: y, life: 1, decay: 0.1, w: 10, color: effect.colors[0], jag: true });
        this.rings.push({ x, y, r: 6, vr: 10, life: 1, decay: 0.08, color: effect.colors[0], w: 6 });
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-7, 7), vy: rnd(-8, 2), size: rnd(3, 6) * SCALE, color: this._col(effect, i), decay: 0.05 });
        break;
      case "shuriken":
        for (let i = 0; i < 6; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(5, 10), vy: Math.sin(a) * rnd(5, 10), size: rnd(7, 12) * SCALE, color: effect.colors[0], shape: "shuriken", vr: rnd(0.5, 0.9), grav: 0.02, decay: 0.018 }); }
        break;
      case "gun":
        this.rings.push({ x, y, r: 5, vr: 12, life: 1, decay: 0.12, color: effect.colors[0], w: 12 });
        for (let i = 0; i < 8; i++) this._spawn(x, y, { vx: rnd(-4, 4), vy: rnd(-5, -1), size: rnd(3, 7) * SCALE, color: "#999", grav: 0.03, decay: 0.04 });
        break;
      case "bomb":
        this.rings.push({ x, y, r: 6, vr: 14, life: 1, decay: 0.045, color: effect.colors[0], w: 10 });
        this.rings.push({ x, y, r: 3, vr: 8, life: 1, decay: 0.05, color: effect.colors[1], w: 5 });
        for (let i = 0; i < n + 8; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(3, 10), vy: Math.sin(a) * rnd(3, 10) - 2, size: rnd(3, 6) * SCALE, color: this._col(effect, i), grav: 0.15, decay: 0.028 }); }
        break;
      case "coin":
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-5, 5), vy: rnd(-11, -5), size: rnd(8, 14) * SCALE * 0.7, color: "#ffd05a", shape: "coin", vr: rnd(-0.2, 0.2), grav: 0.35, decay: 0.011 });
        break;
      case "confetti":
        for (let i = 0; i < n + 10; i++) this._spawn(x, y, { vx: rnd(-8, 8), vy: rnd(-12, -4), size: rnd(5, 10) * SCALE * 0.8, color: this._col(effect, i), shape: "confetti", rot: rnd(0, 7), vr: rnd(-0.3, 0.3), grav: 0.25, decay: 0.013 });
        break;
      case "bubble":
        this.rings.push({ x, y, r: 5, vr: 6, life: 1, decay: 0.06, color: effect.colors[0], w: 4 });
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-3.5, 3.5), vy: rnd(-6, -1), size: rnd(5, 11) * SCALE * 0.8, color: this._col(effect, i), shape: "bubble", grav: -0.06, decay: 0.022 });
        break;
      case "poison":
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-3, 3), vy: rnd(-5, -1), size: rnd(6, 12) * SCALE * 0.8, color: this._col(effect, i), shape: "skull", grav: -0.03, decay: 0.018 });
        break;
      case "heart":
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-3, 3), vy: rnd(-6, -2), size: rnd(7, 13) * SCALE * 0.8, color: this._col(effect, i), shape: "heart", grav: 0.02, decay: 0.018 });
        break;
      case "glyph":
        for (let i = 0; i < n; i++) this._spawn(x + rnd(-50, 50), y - 30, { vx: 0, vy: rnd(2, 6), size: rnd(6, 11) * SCALE * 0.8, color: this._col(effect, i), shape: "glyph", grav: 0.05, decay: 0.018, glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)] });
        break;
      // ---- animated specials ----
      case "blackhole": {
        this.specials.push({ type: "blackhole", x, y, t: 0, dur: 1.4 });
        for (let i = 0; i < 22; i++) { const a = rnd(0, 7), d = rnd(80, 170); this._spawn(x + Math.cos(a) * d, y + Math.sin(a) * d, { size: rnd(3, 6) * SCALE, color: this._col(effect, i), sink: { x, y, pull: rnd(0.12, 0.2) }, grav: 0, decay: 0.018 }); }
        break;
      }
      case "galaxy":
        this.specials.push({ type: "galaxy", x, y, t: 0, dur: 1.8, seed: Math.random() * 7 });
        break;
      case "chakra":
        this.specials.push({ type: "chakra", x, y, t: 0, dur: 1.0 });
        for (let i = 0; i < 14; i++) this._spawn(x + rnd(-40, 40), y + rnd(-10, 30), { vx: rnd(-1.5, 1.5), vy: rnd(-7, -3), size: rnd(6, 12) * SCALE * 0.9, color: this._col(effect, i), shape: "flame", grav: -0.08, decay: 0.026 });
        break;
      case "bankai":
        this.specials.push({ type: "bankai", x, y, t: 0, dur: 0.7, dir: Math.random() < 0.5 ? 1 : -1 });
        break;
      case "domain":
        this.specials.push({ type: "domain", x, y, t: 0, dur: 1.5 });
        break;
      default:
        for (let i = 0; i < n; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(2, 7), vy: Math.sin(a) * rnd(2, 7) - 2, size: rnd(3, 7) * SCALE * 0.9, color: this._col(effect, i), grav: 0.12, decay: 0.028 }); }
    }
    if (effect.screenFlash) this._flash(effect.screenFlash);
    if (effect.guardian && combo > 0 && combo % 12 === 0) this.guardianFlash();
    this._wake();
  }

  coinRain(count = 40) {
    if (this.off) return;
    for (let i = 0; i < count; i++) this._spawn(rnd(0, innerWidth), -20 - Math.random() * innerHeight * 0.4, { vx: rnd(-1, 1), vy: rnd(2, 5), size: rnd(9, 16), color: "#ffd05a", shape: "coin", vr: rnd(-0.2, 0.2), grav: 0.05, decay: 0.004 });
    this._wake();
  }

  guardianFlash() { if (!this.off) { this.guardianT = 0.0001; this._wake(); } }

  _flash(color) {
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:64;background:${color};transition:opacity .25s;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "0"; });
    setTimeout(() => el.remove(), 280);
  }

  // ---- ANIMATED SUSANOO: materialize → sword swing → fade (2.2s) ----------
  _drawGuardian(t) {  // t: 0→1 across the whole animation
    const ctx = this.ctx;
    const cx = innerWidth / 2, base = innerHeight * 0.92;
    const s = Math.min(innerWidth, innerHeight) * 0.62;
    // phases: 0-.25 materialize, .25-.6 idle+charge, .6-.75 SWING, .75-1 fade
    const alpha = t < 0.25 ? t / 0.25 * 0.55 : t < 0.75 ? 0.55 : (1 - t) / 0.25 * 0.55;
    const flick = 1 + Math.sin(t * 40) * 0.015;
    // sword angle: raised → big arc swing
    let swordA = -1.15;
    if (t >= 0.6 && t < 0.75) swordA = -1.15 + ((t - 0.6) / 0.15) * 2.1;
    else if (t >= 0.75) swordA = 0.95;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(cx, base);
    ctx.scale(flick, flick);

    // aura glow
    const glow = ctx.createRadialGradient(0, -s * 0.5, s * 0.1, 0, -s * 0.5, s * 0.9);
    glow.addColorStop(0, "rgba(127,176,255,0.35)"); glow.addColorStop(1, "rgba(127,176,255,0)");
    ctx.fillStyle = glow; ctx.fillRect(-s, -s * 1.5, s * 2, s * 1.6);

    // body gradient
    const g = ctx.createLinearGradient(0, -s * 1.4, 0, 0);
    g.addColorStop(0, "#8fc0ff"); g.addColorStop(0.5, "#b14dff"); g.addColorStop(1, "rgba(34,224,214,0.05)");

    // layered armor torso
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-s * 0.44, 0); ctx.lineTo(-s * 0.52, -s * 0.55);
    ctx.lineTo(-s * 0.34, -s * 0.72); ctx.lineTo(-s * 0.4, -s * 0.9);   // left pauldron spike
    ctx.lineTo(-s * 0.2, -s * 0.8);
    ctx.lineTo(-s * 0.24, -s * 1.1); ctx.lineTo(-s * 0.1, -s * 0.9);    // left horn
    ctx.lineTo(0, -s * 1.02);                                            // crest
    ctx.lineTo(s * 0.1, -s * 0.9); ctx.lineTo(s * 0.24, -s * 1.1);      // right horn
    ctx.lineTo(s * 0.2, -s * 0.8);
    ctx.lineTo(s * 0.4, -s * 0.9); ctx.lineTo(s * 0.34, -s * 0.72);     // right pauldron
    ctx.lineTo(s * 0.52, -s * 0.55); ctx.lineTo(s * 0.44, 0);
    ctx.closePath(); ctx.fill();

    // chest plates (detail lines)
    ctx.strokeStyle = "rgba(220,240,255,0.5)"; ctx.lineWidth = s * 0.012;
    ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.5); ctx.lineTo(0, -s * 0.4); ctx.lineTo(s * 0.3, -s * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.32); ctx.lineTo(0, -s * 0.24); ctx.lineTo(s * 0.26, -s * 0.32); ctx.stroke();

    // face mask + glowing eyes
    ctx.fillStyle = "#1a1040";
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.86); ctx.lineTo(s * 0.1, -s * 0.86); ctx.lineTo(s * 0.07, -s * 0.72); ctx.lineTo(-s * 0.07, -s * 0.72); ctx.closePath(); ctx.fill();
    const eyeGlow = 0.6 + Math.sin(t * 25) * 0.4;
    ctx.fillStyle = `rgba(34,224,214,${eyeGlow})`;
    ctx.beginPath(); ctx.arc(-s * 0.045, -s * 0.79, s * 0.018, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.045, -s * 0.79, s * 0.018, 0, 7); ctx.fill();

    // sword arm + blade (animated swing)
    ctx.save();
    ctx.translate(s * 0.42, -s * 0.6);
    ctx.rotate(swordA);
    ctx.strokeStyle = "rgba(200,225,255,0.9)"; ctx.lineWidth = s * 0.045; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.22, 0); ctx.stroke();     // arm
    const bg = ctx.createLinearGradient(s * 0.22, 0, s * 0.95, 0);
    bg.addColorStop(0, "#eaf6ff"); bg.addColorStop(1, "rgba(127,176,255,0.1)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(s * 0.22, -s * 0.035); ctx.lineTo(s * 0.95, -s * 0.012);
    ctx.lineTo(s * 1.0, 0); ctx.lineTo(s * 0.95, s * 0.012); ctx.lineTo(s * 0.22, s * 0.035);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // swing trail during the swing phase
    if (t >= 0.6 && t < 0.8) {
      const p = (t - 0.6) / 0.2;
      ctx.strokeStyle = `rgba(180,220,255,${0.5 * (1 - p)})`;
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.arc(s * 0.42, -s * 0.6, s * 0.85, -1.15, -1.15 + 2.1 * Math.min(1, p * 1.3));
      ctx.stroke();
    }
    ctx.restore();

    // rising spirit flames around the guardian
    if (Math.random() < 0.6) {
      this._spawn(cx + rnd(-s * 0.5, s * 0.5), base - rnd(0, s * 0.4), {
        vx: rnd(-0.5, 0.5), vy: rnd(-4, -2), size: rnd(4, 9) * SCALE * 0.7,
        color: ["#7fb0ff", "#b14dff", "#22e0d6"][Math.floor(rnd(0, 3))], shape: "flame", grav: -0.05, decay: 0.03,
      });
    }
  }

  // ---- animated specials renderer -----------------------------------------
  _drawSpecial(sp, dt) {
    const ctx = this.ctx;
    sp.t += dt;
    const p = Math.min(1, sp.t / sp.dur);
    const fade = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;

    if (sp.type === "galaxy") {
      // rotating spiral of stars, slowly drifting up + growing
      const rot = sp.seed + sp.t * 1.6;
      const R = (30 + p * 90) * 1.4;
      const y = sp.y - p * 60;
      ctx.save(); ctx.globalAlpha = fade;
      const core = ctx.createRadialGradient(sp.x, y, 0, sp.x, y, R);
      core.addColorStop(0, "rgba(255,255,255,0.9)"); core.addColorStop(0.25, "rgba(199,184,255,0.45)"); core.addColorStop(1, "rgba(120,90,255,0)");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(sp.x, y, R, 0, 7); ctx.fill();
      for (let arm = 0; arm < 3; arm++) {
        for (let i = 0; i < 26; i++) {
          const f = i / 26;
          const a = rot + arm * (Math.PI * 2 / 3) + f * 2.6;
          const r = f * R;
          const sx = sp.x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.55;
          ctx.fillStyle = ["#ffffff", "#9fe8ff", "#c7b8ff", "#ff9fdc"][i % 4];
          ctx.globalAlpha = fade * (1 - f * 0.6);
          ctx.beginPath(); ctx.arc(sx, sy, (1 - f) * 3.4 + 0.8, 0, 7); ctx.fill();
        }
      }
      ctx.restore();
      return;
    }

    if (sp.type === "blackhole") {
      const R = 26 + p * 30;
      ctx.save(); ctx.globalAlpha = fade;
      // accretion disk (elliptical, rotating dashes)
      for (let i = 0; i < 20; i++) {
        const a = sp.t * 5 + i * 0.32;
        const rr = R * 1.5 + (i % 4) * 6;
        ctx.strokeStyle = ["#ffb03a", "#ff6a3d", "#b14dff"][i % 3];
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, rr, rr * 0.38, 0.5, a, a + 0.5);
        ctx.stroke();
      }
      // lensing ring + event horizon
      ctx.strokeStyle = "rgba(255,240,220,0.85)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, R * 1.06, 0, 7); ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(sp.x, sp.y, R, 0, 7); ctx.fill();
      ctx.restore();
      return;
    }

    if (sp.type === "chakra") {
      // burning cloak silhouette + nine whipping tails
      ctx.save(); ctx.globalAlpha = fade * 0.8;
      const s = 70 + p * 40;
      const g = ctx.createRadialGradient(sp.x, sp.y, 5, sp.x, sp.y, s * 1.6);
      g.addColorStop(0, "rgba(255,208,90,0.8)"); g.addColorStop(0.6, "rgba(255,120,40,0.35)"); g.addColorStop(1, "rgba(255,60,20,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sp.x, sp.y, s * 1.6, 0, 7); ctx.fill();
      // nine tails
      for (let i = 0; i < 9; i++) {
        const baseA = -Math.PI / 2 + (i - 4) * 0.32;
        const wave = Math.sin(sp.t * 9 + i) * 0.25;
        ctx.strokeStyle = `rgba(255,${140 + i * 8},60,${0.75 * fade})`;
        ctx.lineWidth = 7 - Math.abs(i - 4);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        const midA = baseA + wave, endA = baseA + wave * 1.8;
        const L = s * (1.2 + (i % 3) * 0.25);
        ctx.quadraticCurveTo(
          sp.x + Math.cos(midA) * L * 0.6, sp.y + Math.sin(midA) * L * 0.6,
          sp.x + Math.cos(endA) * L, sp.y + Math.sin(endA) * L
        );
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (sp.type === "bankai") {
      // colossal crescent wave sweeping across the screen
      const W = innerWidth;
      const cx = sp.dir === 1 ? -100 + p * (W + 200) : W + 100 - p * (W + 200);
      ctx.save(); ctx.globalAlpha = fade;
      const grad = ctx.createLinearGradient(cx - 120, 0, cx + 120, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(0.5, "#ff1f3d"); grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - 90 * sp.dir, sp.y - 260);
      ctx.quadraticCurveTo(cx + 130 * sp.dir, sp.y, cx - 90 * sp.dir, sp.y + 260);
      ctx.quadraticCurveTo(cx + 30 * sp.dir, sp.y, cx - 90 * sp.dir, sp.y - 260);
      ctx.fill();
      // black core edge
      ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx - 60 * sp.dir, sp.y - 240);
      ctx.quadraticCurveTo(cx + 110 * sp.dir, sp.y, cx - 60 * sp.dir, sp.y + 240);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (sp.type === "domain") {
      // expanding rune circle + inner inversion
      const R = p * Math.max(innerWidth, innerHeight) * 0.5;
      ctx.save(); ctx.globalAlpha = fade;
      ctx.fillStyle = "rgba(30,8,50,0.35)";
      ctx.beginPath(); ctx.arc(sp.x, sp.y, R, 0, 7); ctx.fill();
      ctx.strokeStyle = "#e8d8ff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, R, 0, 7); ctx.stroke();
      ctx.strokeStyle = "rgba(232,216,255,0.5)";
      ctx.beginPath(); ctx.arc(sp.x, sp.y, R * 0.82, 0, 7); ctx.stroke();
      // rotating runes on the rim
      ctx.fillStyle = "#e8d8ff";
      ctx.font = "700 16px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < 12; i++) {
        const a = sp.t * 1.2 + (i / 12) * Math.PI * 2;
        ctx.save();
        ctx.translate(sp.x + Math.cos(a) * R * 0.91, sp.y + Math.sin(a) * R * 0.91);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(GLYPHS[i % GLYPHS.length], 0, 0);
        ctx.restore();
      }
      ctx.restore();
      return;
    }
  }

  _loop() {
    this.raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._last || now)) / 1000);
    this._last = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    if (this.guardianT > 0) {
      this.guardianT += dt / 2.2;              // 2.2s full animation
      if (this.guardianT >= 1) this.guardianT = 0;
      else this._drawGuardian(this.guardianT);
    }

    for (let i = this.specials.length - 1; i >= 0; i--) {
      const sp = this.specials[i];
      this._drawSpecial(sp, dt);
      if (sp.t >= sp.dur) this.specials.splice(i, 1);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.r += r.vr; r.life -= r.decay;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, r.life); ctx.strokeStyle = r.color;
      ctx.lineWidth = r.w * r.life; ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.r), 0, 7); ctx.stroke(); ctx.restore();
    }

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i]; s.life -= s.decay;
      if (s.life <= 0) { this.slashes.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, s.life);
      ctx.strokeStyle = s.color; ctx.lineWidth = s.w * s.life; ctx.lineCap = "round";
      ctx.shadowColor = s.color; ctx.shadowBlur = 22;
      ctx.beginPath();
      if (s.jag) {
        let cx = s.x, cy = s.y; ctx.moveTo(cx, cy);
        for (let k = 1; k <= 8; k++) { cy += s.len / 8; cx = s.x + Math.sin(k * 1.7) * 18; ctx.lineTo(cx, cy); }
      } else {
        ctx.moveTo(s.x - Math.cos(s.ang) * s.len, s.y - Math.sin(s.ang) * s.len);
        ctx.lineTo(s.x + Math.cos(s.ang) * s.len, s.y + Math.sin(s.ang) * s.len);
      }
      ctx.stroke(); ctx.restore();
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]; b.life -= b.decay;
      if (b.life <= 0) { this.beams.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, b.life); ctx.strokeStyle = b.color;
      ctx.lineWidth = 3 + (b.w || 8) * b.life; ctx.shadowColor = b.color; ctx.shadowBlur = 24; ctx.lineCap = "round";
      const L = Math.max(innerWidth, innerHeight);
      ctx.beginPath(); ctx.moveTo(b.x - Math.cos(b.ang) * L, b.y - Math.sin(b.ang) * L);
      ctx.lineTo(b.x + Math.cos(b.ang) * L, b.y + Math.sin(b.ang) * L); ctx.stroke(); ctx.restore();
    }

    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      if (p.sink) {  // black-hole pull
        p.vx += (p.sink.x - p.x) * p.sink.pull * 0.1;
        p.vy += (p.sink.y - p.y) * p.sink.pull * 0.1;
        if (Math.hypot(p.sink.x - p.x, p.sink.y - p.y) < 14) { P.splice(i, 1); continue; }
      }
      p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.rot += p.vr; p.life -= p.decay;
      if (p.life <= 0 || p.y > innerHeight + 40) { P.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      this._drawShape(ctx, p);
      ctx.restore();
    }

    if (!P.length && !this.rings.length && !this.slashes.length && !this.beams.length && !this.specials.length && this.guardianT <= 0) {
      cancelAnimationFrame(this.raf); this.raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  _drawShape(ctx, p) {
    const s = p.size;
    switch (p.shape) {
      case "coin":
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#8a5f10"; ctx.font = `700 ${s}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("JC", 0, 1); break;
      case "shard":
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.5, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.5, 0); ctx.closePath(); ctx.fill(); break;
      case "flame":
        ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.quadraticCurveTo(s, 0, 0, s); ctx.quadraticCurveTo(-s, 0, 0, -s * 1.3); ctx.fill(); break;
      case "confetti":
        ctx.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7); break;
      case "bubble":
        ctx.globalAlpha *= 0.7; ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill();
        ctx.globalAlpha *= 0.7; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, 7); ctx.fill(); break;
      case "shuriken":
        ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = (k / 4) * 7; ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); ctx.lineTo(Math.cos(a + 0.4) * s * 0.3, Math.sin(a + 0.4) * s * 0.3); } ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, 7); ctx.fill(); break;
      case "star": {
        ctx.beginPath(); for (let k = 0; k < 5; k++) { const a1 = (k * 2 * Math.PI) / 5 - Math.PI / 2, a2 = a1 + Math.PI / 5; ctx.lineTo(Math.cos(a1) * s, Math.sin(a1) * s); ctx.lineTo(Math.cos(a2) * s * 0.45, Math.sin(a2) * s * 0.45); } ctx.closePath(); ctx.fill(); break;
      }
      case "heart":
        ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.bezierCurveTo(s, -s * 0.6, s * 0.5, -s, 0, -s * 0.3); ctx.bezierCurveTo(-s * 0.5, -s, -s, -s * 0.6, 0, s * 0.3); ctx.fill(); break;
      case "skull":
        ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill(); ctx.fillStyle = "#0a2010";
        ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.1, s * 0.22, 0, 7); ctx.arc(s * 0.35, -s * 0.1, s * 0.22, 0, 7); ctx.fill();
        ctx.fillRect(-s * 0.1, s * 0.3, s * 0.2, s * 0.4); break;
      case "glyph":
        ctx.font = `700 ${s * 2.2}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.glyph, 0, 0); break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, 7); ctx.fill();
    }
  }
}
