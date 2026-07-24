/* ============================================================
   camera.js — live webcam feed
   ------------------------------------------------------------
   Optional front-camera video shown in a floating "LIVE" window
   so you can watch yourself clap. Runs as its own video-only
   stream, independent of the mic clap-detection stream.
   ============================================================ */

export class Camera {
  constructor() {
    this.stream = null;
    this.videoEl = null;
    this.on = false;
    this.supported = typeof navigator !== "undefined" &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async start(videoEl) {
    if (this.on) return;
    if (!this.supported) throw new Error("no-camera");
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.videoEl = videoEl;
    videoEl.srcObject = this.stream;
    // Some browsers need an explicit play() after srcObject is set.
    try { await videoEl.play(); } catch { /* autoplay policies */ }
    this.on = true;
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.videoEl) this.videoEl.srcObject = null;
    this.stream = null;
    this.on = false;
  }
}
