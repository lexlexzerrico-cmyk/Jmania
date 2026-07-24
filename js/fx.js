/* ============================================================
   fx.js — canvas effect engine + clap-effect catalog
   ------------------------------------------------------------
   One full-screen canvas renders every clap effect: particle
   bursts, katana/laser slashes, shockwave rings, coin rain and
   the spectral guardian. Pooled + sleeps when idle for perf.
   Each catalog entry has a distinct `kind` the engine renders.
   ============================================================ */

export const EFFECTS = [
  { id: "none",     name: "Classic",          price: 0,    rarity: "free",      kind: "spark",   sfx: "clap",    colors: ["#b8a8ff", "#ffffff"],            desc: "Clean purple sparks." },
  { id: "katana",   name: "Katana",           price: 600,  rarity: "rare",      kind: "katana",  sfx: "slash",   colors: ["#ffffff", "#22e0d6", "#a8f0ff"], desc: "A blade-slash arc cuts the screen. SHING." },
  { id: "ember",    name: "Inferno Fist",     price: 500,  rarity: "rare",      kind: "fireball",sfx: "fire",    colors: ["#ff6a3d", "#ffb03a", "#ff2d2d"], desc: "Fireballs erupt with a roaring whoosh." },
  { id: "frost",    name: "Frostbite",        price: 500,  rarity: "rare",      kind: "frost",   sfx: "ice",     colors: ["#9fe8ff", "#7fb0ff", "#ffffff"], desc: "Ice shards + a crystal shatter chime." },
  { id: "thunder",  name: "Thunderlord",      price: 900,  rarity: "epic",      kind: "thunder", sfx: "zap",     colors: ["#ffe75a", "#fff8c4", "#7fb0ff"], desc: "A bolt strikes from the sky. Screen flash.", screenFlash: "rgba(255,240,140,0.14)" },
  { id: "shuriken", name: "Shuriken Storm",   price: 700,  rarity: "epic",      kind: "shuriken",sfx: "throw",   colors: ["#cfe4ff", "#8fa8c8", "#ffffff"], desc: "Spinning stars fly out on every clap." },
  { id: "gun",      name: "Hand Cannon",      price: 800,  rarity: "epic",      kind: "gun",     sfx: "bang",    colors: ["#ffd05a", "#ff9f3a", "#fff"],    desc: "Muzzle flash + a sharp BANG." },
  { id: "bomb",     name: "Demolition",       price: 1000, rarity: "epic",      kind: "bomb",    sfx: "boom",    colors: ["#ff6a3d", "#ffd05a", "#555"],    desc: "Shockwave rings blow outward.", screenFlash: "rgba(255,120,40,0.10)" },
  { id: "coin",     name: "Golden Touch",     price: 1500, rarity: "legendary", kind: "coin",    sfx: "coin",    colors: ["#ffd05a", "#ffe79a", "#b8871a"], desc: "Coins spray out. Cha-ching." },
  { id: "confetti", name: "Party Mode",       price: 600,  rarity: "rare",      kind: "confetti",sfx: "pop",     colors: ["#ff3d7f", "#22e0d6", "#ffd05a", "#a6ff3a"], desc: "Confetti explosion + party pop." },
  { id: "bubble",   name: "Tidal",            price: 500,  rarity: "rare",      kind: "bubble",  sfx: "splash",  colors: ["#22e0d6", "#7fb0ff", "#ffffff"], desc: "Water bubbles + a splash ring." },
  { id: "laser",    name: "Laser Grid",       price: 900,  rarity: "epic",      kind: "laser",   sfx: "laser",   colors: ["#ff2d6f", "#ff8fbf", "#ffffff"], desc: "Twin laser beams sweep across." },
  { id: "poison",   name: "Toxic",            price: 700,  rarity: "epic",      kind: "poison",  sfx: "hiss",    colors: ["#a6ff3a", "#3ee08a", "#22c8b0"], desc: "Acid skull cloud bubbles up." },
  { id: "heart",    name: "Heartbreaker",     price: 600,  rarity: "rare",      kind: "heart",   sfx: "twinkle", colors: ["#ff3d7f", "#ff8fbf", "#ffffff"], desc: "Hearts float up with a twinkle." },
  { id: "void",     name: "Void Walker",      price: 2500, rarity: "legendary", kind: "void",    sfx: "vboom",   colors: ["#b14dff", "#3a1060", "#000000"], desc: "Dark implosion with a deep boom.", screenFlash: "rgba(80,20,140,0.13)" },
  { id: "rainbow",  name: "Prism Storm",      price: 3000, rarity: "legendary", kind: "rainbow", sfx: "sparkle", colors: null, hueCycle: true,          desc: "Full-spectrum hue-cycling chaos." },
  { id: "galaxy",   name: "Galaxy",           price: 2000, rarity: "premium",   kind: "star",    sfx: "sparkle", colors: ["#9fe8ff", "#c7b8ff", "#ff9fdc", "#ffffff"], desc: "Premium — a swirl of stars." },
  { id: "dev",      name: "Developer",        price: 0,    rarity: "admin",     kind: "glyph",   sfx: "sparkle", colors: ["#3ee08a", "#a6ff3a", "#0a3"],    desc: "Matrix glyph rain. Admin only." },
  { id: "susanoo",  name: "Spectral Guardian",price: 0,    rarity: "admin",     kind: "spark",   sfx: "vboom",   colors: ["#7fb0ff", "#b14dff", "#22e0d6"], guardian: true, desc: "A colossal spirit warrior flares on big combos. Admin only." },
];

export function effectById(id) { return EFFECTS.find((e) => e.id === id) || EFFECTS[0]; }
export const RARITY_COLOR = {
  free: "#8a90a0", rare: "#4d9cff", epic: "#b14dff",
  legendary: "#ffd05a", premium: "#ff3d9f", admin: "#3ee08a",
};

const GLYPHS = "アカサタナハマヤラ0123456789JC";
const rnd = (a, b) => a + Math.random() * (b - a);

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
    this.guardianT = 0;
    this.raf = null;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = innerWidth * dpr;
      this.canvas.height = innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    this._resize();
    addEventListener("resize", this._resize);
  }

  _wake() { if (!this.raf) this._loop(); }
  _col(e, i) { return e.hueCycle ? `hsl(${(performance.now() / 3 + i * 40) % 360},95%,65%)` : e.colors[i % e.colors.length]; }

  _spawn(x, y, opt) {
    this.parts.push(Object.assign({
      x, y, vx: 0, vy: 0, life: 1, decay: 0.025, size: 4,
      color: "#fff", shape: "spark", rot: 0, vr: 0, grav: 0.12, glyph: null,
    }, opt));
  }

  /** Main clap effect dispatch. */
  burst(x, y, effect, strength = 1, combo = 0) {
    if (this.reduced) { this._wake(); return; }
    const k = effect.kind;
    const n = 10 + Math.round(strength * 8) + Math.round(combo / 5);

    switch (k) {
      case "katana":
        this.slashes.push({ x, y, ang: rnd(-0.9, -0.4), len: rnd(150, 240), life: 1, decay: 0.08, w: 9, color: effect.colors[1] });
        for (let i = 0; i < 8; i++) this._spawn(x, y, { vx: rnd(-4, 4), vy: rnd(-5, 1), size: rnd(2, 4), color: this._col(effect, i), decay: 0.05, grav: 0.05 });
        break;
      case "laser":
        this.beams.push({ x, y, ang: rnd(-0.3, 0.3), life: 1, decay: 0.09, color: effect.colors[0] });
        this.beams.push({ x, y, ang: rnd(1.3, 1.9), life: 1, decay: 0.09, color: effect.colors[1] });
        break;
      case "fireball":
        this.rings.push({ x, y, r: 6, vr: 5, life: 1, decay: 0.06, color: effect.colors[0], w: 5 });
        for (let i = 0; i < n; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(1, 5), vy: Math.sin(a) * rnd(1, 4) - 3, size: rnd(4, 9), color: this._col(effect, i), shape: "flame", grav: -0.04, decay: 0.03 }); }
        break;
      case "frost":
        this.rings.push({ x, y, r: 4, vr: 4, life: 1, decay: 0.07, color: effect.colors[0], w: 3 });
        for (let i = 0; i < n; i++) { const a = (i / n) * 7; this._spawn(x, y, { vx: Math.cos(a) * rnd(2, 6), vy: Math.sin(a) * rnd(2, 6), size: rnd(3, 7), color: this._col(effect, i), shape: "shard", rot: a, grav: 0.02, decay: 0.035 }); }
        break;
      case "thunder": {
        this.slashes.push({ x, y: 0, ang: Math.PI / 2 + rnd(-0.1, 0.1), len: y, life: 1, decay: 0.12, w: 6, color: effect.colors[0], jag: true });
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-5, 5), vy: rnd(-6, 2), size: rnd(2, 5), color: this._col(effect, i), decay: 0.05 });
        break;
      }
      case "shuriken":
        for (let i = 0; i < 5; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(4, 8), vy: Math.sin(a) * rnd(4, 8), size: rnd(6, 10), color: effect.colors[0], shape: "shuriken", vr: rnd(0.4, 0.8), grav: 0.02, decay: 0.02 }); }
        break;
      case "gun":
        this.rings.push({ x, y, r: 3, vr: 7, life: 1, decay: 0.14, color: effect.colors[0], w: 8 });
        for (let i = 0; i < 6; i++) this._spawn(x, y, { vx: rnd(-3, 3), vy: rnd(-4, -1), size: rnd(3, 6), color: "#888", shape: "spark", grav: 0.03, decay: 0.04 });
        break;
      case "bomb":
        this.rings.push({ x, y, r: 4, vr: 9, life: 1, decay: 0.05, color: effect.colors[0], w: 6 });
        this.rings.push({ x, y, r: 2, vr: 5, life: 1, decay: 0.06, color: effect.colors[1], w: 3 });
        for (let i = 0; i < n + 6; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(2, 8), vy: Math.sin(a) * rnd(2, 8) - 2, size: rnd(2, 5), color: this._col(effect, i), grav: 0.15, decay: 0.03 }); }
        break;
      case "coin":
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-4, 4), vy: rnd(-9, -4), size: rnd(7, 12), color: "#ffd05a", shape: "coin", vr: rnd(-0.2, 0.2), grav: 0.35, decay: 0.012 });
        break;
      case "confetti":
        for (let i = 0; i < n + 6; i++) this._spawn(x, y, { vx: rnd(-6, 6), vy: rnd(-10, -3), size: rnd(4, 8), color: this._col(effect, i), shape: "confetti", rot: rnd(0, 7), vr: rnd(-0.3, 0.3), grav: 0.25, decay: 0.015 });
        break;
      case "bubble":
        this.rings.push({ x, y, r: 3, vr: 4, life: 1, decay: 0.07, color: effect.colors[0], w: 3 });
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-3, 3), vy: rnd(-5, -1), size: rnd(4, 9), color: this._col(effect, i), shape: "bubble", grav: -0.06, decay: 0.025 });
        break;
      case "poison":
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-2.5, 2.5), vy: rnd(-4, -1), size: rnd(5, 10), color: this._col(effect, i), shape: "skull", grav: -0.03, decay: 0.02 });
        break;
      case "heart":
        for (let i = 0; i < n; i++) this._spawn(x, y, { vx: rnd(-2.5, 2.5), vy: rnd(-5, -2), size: rnd(6, 11), color: this._col(effect, i), shape: "heart", grav: 0.02, decay: 0.02 });
        break;
      case "void":
        this.rings.push({ x, y, r: 40, vr: -3, life: 1, decay: 0.05, color: effect.colors[0], w: 5 });
        for (let i = 0; i < n; i++) { const a = rnd(0, 7), d = rnd(30, 55); this._spawn(x + Math.cos(a) * d, y + Math.sin(a) * d, { vx: -Math.cos(a) * 4, vy: -Math.sin(a) * 4, size: rnd(3, 7), color: this._col(effect, i), shape: "void", grav: 0, decay: 0.04 }); }
        break;
      case "star":
        for (let i = 0; i < n; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(1, 5), vy: Math.sin(a) * rnd(1, 5), size: rnd(4, 9), color: this._col(effect, i), shape: "star", vr: rnd(-0.2, 0.2), grav: 0, decay: 0.02 }); }
        break;
      case "glyph":
        for (let i = 0; i < n; i++) this._spawn(x + rnd(-30, 30), y - 20, { vx: 0, vy: rnd(2, 5), size: rnd(5, 9), color: this._col(effect, i), shape: "glyph", grav: 0.05, decay: 0.02, glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)] });
        break;
      default:
        for (let i = 0; i < n; i++) { const a = rnd(0, 7); this._spawn(x, y, { vx: Math.cos(a) * rnd(2, 6), vy: Math.sin(a) * rnd(2, 6) - 2, size: rnd(3, 6), color: this._col(effect, i), grav: 0.12, decay: 0.03 }); }
    }
    if (effect.screenFlash) this._flash(effect.screenFlash);
    if (effect.guardian && combo > 0 && combo % 15 === 0) this.guardianFlash();
    this._wake();
  }

  coinRain(count = 40) {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) this._spawn(rnd(0, innerWidth), -20 - Math.random() * innerHeight * 0.4, { vx: rnd(-1, 1), vy: rnd(2, 5), size: rnd(8, 15), color: "#ffd05a", shape: "coin", vr: rnd(-0.2, 0.2), grav: 0.05, decay: 0.004 });
    this._wake();
  }

  guardianFlash() { if (!this.reduced) { this.guardianT = 1; this._wake(); } }

  _flash(color) {
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:64;background:${color};transition:opacity .25s;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "0"; });
    setTimeout(() => el.remove(), 280);
  }

  _drawGuardian(t) {
    const ctx = this.ctx;
    const cx = innerWidth / 2, base = innerHeight * 0.88;
    const s = Math.min(innerWidth, innerHeight) * 0.55;
    const alpha = (t < 0.7 ? t / 0.7 : (1 - t) * 3.3) * 0.5;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const g = ctx.createLinearGradient(cx, base - s * 1.4, cx, base);
    g.addColorStop(0, "#7fb0ff"); g.addColorStop(0.5, "#b14dff"); g.addColorStop(1, "rgba(34,224,214,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.42, base); ctx.lineTo(cx - s * 0.5, base - s * 0.62);
    ctx.lineTo(cx - s * 0.3, base - s * 0.78); ctx.lineTo(cx - s * 0.22, base - s * 1.06);
    ctx.lineTo(cx - s * 0.1, base - s * 0.84); ctx.lineTo(cx, base - s * 0.95);
    ctx.lineTo(cx + s * 0.1, base - s * 0.84); ctx.lineTo(cx + s * 0.22, base - s * 1.06);
    ctx.lineTo(cx + s * 0.3, base - s * 0.78); ctx.lineTo(cx + s * 0.5, base - s * 0.62);
    ctx.lineTo(cx + s * 0.42, base); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#cfe4ff"; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(cx + s * 0.5, base - s * 0.6); ctx.lineTo(cx + s * 0.8, base - s * 1.3); ctx.stroke();
    ctx.fillStyle = "#22e0d6";
    ctx.beginPath(); ctx.arc(cx - s * 0.07, base - s * 0.8, s * 0.022, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.07, base - s * 0.8, s * 0.022, 0, 7); ctx.fill();
    ctx.restore();
  }

  _loop() {
    this.raf = requestAnimationFrame(() => this._loop());
    const ctx = this.ctx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    if (this.guardianT > 0) { this._drawGuardian(1 - this.guardianT); this.guardianT -= 0.016; }

    // Rings (shockwaves)
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.r += r.vr; r.life -= r.decay;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, r.life); ctx.strokeStyle = r.color;
      ctx.lineWidth = r.w * r.life; ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.r), 0, 7); ctx.stroke(); ctx.restore();
    }

    // Slashes (katana / lightning)
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i]; s.life -= s.decay;
      if (s.life <= 0) { this.slashes.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, s.life);
      ctx.strokeStyle = s.color; ctx.lineWidth = s.w * s.life; ctx.lineCap = "round";
      ctx.shadowColor = s.color; ctx.shadowBlur = 16;
      ctx.beginPath();
      if (s.jag) {
        let cx = s.x, cy = s.y; ctx.moveTo(cx, cy);
        const steps = 8;
        for (let k = 1; k <= steps; k++) { cy += s.len / steps; cx = s.x + Math.sin(k * 1.7) * 14; ctx.lineTo(cx, cy); }
      } else {
        const ex = s.x + Math.cos(s.ang) * s.len, ey = s.y + Math.sin(s.ang) * s.len;
        const bx = s.x - Math.cos(s.ang) * s.len, by = s.y - Math.sin(s.ang) * s.len;
        ctx.moveTo(bx, by); ctx.lineTo(ex, ey);
      }
      ctx.stroke(); ctx.restore();
    }

    // Beams (laser)
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]; b.life -= b.decay;
      if (b.life <= 0) { this.beams.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, b.life); ctx.strokeStyle = b.color;
      ctx.lineWidth = 3 + 6 * b.life; ctx.shadowColor = b.color; ctx.shadowBlur = 20; ctx.lineCap = "round";
      const L = Math.max(innerWidth, innerHeight);
      ctx.beginPath(); ctx.moveTo(b.x - Math.cos(b.ang) * L, b.y - Math.sin(b.ang) * L);
      ctx.lineTo(b.x + Math.cos(b.ang) * L, b.y + Math.sin(b.ang) * L); ctx.stroke(); ctx.restore();
    }

    // Particles
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.rot += p.vr; p.life -= p.decay;
      if (p.life <= 0 || p.y > innerHeight + 40) { P.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      this._drawShape(ctx, p);
      ctx.restore();
    }

    if (!P.length && !this.rings.length && !this.slashes.length && !this.beams.length && this.guardianT <= 0) {
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
      case "void":
        ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill(); ctx.fillStyle = "#000"; ctx.globalAlpha *= 0.85; ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, 7); ctx.fill(); break;
      case "glyph":
        ctx.font = `700 ${s * 2.2}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.glyph, 0, 0); break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, 7); ctx.fill();
    }
  }
}
