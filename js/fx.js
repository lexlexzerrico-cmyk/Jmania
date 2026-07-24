/* ============================================================
   fx.js — canvas particle engine + aura definitions
   ------------------------------------------------------------
   One full-screen canvas renders every effect (clap bursts, coin
   rain, guardian flashes) from a pooled particle system — far
   cheaper than the old DOM-span approach. The loop only runs
   while particles are alive.
   ============================================================ */

export const AURAS = [
  { id: "none",    name: "No Aura",        price: 0,    tier: "free",
    desc: "Clean, honest claps.", colors: ["#b8a8ff", "#ffffff"], shape: "spark", sfx: "clap" },
  { id: "ember",   name: "Ember",          price: 400,  tier: "jc",
    desc: "Every clap spits fire. Crackles on hit.", colors: ["#ff6a3d", "#ffb03a", "#ff2d2d"], shape: "flame", sfx: "fire" },
  { id: "frost",   name: "Frostbite",      price: 400,  tier: "jc",
    desc: "Ice shards + a crystal chime.", colors: ["#9fe8ff", "#7fb0ff", "#ffffff"], shape: "shard", sfx: "ice" },
  { id: "thunder", name: "Thunderlord",    price: 800,  tier: "jc",
    desc: "Bolts fly and the screen flashes.", colors: ["#ffe75a", "#fff8c4", "#7fb0ff"], shape: "bolt", sfx: "zap", screenFlash: "rgba(255,240,140,0.10)" },
  { id: "toxic",   name: "Toxic Cloud",    price: 800,  tier: "jc",
    desc: "Acid bubbles pop with every hit.", colors: ["#a6ff3a", "#3ee08a", "#22c8b0"], shape: "bubble", sfx: "bubble" },
  { id: "blood",   name: "Blood Moon",     price: 1200, tier: "jc",
    desc: "Crimson slashes. Ominous hum.", colors: ["#ff2d4d", "#8f1030", "#ff7a8a"], shape: "slash", sfx: "boom" },
  { id: "golden",  name: "Golden Touch",   price: 2000, tier: "jc",
    desc: "Coins spray out — hear the ding.", colors: ["#ffd05a", "#ffe79a", "#b8871a"], shape: "coin", sfx: "coin" },
  { id: "rainbow", name: "Prism Storm",    price: 3500, tier: "jc",
    desc: "Full-spectrum hue-cycling chaos.", colors: null, shape: "spark", sfx: "sparkle", hueCycle: true },
  { id: "void",    name: "Void Walker",    price: 5000, tier: "jc",
    desc: "Dark implosions with a deep boom.", colors: ["#b14dff", "#3a1060", "#000000"], shape: "void", sfx: "boom", screenFlash: "rgba(80,20,140,0.12)" },
  { id: "galaxy",  name: "Galaxy",         price: 2500, tier: "premium",
    desc: "Premium only — a swirl of stars.", colors: ["#9fe8ff", "#c7b8ff", "#ff9fdc", "#ffffff"], shape: "star", sfx: "sparkle" },
  { id: "dev",     name: "Developer Aura", price: 0,    tier: "admin",
    desc: "Matrix rain. Admin exclusive.", colors: ["#3ee08a", "#a6ff3a", "#0a3"], shape: "glyph", sfx: "sparkle" },
  { id: "susanoo", name: "Spectral Guardian", price: 0, tier: "admin",
    desc: "A colossal spirit warrior flares behind you on big combos. Admin exclusive.",
    colors: ["#7fb0ff", "#b14dff", "#22e0d6"], shape: "spark", sfx: "boom", guardian: true },
];

export function auraById(id) { return AURAS.find((a) => a.id === id) || AURAS[0]; }

const GLYPHS = "アカサタナハマヤラワ0123456789JC";

export class FxEngine {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:65;";
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.parts = [];
    this.guardianT = 0;   // >0 while the guardian flash is alive
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

  /** Clap burst at (x,y) using the aura's config. */
  burst(x, y, aura, strength = 1, combo = 0) {
    if (this.reduced) return;
    const n = Math.min(26, 8 + Math.round(strength * 8) + Math.round(combo / 4));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5 * (0.7 + strength * 0.5);
      const hue = aura.hueCycle ? (performance.now() / 4 + i * 30) % 360 : 0;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        life: 1, decay: 0.02 + Math.random() * 0.02,
        size: 3 + Math.random() * 5,
        color: aura.hueCycle ? `hsl(${hue},95%,65%)` : aura.colors[i % aura.colors.length],
        shape: aura.shape,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3,
        glyph: aura.shape === "glyph" ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : null,
        grav: aura.shape === "bubble" ? -0.06 : 0.12,
      });
    }
    if (aura.screenFlash) this._flash(aura.screenFlash);
    if (aura.guardian && combo > 0 && combo % 15 === 0) this.guardianFlash();
    this._wake();
  }

  /** Rain of JC coins (rewards, admin drop). */
  coinRain(count = 40) {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
        vx: (Math.random() - 0.5) * 1.2, vy: 2 + Math.random() * 3,
        life: 1, decay: 0.004 + Math.random() * 0.004,
        size: 8 + Math.random() * 7,
        color: "#ffd05a", shape: "coin",
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.2,
        grav: 0.05,
      });
    }
    this._wake();
  }

  /** Big translucent spirit-warrior silhouette flash (Spectral Guardian). */
  guardianFlash() {
    if (this.reduced) return;
    this.guardianT = 1;
    this._wake();
  }

  _flash(color) {
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:64;background:${color};transition:opacity .25s;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "0"; });
    setTimeout(() => el.remove(), 280);
  }

  _drawGuardian(t) {
    // Original spirit-warrior silhouette: horned helm, broad shoulders,
    // a raised blade — drawn as translucent layered strokes.
    const ctx = this.ctx;
    const cx = innerWidth / 2, base = innerHeight * 0.85;
    const s = Math.min(innerWidth, innerHeight) * 0.55;
    const alpha = t < 0.7 ? t / 0.7 * 0.5 : (1 - t) * 1.6 * 0.5;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const g = ctx.createLinearGradient(cx, base - s * 1.4, cx, base);
    g.addColorStop(0, "#7fb0ff"); g.addColorStop(0.5, "#b14dff"); g.addColorStop(1, "rgba(34,224,214,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    // torso + shoulders
    ctx.moveTo(cx - s * 0.42, base);
    ctx.lineTo(cx - s * 0.5, base - s * 0.62);
    ctx.lineTo(cx - s * 0.3, base - s * 0.78);
    // left horn
    ctx.lineTo(cx - s * 0.22, base - s * 1.06);
    ctx.lineTo(cx - s * 0.1, base - s * 0.84);
    // head peak
    ctx.lineTo(cx, base - s * 0.95);
    // right horn
    ctx.lineTo(cx + s * 0.1, base - s * 0.84);
    ctx.lineTo(cx + s * 0.22, base - s * 1.06);
    ctx.lineTo(cx + s * 0.3, base - s * 0.78);
    ctx.lineTo(cx + s * 0.5, base - s * 0.62);
    ctx.lineTo(cx + s * 0.42, base);
    ctx.closePath();
    ctx.fill();
    // raised blade
    ctx.strokeStyle = "#cfe4ff";
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.5, base - s * 0.6);
    ctx.lineTo(cx + s * 0.78, base - s * 1.25);
    ctx.stroke();
    // glowing eyes
    ctx.fillStyle = "#22e0d6";
    ctx.beginPath(); ctx.arc(cx - s * 0.07, base - s * 0.8, s * 0.02, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.07, base - s * 0.8, s * 0.02, 0, 7); ctx.fill();
    ctx.restore();
  }

  _loop() {
    this.raf = requestAnimationFrame(() => this._loop());
    const ctx = this.ctx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    if (this.guardianT > 0) {
      this._drawGuardian(1 - this.guardianT);
      this.guardianT -= 0.016;
    }

    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.grav;
      p.rot += p.vr; p.life -= p.decay;
      if (p.life <= 0 || p.y > innerHeight + 30) { parts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case "coin":
          ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.8, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "#8a5f10";
          ctx.font = `700 ${p.size}px Arial`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("JC", 0, 1);
          break;
        case "bolt":
          ctx.beginPath();
          ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.4, -p.size * 0.2);
          ctx.lineTo(0.5, 0); ctx.lineTo(p.size * 0.2, p.size);
          ctx.lineTo(-p.size * 0.4, p.size * 0.1); ctx.lineTo(0, -p.size * 0.1);
          ctx.closePath(); ctx.fill();
          break;
        case "shard":
          ctx.beginPath();
          ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.5, 0);
          ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.5, 0);
          ctx.closePath(); ctx.fill();
          break;
        case "bubble":
          ctx.globalAlpha *= 0.7;
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.fill();
          ctx.globalAlpha *= 0.6; ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(-p.size * 0.3, -p.size * 0.3, p.size * 0.3, 0, 7); ctx.fill();
          break;
        case "flame":
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 1.3); ctx.quadraticCurveTo(p.size, 0, 0, p.size);
          ctx.quadraticCurveTo(-p.size, 0, 0, -p.size * 1.3);
          ctx.fill();
          break;
        case "slash":
          ctx.fillRect(-p.size, -p.size * 0.15, p.size * 2, p.size * 0.3);
          break;
        case "star": {
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            const a1 = (k * 2 * Math.PI) / 5 - Math.PI / 2;
            const a2 = a1 + Math.PI / 5;
            ctx.lineTo(Math.cos(a1) * p.size, Math.sin(a1) * p.size);
            ctx.lineTo(Math.cos(a2) * p.size * 0.45, Math.sin(a2) * p.size * 0.45);
          }
          ctx.closePath(); ctx.fill();
          break;
        }
        case "void":
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 7); ctx.fill();
          ctx.fillStyle = "#000"; ctx.globalAlpha *= 0.8;
          ctx.beginPath(); ctx.arc(0, 0, p.size * 0.55, 0, 7); ctx.fill();
          break;
        case "glyph":
          ctx.font = `700 ${p.size * 2.4}px monospace`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(p.glyph, 0, 0);
          break;
        default: // spark
          ctx.beginPath(); ctx.arc(0, 0, p.size * 0.6, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    // Sleep when idle — zero cost while nothing animates.
    if (!parts.length && this.guardianT <= 0) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }
}
