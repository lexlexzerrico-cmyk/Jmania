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
    let k = effect.kind;
    const n = 12 + Math.round(strength * 10) + Math.round(combo / 4);

    // Heavy full-screen ultimates (blackhole/galaxy/chakra/bankai/domain) are
    // throttled so rapid clapping doesn't spawn one per clap. Between ultimates
    // a light themed spark burst plays instead, so every clap still reacts.
    const HEAVY = { blackhole: 1, galaxy: 1, chakra: 1, bankai: 1, domain: 1 };
    if (HEAVY[k]) {
      const now = performance.now();
      if (!this._specialCd) this._specialCd = {};
      const cd = k === "bankai" ? 650 : 1050;
      if (now - (this._specialCd[k] || 0) < cd) {
        k = "spark";                       // fall through to a light burst
      } else {
        this._specialCd[k] = now;
      }
    }

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
  // Full-screen tinted vignette used to darken the arena behind an ultimate.
  _screenVignette(fade, inner, outer) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = outer; ctx.fillRect(0, 0, innerWidth, innerHeight);
    const g = ctx.createRadialGradient(innerWidth / 2, innerHeight / 2, 0, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * 0.7);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.restore();
  }

  // ===================== SUSANOO — spectral demon + warrior =====================
  _drawGuardian(t) {  // t: 0→1 across the whole animation
    const ctx = this.ctx;
    const W = innerWidth, H = innerHeight;
    const cx = W / 2, base = H * 0.98;
    const s = Math.min(W, H) * 0.7;
    // phases: 0-.2 rise, .2-.6 loom, .6-.72 SWING, .72-1 fade
    const fade = t < 0.2 ? t / 0.2 : t > 0.78 ? (1 - t) / 0.22 : 1;
    const a = Math.max(0, fade);

    // 1) Darken the whole arena to a purple void
    this._screenVignette(a * 0.82, "rgba(28,10,52,0.4)", "rgba(6,2,16,0.96)");

    // 2) Colossal spectral FACE looming in the upper screen (glowing eyes + grin)
    const fy = H * 0.34;
    const grin = Math.min(1, Math.max(0, (t - 0.15) / 0.4)); // grin widens as it looms
    ctx.save();
    ctx.globalAlpha = a;
    // hazy purple face haze (drawn as vertical energy streaks)
    ctx.strokeStyle = "rgba(120,70,190,0.10)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + Math.sin(i * 1.3 + t * 6) * 30, H * 0.7); ctx.stroke();
    }
    // eyes (two big glowing crescents)
    const eyeR = s * 0.19, eyeGap = s * 0.42, eyeGlow = 0.7 + Math.sin(t * 30) * 0.3;
    for (const dir of [-1, 1]) {
      const ex = cx + dir * eyeGap, ey = fy;
      const gg = ctx.createRadialGradient(ex, ey, 2, ex, ey, eyeR * 1.6);
      gg.addColorStop(0, `rgba(240,250,255,${eyeGlow})`); gg.addColorStop(0.5, "rgba(180,210,255,0.35)"); gg.addColorStop(1, "rgba(140,120,255,0)");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.ellipse(ex, ey, eyeR, eyeR * 0.62, dir * 0.25, 0, 7); ctx.fill();
      // slit pupil
      ctx.fillStyle = "rgba(20,6,40,0.9)";
      ctx.beginPath(); ctx.ellipse(ex, ey, eyeR * 0.14, eyeR * 0.5, dir * 0.25, 0, 7); ctx.fill();
    }
    // wide glowing grin
    const gy = fy + s * 0.42, gw = s * (0.28 + grin * 0.34);
    const gm = ctx.createLinearGradient(cx - gw, gy, cx + gw, gy);
    gm.addColorStop(0, "rgba(180,210,255,0)"); gm.addColorStop(0.5, `rgba(230,245,255,${0.85 * grin})`); gm.addColorStop(1, "rgba(180,210,255,0)");
    ctx.strokeStyle = gm; ctx.lineWidth = s * 0.03; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx - gw, gy - s * 0.05); ctx.quadraticCurveTo(cx, gy + s * 0.16, cx + gw, gy - s * 0.05); ctx.stroke();
    // teeth notches
    ctx.strokeStyle = `rgba(20,6,40,${0.7 * grin})`; ctx.lineWidth = 3;
    for (let i = 1; i < 7; i++) { const fx = cx - gw + (i / 7) * gw * 2; const off = Math.sin((i / 7) * Math.PI) * s * 0.12; ctx.beginPath(); ctx.moveTo(fx, gy - s * 0.02); ctx.lineTo(fx, gy + off * 0.6); ctx.stroke(); }
    ctx.restore();

    // 3) Armored warrior silhouette at the bottom, with a rising blade swing
    let swordA = -1.2;
    if (t >= 0.6 && t < 0.72) swordA = -1.2 + ((t - 0.6) / 0.12) * 2.2;
    else if (t >= 0.72) swordA = 1.0;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, base);
    // aura
    const glow = ctx.createRadialGradient(0, -s * 0.5, s * 0.05, 0, -s * 0.5, s * 0.9);
    glow.addColorStop(0, "rgba(150,120,255,0.4)"); glow.addColorStop(1, "rgba(150,120,255,0)");
    ctx.fillStyle = glow; ctx.fillRect(-s, -s * 1.4, s * 2, s * 1.5);
    const bodyG = ctx.createLinearGradient(0, -s * 1.2, 0, 0);
    bodyG.addColorStop(0, "#a9c4ff"); bodyG.addColorStop(0.5, "#7b3dff"); bodyG.addColorStop(1, "rgba(34,224,214,0.03)");
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, 0); ctx.lineTo(-s * 0.48, -s * 0.5);
    ctx.lineTo(-s * 0.3, -s * 0.66); ctx.lineTo(-s * 0.36, -s * 0.86);
    ctx.lineTo(-s * 0.18, -s * 0.74); ctx.lineTo(-s * 0.22, -s * 1.02);
    ctx.lineTo(-s * 0.08, -s * 0.84); ctx.lineTo(0, -s * 0.96);
    ctx.lineTo(s * 0.08, -s * 0.84); ctx.lineTo(s * 0.22, -s * 1.02);
    ctx.lineTo(s * 0.18, -s * 0.74); ctx.lineTo(s * 0.36, -s * 0.86);
    ctx.lineTo(s * 0.3, -s * 0.66); ctx.lineTo(s * 0.48, -s * 0.5);
    ctx.lineTo(s * 0.4, 0); ctx.closePath(); ctx.fill();
    // armor lines
    ctx.strokeStyle = "rgba(220,235,255,0.45)"; ctx.lineWidth = s * 0.01;
    ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.46); ctx.lineTo(0, -s * 0.36); ctx.lineTo(s * 0.26, -s * 0.46); ctx.stroke();
    // sword
    ctx.save(); ctx.translate(s * 0.4, -s * 0.55); ctx.rotate(swordA);
    ctx.strokeStyle = "rgba(210,230,255,0.9)"; ctx.lineWidth = s * 0.04; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.2, 0); ctx.stroke();
    const blade = ctx.createLinearGradient(s * 0.2, 0, s * 1.05, 0);
    blade.addColorStop(0, "#eaf6ff"); blade.addColorStop(1, "rgba(150,120,255,0.1)");
    ctx.fillStyle = blade;
    ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.03); ctx.lineTo(s * 1.05, -s * 0.008); ctx.lineTo(s * 1.1, 0); ctx.lineTo(s * 1.05, s * 0.008); ctx.lineTo(s * 0.2, s * 0.03); ctx.closePath(); ctx.fill();
    ctx.restore();
    // swing trail
    if (t >= 0.6 && t < 0.82) {
      const pp = (t - 0.6) / 0.22;
      ctx.strokeStyle = `rgba(200,220,255,${0.6 * (1 - pp)})`; ctx.lineWidth = s * 0.06;
      ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.55, s * 0.95, -1.2, -1.2 + 2.2 * Math.min(1, pp * 1.3)); ctx.stroke();
    }
    ctx.restore();

    // rising spirit embers
    if (Math.random() < 0.7) this._spawn(cx + rnd(-s * 0.6, s * 0.6), base - rnd(0, s * 0.5), {
      vx: rnd(-0.6, 0.6), vy: rnd(-4.5, -2), size: rnd(4, 9) * SCALE * 0.7,
      color: ["#a9c4ff", "#b14dff", "#22e0d6"][Math.floor(rnd(0, 3))], shape: "flame", grav: -0.05, decay: 0.028,
    });
    // screen-wide flash at the swing
    if (t >= 0.6 && t < 0.66) this._screenVignette((0.66 - t) / 0.06 * 0.25, "rgba(230,240,255,0.5)", "rgba(230,240,255,0)");
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
      // ===================== NINE-TAILS — fox spirit + chakra aura =====================
      const W = innerWidth, H = innerHeight;
      const cx = W / 2, cy = H * 0.6;
      const s = Math.min(W, H) * (0.34 + p * 0.06);
      // 1) Darken arena + orange chakra glow
      this._screenVignette(fade * 0.55, "rgba(60,26,6,0.5)", "rgba(10,4,0,0.9)");
      ctx.save(); ctx.globalAlpha = fade;
      const aura = ctx.createRadialGradient(cx, cy, s * 0.2, cx, cy, s * 2.2);
      aura.addColorStop(0, "rgba(255,200,80,0.55)"); aura.addColorStop(0.5, "rgba(255,110,40,0.3)"); aura.addColorStop(1, "rgba(255,60,20,0)");
      ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(cx, cy, s * 2.2, 0, 7); ctx.fill();

      const bodyGrad = ctx.createLinearGradient(cx, cy - s, cx, cy + s);
      bodyGrad.addColorStop(0, "#ffcf5a"); bodyGrad.addColorStop(0.5, "#ff8a2d"); bodyGrad.addColorStop(1, "#e0521a");

      // 2) Nine whipping tails fanning up and out behind the fox
      ctx.strokeStyle = bodyGrad; ctx.lineCap = "round";
      for (let i = 0; i < 9; i++) {
        const spread = (i - 4) / 4;                 // -1..1
        const baseA = -Math.PI / 2 + spread * 1.15; // fan upward
        const wave = Math.sin(sp.t * 6 + i * 0.8) * 0.22;
        const L = s * (1.5 + Math.abs(spread) * 0.5);
        const ox = cx + spread * s * 0.15, oy = cy - s * 0.2;
        ctx.lineWidth = s * (0.13 - Math.abs(spread) * 0.03);
        ctx.beginPath(); ctx.moveTo(ox, oy);
        ctx.quadraticCurveTo(
          ox + Math.cos(baseA + wave) * L * 0.55, oy + Math.sin(baseA + wave) * L * 0.55,
          ox + Math.cos(baseA + wave * 2) * L, oy + Math.sin(baseA + wave * 2) * L
        );
        ctx.stroke();
        // white tail tips
        ctx.save(); ctx.strokeStyle = "rgba(255,245,220,0.9)"; ctx.lineWidth = s * 0.05;
        const tx = ox + Math.cos(baseA + wave * 2) * L, ty = oy + Math.sin(baseA + wave * 2) * L;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - Math.cos(baseA) * s * 0.12, ty - Math.sin(baseA) * s * 0.12); ctx.stroke();
        ctx.restore();
      }

      // 3) Fox body — hunched, four legs, head with ears + snout
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.75, cy + s * 0.5);            // back haunch
      ctx.quadraticCurveTo(cx - s * 0.9, cy - s * 0.15, cx - s * 0.45, cy - s * 0.25);
      ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.35, cx + s * 0.35, cy - s * 0.2);  // back
      ctx.lineTo(cx + s * 0.8, cy - s * 0.05);            // toward head/shoulder
      ctx.quadraticCurveTo(cx + s * 0.55, cy + s * 0.35, cx + s * 0.3, cy + s * 0.5);  // front leg
      ctx.lineTo(cx - s * 0.75, cy + s * 0.5); ctx.closePath(); ctx.fill();
      // head
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.6, cy - s * 0.1);
      ctx.lineTo(cx + s * 0.72, cy - s * 0.5);            // left ear
      ctx.lineTo(cx + s * 0.86, cy - s * 0.2);
      ctx.lineTo(cx + s * 1.0, cy - s * 0.46);            // right ear
      ctx.lineTo(cx + s * 1.08, cy - s * 0.05);
      ctx.quadraticCurveTo(cx + s * 1.25, cy + s * 0.02, cx + s * 1.2, cy + s * 0.12); // snout
      ctx.lineTo(cx + s * 1.0, cy + s * 0.14);
      ctx.quadraticCurveTo(cx + s * 0.75, cy + s * 0.2, cx + s * 0.6, cy - s * 0.1);
      ctx.closePath(); ctx.fill();
      // glowing eye + inner ears
      const eg = 0.7 + Math.sin(sp.t * 20) * 0.3;
      ctx.fillStyle = `rgba(255,60,40,${eg})`;
      ctx.beginPath(); ctx.ellipse(cx + s * 0.92, cy - s * 0.06, s * 0.05, s * 0.03, -0.3, 0, 7); ctx.fill();
      ctx.restore();

      // fire embers rising
      if (Math.random() < 0.8) this._spawn(cx + rnd(-s, s), cy + rnd(-s * 0.3, s * 0.5), {
        vx: rnd(-1, 1), vy: rnd(-5, -2), size: rnd(4, 9) * SCALE * 0.7,
        color: ["#ffcf5a", "#ff8a2d", "#ff5b2d"][Math.floor(rnd(0, 3))], shape: "flame", grav: -0.06, decay: 0.03,
      });
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
      // ===================== DOMAIN EXPANSION — inverted dome + runes =====================
      const W = innerWidth, H = innerHeight;
      const cx = W / 2, cy = H / 2;
      const maxR = Math.hypot(W, H) * 0.6;
      const R = Math.min(maxR, p * maxR * 1.4);   // dome expands to fill the screen
      // 1) Inverted void — flood the whole screen dark violet
      this._screenVignette(fade * 0.9, "rgba(46,14,80,0.55)", "rgba(6,2,14,0.98)");
      ctx.save(); ctx.globalAlpha = fade;

      // 2) Expanding energy dome (radial shell)
      const dome = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
      dome.addColorStop(0, "rgba(120,60,200,0)"); dome.addColorStop(0.85, "rgba(150,90,255,0.18)"); dome.addColorStop(1, "rgba(232,216,255,0.55)");
      ctx.fillStyle = dome; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(232,216,255,0.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

      // 3) Inward-collapsing energy lines
      ctx.strokeStyle = "rgba(200,170,255,0.35)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + sp.t * 0.4;
        const r1 = R, r2 = R * (0.4 + (Math.sin(sp.t * 3 + i) * 0.1 + 0.1));
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
      }

      // 4) Three counter-rotating rune rings
      const rings = [{ r: 0.62, dir: 1, n: 16 }, { r: 0.44, dir: -1, n: 12 }, { r: 0.26, dir: 1, n: 8 }];
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const ring of rings) {
        const rr = R * ring.r;
        ctx.strokeStyle = "rgba(232,216,255,0.35)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.stroke();
        ctx.fillStyle = "rgba(232,216,255,0.9)";
        ctx.font = `700 ${Math.max(11, R * 0.03)}px monospace`;
        for (let i = 0; i < ring.n; i++) {
          const a = ring.dir * sp.t * 0.8 + (i / ring.n) * Math.PI * 2;
          ctx.save(); ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.rotate(a + Math.PI / 2);
          ctx.fillText(GLYPHS[(i * 3 + ring.n) % GLYPHS.length], 0, 0); ctx.restore();
        }
      }

      // 5) Central sigil — a pulsing many-pointed star
      const sig = R * 0.12 * (1 + Math.sin(sp.t * 8) * 0.12);
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + sp.t * 0.6;
        const rr = i % 2 ? sig : sig * 0.45;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
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
