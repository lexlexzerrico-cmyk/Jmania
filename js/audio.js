/* ============================================================
   audio.js — AI-powered acoustic clap detector
   ------------------------------------------------------------
   Real-time onset detection over the microphone stream.
   A clap is a sharp broadband transient: a sudden jump in
   high-frequency energy above an adaptive noise floor, gated
   by a refractory period so a single clap counts once.
   ============================================================ */

export class ClapEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this.source = null;
    this.raf = null;
    this.running = false;

    // Detection state
    this.timeBuf = null;
    this.freqBuf = null;
    this.noiseFloor = 0.004;   // adaptive background energy
    this.lastClapAt = 0;
    this.refractoryMs = 55;    // min gap between counted claps (≈18 cps ceiling)
    this._prevRms = 0;         // previous frame energy (for rising-edge detection)
    this.sensitivity = 0.65;   // 0..1 (higher = easier to trigger)

    this.level = 0;            // smoothed level for meters (0..1)
    this.supported = typeof navigator !== "undefined" &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  setSensitivity(v) { this.sensitivity = Math.max(0, Math.min(1, v)); }

  async start() {
    if (this.running) return;
    if (!this.supported) throw new Error("no-mic");

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.0;
    this.source.connect(this.analyser);

    this.timeBuf = new Float32Array(this.analyser.fftSize);
    this.freqBuf = new Uint8Array(this.analyser.frequencyBinCount);

    this.running = true;
    this.noiseFloor = 0.004;
    // Browsers suspend AudioContexts on tab switches — resume automatically.
    this._visHandler = () => {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", this._visHandler);
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this._visHandler) { document.removeEventListener("visibilitychange", this._visHandler); this._visHandler = null; }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = this.analyser = this.stream = this.source = null;
  }

  // Compute energy of the current frame, weighted toward high frequencies
  // (claps are bright/broadband; low rumble is ignored).
  _frameEnergy() {
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const s = this.timeBuf[i];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / this.timeBuf.length);

    // High-frequency content ratio via freq bins
    this.analyser.getByteFrequencyData(this.freqBuf);
    const n = this.freqBuf.length;
    let hi = 0, lo = 0;
    const split = Math.floor(n * 0.35);
    for (let i = 0; i < n; i++) {
      if (i >= split) hi += this.freqBuf[i]; else lo += this.freqBuf[i];
    }
    const hfRatio = hi / (hi + lo + 1); // 0..1, high for claps/transients

    return { rms, hfRatio };
  }

  // Decide whether this frame is a clap ONSET. Returns clap strength (>0) or 0.
  // Onset = a sharp RISE in energy above the adaptive threshold — NOT merely
  // "loud". Detecting the rising edge (energy flux) is what lets rapid claps
  // each count: the old detector had to fall near-silent to re-arm, so fast
  // clapping (which keeps the room loud between claps) got mostly dropped.
  _detect(rms, hfRatio, now) {
    // Adaptive noise floor tracks quiet background (only adapts while quiet).
    if (rms < this.noiseFloor * 1.6) this.noiseFloor += (rms - this.noiseFloor) * 0.08;
    this.noiseFloor = Math.max(0.0012, this.noiseFloor);

    // Threshold scales with sensitivity: high sens => lower multiplier.
    const mult = 3.2 - this.sensitivity * 2.0;          // 3.2 .. 1.2
    const absFloor = 0.016 - this.sensitivity * 0.012;  // 0.016 .. 0.004
    const threshold = Math.max(absFloor, this.noiseFloor * mult);

    // Rising edge: how much louder this frame is than the last.
    const flux = rms - this._prevRms;
    this._prevRms = rms;
    const fluxNeed = Math.max(0.0018, threshold * (0.5 - this.sensitivity * 0.28));

    const isOnset = rms > threshold && flux > fluxNeed && hfRatio > 0.20;
    if (isOnset && now - this.lastClapAt > this.refractoryMs) {
      this.lastClapAt = now;
      return Math.min(1, rms / (threshold * 2));
    }
    return 0;
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const { rms, hfRatio } = this._frameEnergy();

    // Smoothed level for UI meters
    this.level += (Math.min(1, rms * 6) - this.level) * 0.3;
    this.dispatchEvent(new CustomEvent("level", { detail: { level: this.level, rms } }));

    const strength = this._detect(rms, hfRatio, now);
    if (strength) this.dispatchEvent(new CustomEvent("clap", { detail: { t: now, strength } }));

    this.raf = requestAnimationFrame(() => this._loop());
  }
}
