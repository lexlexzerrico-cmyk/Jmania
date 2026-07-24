/* ============================================================
   main.js — app controller: router, input, match lifecycle
   ============================================================ */
import { loadProfile, saveProfile, applyMatchResult, resetProfile } from "./storage.js";
import { rankFromIndex, levelProgress } from "./ranks.js";
import { ClapEngine } from "./audio.js";
import { Camera } from "./camera.js";
import { LobbyMusic } from "./music.js";
import { Sfx } from "./sfx.js";
import { Match, makeBot } from "./game.js";
import { checkAchievements } from "./achievements.js";
import {
  $, $$, toast, renderHud, renderLobby, renderRanks, renderCustomSetup,
  renderMicPanel, renderArena, renderResults, renderAchievements, renderSettings,
  initParticles, clapBurst,
} from "./ui.js";

const app = $("#app");

const state = {
  profile: loadProfile(),
  clap: new ClapEngine(),
  camera: new Camera(),
  music: new LobbyMusic(),
  sfx: new Sfx(),
  match: null,
  inputMode: "mic",     // "mic" | "keyboard"
  micReady: false,
  pending: null,        // pending match config while on mic panel
  keyHandler: null,
};

// Apply saved sensitivity + sfx preference
state.clap.setSensitivity(state.profile.settings.sensitivity);
state.sfx.setEnabled(state.profile.settings.sfxOn);

// ---------------------------------------------------------------------------
// HUD + navigation
// ---------------------------------------------------------------------------
function refreshHud() {
  $("#profile-hud").innerHTML = renderHud(state.profile);
}

function navTo(screen) {
  // leaving arena? make sure match stops
  if (state.match) { state.match.abort(); state.match = null; }
  if (state.inputMode === "mic" && state.micReady) { state.clap.stop(); state.micReady = false; }
  detachKeyboard();

  switch (screen) {
    case "lobby":        app.innerHTML = renderLobby(state.profile); break;
    case "ranks":        app.innerHTML = renderRanks(state.profile); break;
    case "custom":       app.innerHTML = renderCustomSetup(); wireCustomSetup(); break;
    case "achievements": app.innerHTML = renderAchievements(state.profile); break;
    case "settings":     app.innerHTML = renderSettings(state.profile); wireSettings(); break;
    default:             app.innerHTML = renderLobby(state.profile);
  }
  refreshHud();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Delegated clicks for data-nav and data-play
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { state.sfx.click(); navTo(nav.dataset.nav); return; }
  const play = e.target.closest("[data-play]");
  if (play) { state.sfx.click(); startMode(play.dataset.play); return; }
});

// ---------------------------------------------------------------------------
// Mode configs
// ---------------------------------------------------------------------------
function buildConfig(mode, opts = {}) {
  const rankIdx = state.profile.rankIndex;
  switch (mode) {
    case "ranked":
      return { mode, label: "RANKED", duration: 30, ranked: true, bot: makeBot(rankIdx) };
    case "classic":
      return { mode, label: "CLASSIC", duration: 30, ranked: false, bot: null };
    case "practice":
      return { mode, label: "PRACTICE", duration: 0, ranked: false, bot: null, endless: true };
    case "duel":
      return { mode, label: "DUEL · 1v1", duration: 25, ranked: true, bot: makeBot(rankIdx) };
    case "custom": {
      const bot = opts.foe === "bot" ? { name: "AI Rival", skill: opts.skill } : null;
      return { mode, label: "CUSTOM", duration: opts.duration, ranked: false, bot };
    }
    default:
      return { mode: "classic", label: "CLASSIC", duration: 30, ranked: false, bot: null };
  }
}

function startMode(mode) {
  if (mode === "custom") { navTo("custom"); return; }
  state.pending = buildConfig(mode);
  showMicPanel();
}

function wireCustomSetup() {
  let dur = 30, foe = "none", skill = 5;
  const durRow = $("#dur-row"), foeRow = $("#foe-row");
  const skillField = $("#skill-field"), skillRange = $("#skill-range"), skillRead = $("#skill-read");
  const syncFoe = () => { skillField.style.display = foe === "bot" ? "" : "none"; };
  syncFoe();

  durRow.addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    $$(".chip", durRow).forEach((x) => x.classList.remove("active"));
    c.classList.add("active"); dur = +c.dataset.dur;
  });
  foeRow.addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    $$(".chip", foeRow).forEach((x) => x.classList.remove("active"));
    c.classList.add("active"); foe = c.dataset.foe; syncFoe();
  });
  skillRange.addEventListener("input", () => {
    skill = +skillRange.value; skillRead.textContent = skill.toFixed(1) + " CPS";
  });
  $("#custom-start").addEventListener("click", () => {
    state.pending = buildConfig("custom", { duration: dur, foe, skill });
    showMicPanel();
  });
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------
function wireSettings() {
  const st = state.profile.settings;

  $("#name-input").addEventListener("input", (e) => {
    state.profile.name = e.target.value.trim().slice(0, 18) || "Player";
    saveProfile(state.profile);
  });

  const sens = $("#set-sens");
  sens.addEventListener("input", () => {
    const v = +sens.value;
    st.sensitivity = v;
    state.clap.setSensitivity(v);
    $("#set-sens-read").textContent = Math.round(v * 100) + "%";
    saveProfile(state.profile);
  });

  $("#set-music").addEventListener("click", async (e) => {
    const on = !st.musicOn;
    st.musicOn = on; saveProfile(state.profile);
    e.currentTarget.classList.toggle("on", on);
    if (on) { await state.music.start().catch(() => {}); } else { state.music.stop(); }
    musicBtn.classList.toggle("playing", state.music.playing);
  });

  $("#set-sfx").addEventListener("click", (e) => {
    const on = !st.sfxOn;
    st.sfxOn = on; state.sfx.setEnabled(on); saveProfile(state.profile);
    e.currentTarget.classList.toggle("on", on);
    if (on) state.sfx.click();
  });

  $("#set-cam").addEventListener("click", (e) => {
    setCam(!state.camera.on);
    // reflect after the async toggle settles
    setTimeout(() => e.currentTarget.classList.toggle("on", state.camera.on), 200);
  });

  $("#reset-btn").addEventListener("click", () => {
    if (!confirm("Reset ALL progress — rank, level, stats, achievements and history? This can't be undone.")) return;
    state.profile = resetProfile();
    state.clap.setSensitivity(state.profile.settings.sensitivity);
    state.sfx.setEnabled(state.profile.settings.sfxOn);
    toast("Progress reset — fresh start!", "🧼");
    navTo("lobby");
  });
}

// ---------------------------------------------------------------------------
// Mic panel / calibration
// ---------------------------------------------------------------------------
function showMicPanel() {
  const cfg = state.pending;
  app.innerHTML = renderMicPanel(cfg.label, state.profile.settings.sensitivity, state.clap.supported);
  refreshHud();
  window.scrollTo({ top: 0, behavior: "smooth" });

  const sens = $("#sens-range");
  const fill = $("#mic-level-fill");
  const note = $("#mic-note");

  sens.addEventListener("input", () => {
    const v = +sens.value;
    state.clap.setSensitivity(v);
    state.profile.settings.sensitivity = v;
    saveProfile(state.profile);
  });

  const onLevel = (e) => { if (fill) fill.style.width = `${Math.min(100, e.detail.level * 100)}%`; };
  const onTestClap = () => { if (note) { note.textContent = "👏 Clap detected — looking good!"; note.style.color = "var(--good)"; } };

  $("#mic-enable").addEventListener("click", async () => {
    try {
      await state.clap.start();
      state.micReady = true;
      state.inputMode = "mic";
      state.clap.addEventListener("level", onLevel);
      state.clap.addEventListener("clap", onTestClap, { once: false });
      $("#mic-enable").textContent = "✓ Mic live — starting…";
      setTimeout(() => beginMatch(), 900);
    } catch (err) {
      toast("Mic unavailable — switching to keyboard mode", "⌨️");
      state.inputMode = "keyboard";
      beginMatch();
    }
  });

  $("#mic-keyboard").addEventListener("click", () => {
    state.inputMode = "keyboard";
    beginMatch();
  });

  const camPanelBtn = $("#mic-cam");
  camPanelBtn.addEventListener("click", () => setCam(!state.camera.on));
  syncMicPanelCamBtn();
}

// ---------------------------------------------------------------------------
// Keyboard / tap input
// ---------------------------------------------------------------------------
function attachKeyboard() {
  detachKeyboard();
  const handler = (e) => {
    if (e.type === "keydown") {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); doClap(1); }
    }
  };
  state.keyHandler = handler;
  window.addEventListener("keydown", handler);
  // Tap/click on the stage
  state.tapHandler = (e) => {
    if (e.target.closest("#arena-quit")) return;
    if (e.target.closest(".clap-stage") || e.target.closest(".arena")) doClap(1);
  };
  app.addEventListener("pointerdown", state.tapHandler);
}
function detachKeyboard() {
  if (state.keyHandler) window.removeEventListener("keydown", state.keyHandler);
  if (state.tapHandler) app.removeEventListener("pointerdown", state.tapHandler);
  state.keyHandler = state.tapHandler = null;
}

function doClap(strength) {
  if (state.match && state.match.running) state.match.registerClap(strength);
}

// ---------------------------------------------------------------------------
// Match lifecycle
// ---------------------------------------------------------------------------
function beginMatch() {
  const cfg = state.pending;
  app.innerHTML = renderArena(cfg, state.profile);
  refreshHud();
  window.scrollTo({ top: 0, behavior: "smooth" });

  $("#arena-quit").addEventListener("click", () => {
    state.sfx.click();
    if (cfg.endless && state.match && state.match.running) {
      // Practice: finish gracefully into the results screen.
      state.match.end();
      return;
    }
    if (state.match) state.match.abort();
    cleanupInputs();
    navTo("lobby");
  });

  // Countdown, then start
  runCountdown(() => {
    const match = new Match(cfg);
    state.match = match;

    // Wire input source
    if (state.inputMode === "mic" && state.micReady) {
      state._micClap = (e) => doClap(e.detail.strength || 1);
      state.clap.addEventListener("clap", state._micClap);
    } else {
      attachKeyboard();
    }

    wireMatchEvents(match, cfg);
    match.start();
  });
}

function runCountdown(done) {
  const overlay = document.createElement("div");
  overlay.className = "countdown";
  const hint = state.inputMode === "mic" && state.micReady
    ? "👏 Clap when it says GO"
    : "⌨️ Press SPACE or tap fast when it says GO";
  overlay.innerHTML = `<div class="cd-num">3</div><div class="cd-hint">${hint}</div>`;
  document.body.appendChild(overlay);
  const num = $(".cd-num", overlay);
  const seq = ["3", "2", "1", "GO!"];
  let i = 0;
  const step = () => {
    num.textContent = seq[i];
    num.style.animation = "none"; void num.offsetWidth; num.style.animation = "cdPop 0.9s var(--ease)";
    if (seq[i] === "GO!") state.sfx.go(); else state.sfx.countdownBeep();
    i++;
    if (i < seq.length) setTimeout(step, 750);
    else setTimeout(() => { overlay.remove(); done(); }, 650);
  };
  step();
}

const CIRC = 2 * Math.PI * 48; // timer ring circumference

function wireMatchEvents(match, cfg) {
  const scoreEl = $("#score-huge");   // solo only
  const comboEl = $("#combo-x");
  const cpsFill = $("#cps-fill");
  const cpsNow = $("#cps-now");
  const timerText = $("#timer-text");
  const timerArc = $("#timer-arc");
  const clapEmoji = $("#clap-emoji");
  // clash (1v1) elements
  const clashYou = $("#clash-you");
  const clashFoe = $("#clash-foe");
  const clashBolt = $("#clash-bolt");
  const youPct = $("#you-pct");
  const foePct = $("#foe-pct");
  const youCps = $("#you-cps");
  const foeCps = $("#foe-cps");

  match.addEventListener("clap", (e) => {
    const { score, mult, strength, combo } = e.detail;
    state.sfx.clap(combo);
    if (scoreEl) {
      scoreEl.textContent = score.toLocaleString();
      scoreEl.classList.add("bump");
      setTimeout(() => scoreEl.classList.remove("bump"), 90);
    }
    comboEl.textContent = "x" + mult.toFixed(1);
    comboEl.classList.add("bump");
    setTimeout(() => comboEl.classList.remove("bump"), 100);
    clapEmoji.classList.remove("pulse"); void clapEmoji.offsetWidth; clapEmoji.classList.add("pulse");
    clapBurst(strength);
    if (state.camera.on) {
      camWindow.classList.add("pulse");
      clearTimeout(state._camPulse);
      state._camPulse = setTimeout(() => camWindow.classList.remove("pulse"), 130);
    }
  });

  // 1v1 tug-of-war bar updates
  match.addEventListener("clash", (e) => {
    if (!clashYou) return;
    const tug = e.detail.tug;
    const you = Math.round(tug), foe = 100 - you;
    clashYou.style.width = tug + "%";
    clashFoe.style.width = (100 - tug) + "%";
    clashBolt.style.left = tug + "%";
    youPct.textContent = you; foePct.textContent = foe;
    // zap the bolt on every clap
    clashBolt.classList.remove("hit"); void clashBolt.offsetWidth; clashBolt.classList.add("hit");
  });

  match.addEventListener("tick", (e) => {
    const d = e.detail;
    timerText.textContent = Math.ceil(d.remain);
    timerArc.style.strokeDasharray = CIRC;
    timerArc.style.strokeDashoffset = CIRC * (1 - d.remainPct);

    const cpsPct = Math.min(100, (d.cps / 10) * 100);
    cpsFill.style.width = cpsPct + "%";
    cpsFill.classList.toggle("hot", d.cps >= 6);
    cpsNow.textContent = d.cps;

    if (cfg.bot && youCps) {
      youCps.textContent = d.cps;
      foeCps.textContent = d.botCps;
    }

    // Time warning flash (timed modes only)
    if (!d.endless && d.remain <= 5 && timerText.dataset.warn !== "1") {
      timerText.dataset.warn = "1";
      timerText.style.color = "var(--bad)";
    }
  });

  match.addEventListener("end", (result) => {
    cleanupInputs();
    const r = result.detail;
    if (r.knockout) {
      state.sfx.knockout();
      koFlash(r.won);
      setTimeout(() => finishMatch(r), 1050);
    } else {
      finishMatch(r);
    }
  });
}

function koFlash(won) {
  const el = document.createElement("div");
  el.className = "ko-flash";
  el.innerHTML = `<div class="ko-text">${won ? "KNOCKOUT!" : "KNOCKED OUT"}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function cleanupInputs() {
  if (state._micClap) { state.clap.removeEventListener("clap", state._micClap); state._micClap = null; }
  if (state.micReady) { state.clap.stop(); state.micReady = false; }
  detachKeyboard();
}

function finishMatch(result) {
  // Grab a victory snapshot from the live cam before the stream is touched.
  const snapshot = (state.camera.on && result.won) ? captureSnapshot() : null;

  const report = applyMatchResult(state.profile, result);

  // Evaluate achievement unlocks against the freshly-updated profile.
  const fresh = checkAchievements(state.profile, {
    profile: state.profile,
    result,
    level: report.after.level,
    rankIndex: state.profile.rankIndex,
  });
  if (fresh.length) saveProfile(state.profile);

  // Result sound
  if (result.hasOpponent && !result.knockout) {
    result.won ? state.sfx.win() : state.sfx.lose();
  } else if (!result.hasOpponent) {
    state.sfx.win();
  }

  app.innerHTML = renderResults(result, report, snapshot);
  refreshHud();
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Animate reward bars
  requestAnimationFrame(() => {
    const lp = levelProgress(state.profile.xp);
    const xpBar = $("#xp-bar");
    if (xpBar) xpBar.style.width = Math.round(lp.pct * 100) + "%";
    const rrBar = $("#rr-bar");
    if (rrBar) rrBar.style.width = state.profile.rr + "%";
  });

  if (report.leveledUp) { toast(`Level up! You're now Lv ${report.after.level}`, "⭐"); state.sfx.levelUp(); }
  if (report.rankChange === 1) toast(`Ranked up to ${report.rankAfter.label}!`, "⬆️");
  if (report.rankChange === -1) toast(`Ranked down to ${report.rankAfter.label}`, "⬇️");

  // Achievement unlock toasts (staggered so they don't overlap)
  fresh.forEach((a, i) => setTimeout(() => {
    toast(`Achievement unlocked — ${a.name}`, a.icon);
    state.sfx.unlock();
  }, 700 + i * 900));

  state.match = null;
}

function captureSnapshot() {
  try {
    const v = camVideo;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Webcam
// ---------------------------------------------------------------------------
const camBtn = $("#cam-toggle");
const camWindow = $("#cam-window");
const camVideo = $("#cam-video");

async function setCam(on) {
  if (on) {
    try {
      await state.camera.start(camVideo);
      camWindow.classList.remove("hidden");
      camBtn.classList.add("active");
      toast("Webcam on — say cheese 📸", "📷");
    } catch (err) {
      toast("Camera unavailable or blocked", "📷");
      state.profile.settings.camOn = false;
      saveProfile(state.profile);
      return;
    }
  } else {
    state.camera.stop();
    camWindow.classList.add("hidden");
    camBtn.classList.remove("active");
  }
  state.profile.settings.camOn = state.camera.on;
  saveProfile(state.profile);
  syncMicPanelCamBtn();
}

function syncMicPanelCamBtn() {
  const b = $("#mic-cam");
  if (b) b.textContent = state.camera.on ? "📷 Webcam is ON" : "📷 Turn on webcam";
}

camBtn.addEventListener("click", () => setCam(!state.camera.on));
$("#cam-close").addEventListener("click", () => setCam(false));

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------
const musicBtn = $("#music-toggle");
musicBtn.addEventListener("click", async () => {
  const on = await state.music.toggle();
  musicBtn.classList.toggle("playing", state.music.playing);
  state.profile.settings.musicOn = state.music.playing;
  saveProfile(state.profile);
  if (state.music.playing) toast("Lobby music on", "🎵");
});

// Attempt autoplay after first user interaction (browsers block autoplay)
function primeMusic(e) {
  // Ignore the dedicated music button — its own handler manages playback.
  if (e && e.target && e.target.closest && e.target.closest("#music-toggle")) return;
  if (state.profile.settings.musicOn && !state.music.playing) {
    state.music.start().then(() => musicBtn.classList.add("playing")).catch(() => {});
  }
  window.removeEventListener("pointerdown", primeMusic);
  window.removeEventListener("keydown", primeMusic);
}
window.addEventListener("pointerdown", primeMusic);
window.addEventListener("keydown", primeMusic);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
initParticles();
navTo("lobby");
refreshHud();
if (state.profile.settings.musicOn) musicBtn.classList.add("playing");

// Expose for debugging
window.JERKMANIA = state;
