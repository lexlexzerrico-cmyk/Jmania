// Camera rep counter using MediaPipe Pose (files bundled in ../rep-tally/mediapipe).
const MP = new URL("../../rep-tally/mediapipe/", import.meta.url).href;
const BONES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

let lib = null, fileset = null;
async function loadLandmarker(cpu) {
  if (!lib) {
    try { lib = await import(MP + "vision_bundle.mjs"); }
    catch (e) { throw new Error("Tracking library didn’t load (" + (e.message || e) + ")"); }
  }
  fileset = fileset || await lib.FilesetResolver.forVisionTasks(MP + "wasm");
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: MP + "pose_landmarker_lite.task", delegate }, runningMode: "VIDEO", numPoses: 1 });
  if (!cpu) { try { return { lm: await lib.PoseLandmarker.createFromOptions(fileset, opts("GPU")), gpu: true }; } catch (e) { console.warn("GPU failed, using CPU", e); } }
  return { lm: await lib.PoseLandmarker.createFromOptions(fileset, opts("CPU")), gpu: false };
}

const timeout = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(what + " took too long")), ms))]);

export function createTracker({ video, canvas, stage, onRep, onPhase, onMeter, onStatus, accent }) {
  const ctx = canvas.getContext("2d");
  let mode = "push", state = "up", smooth = null, facing = "user";
  let lm = null, gpu = false, stream = null, running = false, lastVT = -1, lastTs = 0, switching = false;

  const pt = (l, i) => ({ x: l[i].x * canvas.width, y: l[i].y * canvas.height, v: l[i].visibility ?? 1 });
  function angle(a, b, c) {
    const ab = Math.atan2(a.y - b.y, a.x - b.x), cb = Math.atan2(c.y - b.y, c.x - b.x);
    const d = Math.abs((ab - cb) * 180 / Math.PI); return d > 180 ? 360 - d : d;
  }
  const tilt = (a, b) => Math.atan2(Math.abs(a.y - b.y), Math.abs(a.x - b.x)) * 180 / Math.PI;
  function side(l) {
    const vis = (ids) => ids.reduce((s, i) => s + (l[i].visibility ?? 0), 0);
    return vis([11, 13, 15, 23, 25]) >= vis([12, 14, 16, 24, 26]) ? { sh: 11, el: 13, wr: 15, hip: 23, kn: 25 } : { sh: 12, el: 14, wr: 16, hip: 24, kn: 26 };
  }

  function update(l) {
    const s = side(l), sh = pt(l, s.sh), el = pt(l, s.el), wr = pt(l, s.wr), hip = pt(l, s.hip);
    const need = mode === "push" ? [sh, el, wr, hip] : [sh, hip];
    if (need.some((p) => p.v < 0.5)) { onPhase("Can’t see you · step back"); onMeter(0); return; }
    if (mode === "push") {
      const e = angle(sh, el, wr); smooth = smooth == null ? e : smooth * 0.5 + e * 0.5;
      onMeter((160 - smooth) / 75);
      if (tilt(sh, hip) >= 50) { onPhase("Get into plank"); return; }
      if (state === "up" && smooth < 95) { state = "down"; onPhase("Push!"); }
      else if (state === "down" && smooth > 150) { state = "up"; onRep(); onPhase("Down"); }
      else if (state === "up") onPhase("Down");
    } else {
      const t = tilt(sh, hip); smooth = smooth == null ? t : smooth * 0.5 + t * 0.5;
      onMeter((smooth - 20) / 50);
      if (state === "up" && smooth < 30) { state = "down"; onPhase("Up!"); }
      else if (state === "down" && smooth > 65) { state = "up"; onRep(); onPhase("Lie back"); }
      else if (state === "up") onPhase("Lie back");
    }
  }

  function draw(l) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!l) return;
    ctx.lineWidth = Math.max(3, canvas.width / 150); ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,255,255,.85)";
    for (const [a, b] of BONES) {
      if ((l[a].visibility ?? 1) < 0.4 || (l[b].visibility ?? 1) < 0.4) continue;
      ctx.beginPath(); ctx.moveTo(l[a].x * canvas.width, l[a].y * canvas.height); ctx.lineTo(l[b].x * canvas.width, l[b].y * canvas.height); ctx.stroke();
    }
    const s = side(l), key = mode === "push" ? [s.sh, s.el, s.wr] : [s.sh, s.hip, s.kn];
    ctx.fillStyle = accent();
    for (const i of key) { ctx.beginPath(); ctx.arc(l[i].x * canvas.width, l[i].y * canvas.height, ctx.lineWidth * 2.3, 0, Math.PI * 2); ctx.fill(); }
  }

  async function openCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; await video.play();
    stage.classList.toggle("mirror", facing === "user");
  }

  async function loop() {
    if (!running) return;
    try {
      if (!switching && video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVT) {
        if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
        lastVT = video.currentTime;
        const ts = Math.max(performance.now(), lastTs + 1); lastTs = ts;
        const res = lm.detectForVideo(video, ts), l = res.landmarks && res.landmarks[0];
        draw(l);
        if (l) update(l); else { onPhase("Step into frame"); onMeter(0); }
      }
    } catch (e) {
      console.error(e);
      if (gpu && !switching) {
        switching = true; onPhase("Switching tracking mode…");
        try { lm.close(); } catch (_) {}
        try { ({ lm, gpu } = await loadLandmarker(true)); } catch (e2) { fail(e2); return; }
        switching = false;
      } else if (!switching) { fail(e); return; }
    }
    requestAnimationFrame(loop);
  }
  function fail(e) { stop(); try { lm?.close(); } catch (_) {} lm = null; onStatus({ error: "Body tracking stopped: " + (e.message || e) }); }

  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("This browser won’t allow the camera here. Open the https:// link in Safari or Chrome.");
    onStatus({ msg: "Opening camera…" });
    try { await openCamera(); }
    catch (e) { throw new Error(e.name === "NotAllowedError" ? "Camera blocked. Allow camera access for this site in your browser settings, then try again." : "Couldn’t open the camera: " + (e.message || e)); }
    if (!lm) { onStatus({ msg: "Loading body tracking (about 15 MB the first time)…" }); ({ lm, gpu } = await timeout(loadLandmarker(false), 90000, "Loading body tracking")); }
    running = true; reset(); onStatus({ live: true }); loop();
  }
  function stop() { running = false; if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  function reset() { state = "up"; smooth = null; }
  async function flip() { facing = facing === "user" ? "environment" : "user"; if (running) await openCamera(); }

  return { start, stop, reset, flip, setMode(m) { mode = m; reset(); }, get running() { return running; } };
}
