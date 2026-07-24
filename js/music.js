/* ============================================================
   music.js — procedural lobby music (no external files)
   ------------------------------------------------------------
   A self-contained synth-wave loop built with the Web Audio API:
   pulsing bass, arpeggiated pad, soft kick + hats. Fully
   royalty-free because it's generated on the fly.
   ============================================================ */

export class LobbyMusic {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.playing = false;
    this.timer = null;
    this.step = 0;
    this.bpm = 96;
    // A minor-ish vibe: root A2. Scale notes (midi) for arps.
    this.bassSeq = [45, 45, 52, 48]; // A2 A2 E3 C3 (per bar)
    this.arp = [69, 72, 76, 79, 76, 72]; // A4 C5 E5 G5 ...
  }

  _mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  async start() {
    if (this.playing) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);
    // gentle fade-in
    this.master.gain.linearRampToValueAtTime(0.22, this.ctx.currentTime + 1.4);

    // A little reverb-ish feel via a lowpass on a send
    this.playing = true;
    this.step = 0;
    const stepMs = (60 / this.bpm) * 1000 / 2; // eighth notes
    this.timer = setInterval(() => this._tick(), stepMs);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.5);
    }
    const ctx = this.ctx;
    setTimeout(() => { try { ctx && ctx.close(); } catch {} }, 700);
    this.ctx = this.master = null;
  }

  toggle() { this.playing ? this.stop() : this.start(); return this.playing; }

  // Slightly brighten/energize the loop (used entering a match, optional)
  setIntensity(_) { /* reserved */ }

  _tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.step;

    // Kick on every quarter (steps 0,2,4,6..)
    if (s % 2 === 0) this._kick(t);
    // Hat on off-beats
    if (s % 2 === 1) this._hat(t, 0.12);
    else this._hat(t, 0.05);

    // Bass note changes each bar quarter
    if (s % 4 === 0) {
      const bassNote = this.bassSeq[(Math.floor(s / 4)) % this.bassSeq.length];
      this._bass(t, this._mtof(bassNote));
    }

    // Arp on eighths
    const arpNote = this.arp[s % this.arp.length];
    this._pluck(t, this._mtof(arpNote), 0.06);

    // Wide pad swell at bar start
    if (s % 8 === 0) this._pad(t, this._mtof(this.bassSeq[(Math.floor(s / 8)) % this.bassSeq.length] + 12));

    this.step = (this.step + 1) % 32;
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.13);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.26);
  }

  _hat(t, amp) {
    const bufSize = this.ctx.sampleRate * 0.05;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const g = this.ctx.createGain(); g.gain.value = amp;
    src.connect(hp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.05);
  }

  _bass(t, freq) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = freq;
    f.type = "lowpass"; f.frequency.value = 480; f.Q.value = 6;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.52);
  }

  _pluck(t, freq, amp) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.24);
  }

  _pad(t, freq) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0, t + 1.8);
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1600;
    [0, 7, 12].forEach((semi) => {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq * Math.pow(2, semi / 12);
      o.detune.value = (Math.random() * 8 - 4);
      o.connect(f);
      o.start(t); o.stop(t + 1.9);
    });
    f.connect(g).connect(this.master);
  }
}
