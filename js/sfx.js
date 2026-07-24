/* ============================================================
   sfx.js — procedural sound effects (Web Audio, no files)
   ------------------------------------------------------------
   Short synthesized cues for claps, countdown, knockout, win,
   loss, level-up and UI clicks. Shares one lazily-created
   AudioContext and respects an on/off flag.
   ============================================================ */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }

  setEnabled(v) { this.enabled = !!v; }

  _ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  _tone(freq, t0, dur, { type = "sine", gain = 0.3, glideTo = null, delay = 0 } = {}) {
    const ctx = this.ctx;
    const t = t0 + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(t0, dur, { gain = 0.3, hp = 1500 } = {}) {
    const ctx = this.ctx;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // A crisp clap; brightens slightly with combo for feedback.
  clap(combo = 0) {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const bright = 1400 + Math.min(20, combo) * 90;
    this._noise(t, 0.06, { gain: 0.22, hp: bright });
    this._tone(180, t, 0.05, { type: "triangle", gain: 0.12, glideTo: 90 });
  }

  countdownBeep() {
    const ctx = this._ensure(); if (!ctx) return;
    this._tone(660, ctx.currentTime, 0.14, { type: "square", gain: 0.28 });
  }

  go() {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(880, t, 0.28, { type: "sawtooth", gain: 0.32, glideTo: 1320 });
  }

  knockout() {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(120, t, 0.6, { type: "sawtooth", gain: 0.4, glideTo: 40 });
    this._noise(t, 0.5, { gain: 0.3, hp: 400 });
  }

  win() {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone(f, t, 0.32, { type: "triangle", gain: 0.3, delay: i * 0.1 }));
  }

  lose() {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    [392, 349, 294].forEach((f, i) =>
      this._tone(f, t, 0.34, { type: "sine", gain: 0.28, delay: i * 0.12 }));
  }

  levelUp() {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    [659, 988, 1319].forEach((f, i) =>
      this._tone(f, t, 0.26, { type: "triangle", gain: 0.26, delay: i * 0.08 }));
  }

  unlock() {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(880, t, 0.18, { type: "triangle", gain: 0.24 });
    this._tone(1320, t, 0.22, { type: "triangle", gain: 0.2, delay: 0.09 });
  }

  click() {
    const ctx = this._ensure(); if (!ctx) return;
    this._tone(520, ctx.currentTime, 0.05, { type: "square", gain: 0.12 });
  }
}
