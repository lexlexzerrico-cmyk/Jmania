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
    this.refractoryMs = 90;    // min gap between counted claps
    this.armed = true;         // must fall below floor before next onset
    this.sensitivity = 0.5;    // 0..1 (higher = easier to trigger)

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
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
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

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const { rms, hfRatio } = this._frameEnergy();

    // Smoothed level for UI meters
    this.level += (Math.min(1, rms * 6) - this.level) * 0.3;
    this.dispatchEvent(new CustomEvent("level", { detail: { level: this.level, rms } }));

    // Adaptive noise floor tracks quiet background, rises slowly, falls slowly.
    if (rms < this.noiseFloor * 1.5) {
      this.noiseFloor += (rms - this.noiseFloor) * 0.05;
    }
    this.noiseFloor = Math.max(0.0015, this.noiseFloor);

    // Threshold scales with sensitivity: high sens => lower multiplier.
    const mult = 3.6 - this.sensitivity * 2.2;          // 3.6 .. 1.4
    const absFloor = 0.02 - this.sensitivity * 0.014;   // 0.02 .. 0.006
    const threshold = Math.max(absFloor, this.noiseFloor * mult);

    const isTransient = rms > threshold && hfRatio > 0.28;

    if (isTransient && this.armed && now - this.lastClapAt > this.refractoryMs) {
      this.lastClapAt = now;
      this.armed = false;
      const strength = Math.min(1, rms / (threshold * 2));
      this.dispatchEvent(new CustomEvent("clap", { detail: { t: now, strength } }));
    }

    // Re-arm once signal drops back near the floor.
    if (rms < threshold * 0.6) this.armed = true;

    this.raf = requestAnimationFrame(() => this._loop());
  }
}
