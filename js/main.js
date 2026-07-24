/* ============================================================
   main.js — app controller: router, input, match lifecycle
   ============================================================ */
import { loadProfile, saveProfile, applyMatchResult, resetProfile } from "./storage.js";
import { rankFromIndex, levelProgress, MAX_RANK_INDEX } from "./ranks.js";
import { ClapEngine } from "./audio.js";
import { Camera } from "./camera.js";
import { LobbyMusic } from "./music.js";
import { Sfx } from "./sfx.js";
import { Match, makeBot } from "./game.js";
import { checkAchievements, ACHIEVEMENTS } from "./achievements.js";
import { FxEngine, AURAS, auraById } from "./fx.js";
import { BOSSES, BossFight } from "./rpg.js";
import {
  earnJc, claimDaily, claimPlaytime, dailyInfo, playtimeInfo,
  buyBoost, buyPremium, grantGems, spendJc, boostActive, BOOST_MS,
} from "./economy.js";
import {
  $, $$, toast, renderHud, renderLobby, renderRanks, renderCustomSetup,
  renderMicPanel, renderArena, renderResults, renderAchievements, renderSettings,
  renderShop, renderWorld, renderBossFight, renderBossResults, renderAdmin,
  initParticles,
} from "./ui.js";

const ADMIN_CODE = "JERKGOD";

const app = $("#app");

const state = {
  profile: loadProfile(),
  clap: new ClapEngine(),
  camera: new Camera(),
  music: new LobbyMusic(),
  sfx: new Sfx(),
  fx: new FxEngine(),
  match: null,
  bossFight: null,
  inputMode: "mic",     // "mic" | "keyboard"
  micReady: false,
  pending: null,        // pending match config while on mic panel
  keyHandler: null,
};

// Apply saved sensitivity + sfx preference + theme
state.clap.setSensitivity(state.profile.settings.sensitivity);
state.sfx.setEnabled(state.profile.settings.sfxOn);

function applyTheme(key) {
  document.documentElement.dataset.theme = key || "violet";
}
applyTheme(state.profile.settings.theme);

// ---------------------------------------------------------------------------
// HUD + navigation
// ---------------------------------------------------------------------------
function refreshHud() {
  $("#profile-hud").innerHTML = renderHud(state.profile);
}

function navTo(screen) {
  // leaving arena? make sure any fight stops
  if (state.match) { state.match.abort(); state.match = null; }
  if (state.bossFight) { state.bossFight.abort(); state.bossFight = null; }
  if (state.inputMode === "mic" && state.micReady) { state.clap.stop(); state.micReady = false; }
  detachKeyboard();

  switch (screen) {
    case "lobby":        app.innerHTML = renderLobby(state.profile); wireLobby(); break;
    case "ranks":        app.innerHTML = renderRanks(state.profile); break;
    case "custom":       app.innerHTML = renderCustomSetup(); wireCustomSetup(); break;
    case "achievements": app.innerHTML = renderAchievements(state.profile); break;
    case "settings":     app.innerHTML = renderSettings(state.profile); wireSettings(); break;
    case "shop":         app.innerHTML = renderShop(state.profile); wireShop(); break;
    case "world":        app.innerHTML = renderWorld(state.profile); break;
    case "admin":
      if (!state.profile.adminUnlocked) { navTo("lobby"); return; }
      app.innerHTML = renderAdmin(state.profile); wireAdmin(); break;
    default:             app.innerHTML = renderLobby(state.profile); wireLobby();
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
  const boss = e.target.closest("[data-boss]");
  if (boss) { state.sfx.click(); startBoss(+boss.dataset.boss); return; }
  const retry = e.target.closest("[data-boss-retry]");
  if (retry) { state.sfx.click(); startBoss(+retry.dataset.bossRetry); return; }
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

  $("#avatar-row").addEventListener("click", (e) => {
    const c = e.target.closest("[data-avatar]"); if (!c) return;
    st.avatar = c.dataset.avatar; saveProfile(state.profile);
    $$("#avatar-row .avatar-chip").forEach((x) => x.classList.remove("active"));
    c.classList.add("active"); state.sfx.click();
  });

  $("#theme-row").addEventListener("click", (e) => {
    const c = e.target.closest("[data-theme-key]"); if (!c) return;
    st.theme = c.dataset.themeKey; saveProfile(state.profile);
    applyTheme(st.theme);
    $$("#theme-row .theme-chip").forEach((x) => x.classList.remove("active"));
    c.classList.add("active"); state.sfx.click();
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

  $("#admin-access").addEventListener("click", () => {
    if (state.profile.adminUnlocked) { navTo("admin"); return; }
    const code = prompt("Developer passcode:");
    if (code && code.trim().toUpperCase() === ADMIN_CODE) {
      state.profile.adminUnlocked = true;
      saveProfile(state.profile);
      state.sfx.win();
      toast("Admin access granted 🛠️", "🔓");
      navTo("admin");
    } else if (code !== null) {
      toast("Wrong passcode", "🔒");
    }
  });
}

// ---------------------------------------------------------------------------
// Lobby wiring (reward claims)
// ---------------------------------------------------------------------------
function wireLobby() {
  const daily = $("#claim-daily");
  if (daily && !daily.disabled) daily.addEventListener("click", () => {
    const got = claimDaily(state.profile);
    if (got) {
      toast(`Daily reward — +${got} JC`, "📅");
      state.sfx.jcGain(); state.fx.coinRain(24);
      navTo("lobby");
    }
  });
  const pt = $("#claim-playtime");
  if (pt && !pt.disabled) pt.addEventListener("click", () => {
    const got = claimPlaytime(state.profile);
    if (got) {
      toast(`Playtime reward — +${got} JC`, "⏱️");
      state.sfx.jcGain(); state.fx.coinRain(24);
      navTo("lobby");
    }
  });
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------
function wireShop() {
  app.addEventListener("click", shopClick);
  function shopClick(e) {
    const buy = e.target.closest("[data-buy]");
    if (buy) {
      const aura = auraById(buy.dataset.buy);
      if (aura.tier === "premium" && !state.profile.premium) { toast("Premium required", "★"); return; }
      if (!spendJc(state.profile, aura.price)) { toast(`Not enough JC — need ${aura.price.toLocaleString()}`, "🪙"); return; }
      state.profile.ownedAuras.push(aura.id);
      state.profile.equippedAura = aura.id;
      saveProfile(state.profile);
      state.sfx.jcGain(); state.fx.coinRain(16);
      toast(`${aura.name} unlocked & equipped!`, "🎨");
      app.removeEventListener("click", shopClick);
      navTo("shop");
      return;
    }
    const equip = e.target.closest("[data-equip]");
    if (equip) {
      state.profile.equippedAura = equip.dataset.equip;
      saveProfile(state.profile);
      state.sfx.click();
      toast(`${auraById(equip.dataset.equip).name} equipped`, "🎨");
      app.removeEventListener("click", shopClick);
      navTo("shop");
      return;
    }
  }

  const boostBtn = $("#buy-boost");
  if (boostBtn) boostBtn.addEventListener("click", () => {
    if (buyBoost(state.profile)) {
      toast("2× JC boost active for 20 minutes!", "⚡");
      state.sfx.levelUp(); navTo("shop");
    } else toast("Not enough Gems — grab some with Get Gems", "💎");
  });
  const premBtn = $("#buy-premium");
  if (premBtn) premBtn.addEventListener("click", () => {
    if (buyPremium(state.profile)) {
      toast("PREMIUM activated — welcome to the club ★", "★");
      state.sfx.win(); state.fx.coinRain(40); navTo("shop");
    } else toast("Not enough Gems — grab some with Get Gems", "💎");
  });
  const gems = $("#get-gems");
  if (gems) gems.addEventListener("click", showGemModal);
}

function showGemModal() {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h3>💎 Get Gems</h3>
      <div class="modal-note">Demo store — this game has no payment backend, so packs are granted instantly and <b>no real money is ever charged</b>.</div>
      <div class="gem-pack"><span class="gp-name">💎 100 Gems</span><span class="gp-price">would be $0.99</span><button class="btn" data-pack="100">Get</button></div>
      <div class="gem-pack"><span class="gp-name">💎 550 Gems</span><span class="gp-price">would be $4.99</span><button class="btn" data-pack="550">Get</button></div>
      <div class="gem-pack"><span class="gp-name">💎 1,200 Gems</span><span class="gp-price">would be $9.99</span><button class="btn" data-pack="1200">Get</button></div>
      <div class="center mt-24"><button class="btn ghost" id="gem-close">Close</button></div>
    </div>`;
  document.body.appendChild(back);
  back.addEventListener("click", (e) => {
    if (e.target === back || e.target.closest("#gem-close")) { back.remove(); return; }
    const pack = e.target.closest("[data-pack]");
    if (pack) {
      grantGems(state.profile, +pack.dataset.pack);
      state.sfx.jcGain();
      toast(`+${(+pack.dataset.pack).toLocaleString()} Gems (demo)`, "💎");
      back.remove();
      navTo("shop");
    }
  });
}

// ---------------------------------------------------------------------------
// JerkWorld boss fights
// ---------------------------------------------------------------------------
function startBoss(index) {
  const beaten = state.profile.rpgBeaten || 0;
  if (index > beaten) { toast("Defeat the previous boss first", "🔒"); return; }
  const boss = BOSSES[index];
  if (!boss) return;
  state.pending = { mode: "boss", label: `BOSS · ${boss.name.toUpperCase()}`, boss, bossIndex: index };
  showMicPanel();
}

function beginBossFight() {
  const cfg = state.pending;
  const boss = cfg.boss;
  app.innerHTML = renderBossFight(boss, state.profile);
  refreshHud();
  window.scrollTo({ top: 0, behavior: "smooth" });

  $("#arena-quit").addEventListener("click", () => {
    state.sfx.click();
    if (state.bossFight) state.bossFight.abort();
    state.bossFight = null;
    cleanupInputs();
    navTo("world");
  });

  runCountdown(() => {
    const fight = new BossFight(boss, { dmgMult: state.profile.godClap ? 10 : 1 });
    state.bossFight = fight;

    if (state.inputMode === "mic" && state.micReady) {
      state._micClap = (e) => fight.registerClap(e.detail.strength || 1);
      state.clap.addEventListener("clap", state._micClap);
    } else {
      attachKeyboard(false, (s) => fight.registerClap(s));
    }

    wireBossEvents(fight, cfg);
    fight.start();
  });
}

const BOSS_CIRC = 2 * Math.PI * 48;

function wireBossEvents(fight, cfg) {
  const boss = cfg.boss;
  const figure = $("#boss-figure");
  const shield = $("#boss-shield");
  const hpFill = $("#boss-hp");
  const hpNum = $("#boss-hp-num");
  const status = $("#boss-status");
  const timerText = $("#timer-text");
  const timerArc = $("#timer-arc");
  const comboEl = $("#combo-x");
  const cpsFill = $("#cps-fill");
  const cpsNow = $("#cps-now");
  const clapEmoji = $("#clap-emoji");
  const aura = auraById(state.profile.equippedAura);

  fight.addEventListener("hit", (e) => {
    const d = e.detail;
    state.sfx.aura(aura.sfx, d.combo);
    state.sfx.bossHit();
    figure.classList.remove("hurt"); void figure.offsetWidth; figure.classList.add("hurt");
    clapEmoji.classList.remove("pulse"); void clapEmoji.offsetWidth; clapEmoji.classList.add("pulse");
    comboEl.textContent = "x" + d.mult.toFixed(2);
    const r = figure.getBoundingClientRect();
    state.fx.burst(r.left + r.width / 2, r.top + r.height / 2, aura, d.strength, d.combo);
  });

  fight.addEventListener("blocked", () => {
    state.sfx.shieldBlock();
    status.textContent = "🛡️ SHIELDED — wait for the opening!";
    status.classList.add("warn");
  });

  fight.addEventListener("shieldup", () => {
    shield.classList.remove("hidden");
    status.textContent = "🛡️ SHIELD UP";
    status.classList.add("warn");
  });
  fight.addEventListener("shielddown", () => {
    shield.classList.add("hidden");
    status.textContent = "⚔️ OPENING — CLAP NOW!";
    status.classList.remove("warn");
  });

  fight.addEventListener("tick", (e) => {
    const d = e.detail;
    timerText.textContent = Math.ceil(d.remain);
    timerArc.style.strokeDasharray = BOSS_CIRC;
    timerArc.style.strokeDashoffset = BOSS_CIRC * (1 - d.remainPct);
    hpFill.style.width = (d.pct * 100) + "%";
    hpFill.classList.toggle("enraged", d.enraged);
    figure.classList.toggle("enraged", d.enraged);
    hpNum.textContent = `${Math.ceil(d.hp)} / ${boss.hp}`;
    cpsFill.style.width = Math.min(100, (d.cps / 10) * 100) + "%";
    cpsFill.classList.toggle("hot", d.cps >= 6);
    cpsNow.textContent = d.cps;
    if (d.remain <= 5 && timerText.dataset.warn !== "1") {
      timerText.dataset.warn = "1";
      timerText.style.color = "var(--bad)";
    }
  });

  fight.addEventListener("end", (e) => {
    cleanupInputs();
    state.bossFight = null;
    finishBossFight(e.detail, cfg.bossIndex);
  });
}

function finishBossFight(r, bossIndex) {
  let jcReport = null;
  let xpGained = 0;
  let isNewKill = false;

  if (r.won) {
    state.sfx.bossDown();
    app.classList.add("shake");
    setTimeout(() => app.classList.remove("shake"), 500);
    isNewKill = bossIndex === (state.profile.rpgBeaten || 0);
    if (isNewKill) state.profile.rpgBeaten = bossIndex + 1;
    // Rematches pay 40% to keep farming honest.
    const rewardJc = isNewKill ? r.boss.rewardJc : Math.round(r.boss.rewardJc * 0.4);
    jcReport = earnJc(state.profile, { score: 0, totalClaps: r.totalClaps, won: true }, rewardJc);
    xpGained = isNewKill ? r.boss.rewardXp : Math.round(r.boss.rewardXp * 0.4);
    state.profile.xp += xpGained;
    state.fx.coinRain(30);
  } else {
    state.sfx.lose();
    jcReport = earnJc(state.profile, { score: 0, totalClaps: r.totalClaps, won: false }, 0);
  }
  saveProfile(state.profile);

  app.innerHTML = renderBossResults(r, jcReport, xpGained, isNewKill);
  refreshHud();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// Admin panel
// ---------------------------------------------------------------------------
function wireAdmin() {
  const p = state.profile;
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", () => { fn(); state.sfx.click(); }); };
  const re = () => { saveProfile(p); navTo("admin"); };

  on("#adm-jc1",   () => { p.jc += 1000; toast("+1,000 JC", "🪙"); re(); });
  on("#adm-jc10",  () => { p.jc += 10000; toast("+10,000 JC", "💰"); re(); });
  on("#adm-jc100", () => { p.jc += 100000; toast("+100,000 JC", "🏦"); re(); });
  on("#adm-gems",  () => { p.gems += 1000; toast("+1,000 Gems", "💎"); re(); });
  on("#adm-jcdrop", () => { p.jc += 500; saveProfile(p); state.fx.coinRain(80); state.sfx.jcGain(); toast("JC DROP! +500", "🌧️"); refreshHud(); });
  on("#adm-boost", () => { p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + BOOST_MS; toast("2× boost +20 min", "⚡"); re(); });

  on("#adm-rankup",   () => { if (p.rankIndex < MAX_RANK_INDEX) p.rankIndex++; toast(`Rank: ${rankFromIndex(p.rankIndex).label}`, "⬆️"); re(); });
  on("#adm-rankdown", () => { if (p.rankIndex > 0) p.rankIndex--; toast(`Rank: ${rankFromIndex(p.rankIndex).label}`, "⬇️"); re(); });
  on("#adm-radiant",  () => { p.rankIndex = MAX_RANK_INDEX; p.rr = 100; toast("RADIANT. As you were always meant to be.", "🌟"); re(); });
  on("#adm-lvl10",    () => { const lp = levelProgress(p.xp); p.xp = xpTarget(lp.level + 10); toast(`Level ${lp.level + 10}`, "⭐"); re(); });
  on("#adm-ach",      () => { p.achievements = ACHIEVEMENTS.map((a) => a.id); toast("All achievements unlocked", "🏅"); re(); });
  on("#adm-bosses",   () => { p.rpgBeaten = BOSSES.length; toast("All bosses unlocked/beaten", "🗺️"); re(); });

  on("#adm-auras",   () => { p.ownedAuras = AURAS.map((a) => a.id); toast("Every aura unlocked", "🎨"); re(); });
  on("#adm-dev",     () => { if (!p.ownedAuras.includes("dev")) p.ownedAuras.push("dev"); p.equippedAura = "dev"; toast("Developer Aura equipped", "👨‍💻"); re(); });
  on("#adm-susanoo", () => { if (!p.ownedAuras.includes("susanoo")) p.ownedAuras.push("susanoo"); p.equippedAura = "susanoo"; state.fx.guardianFlash(); toast("Spectral Guardian equipped", "👹"); re(); });
  on("#adm-guardian", () => { state.fx.guardianFlash(); state.sfx.aura("boom"); });
  on("#adm-burst",   () => { const a = auraById(p.equippedAura); state.fx.burst(innerWidth / 2, innerHeight / 2, a, 1, 20); state.sfx.aura(a.sfx, 20); });
  on("#adm-premium", () => { p.premium = !p.premium; toast(p.premium ? "Premium granted" : "Premium revoked", "★"); re(); });

  on("#adm-god",      () => { p.godClap = !p.godClap; toast(`God Clap ${p.godClap ? "ON — 10× boss damage" : "OFF"}`, "🙏"); re(); });
  on("#adm-daily",    () => { p.lastDaily = null; toast("Daily reward reset — claim it in the lobby", "📅"); re(); });
  on("#adm-playtime", () => { p.playSeconds = (p.playSeconds || 0) + 600; toast("+10 min playtime credited", "⏱️"); re(); });
  on("#adm-history",  () => { p.history = []; toast("History cleared", "🧹"); re(); });
  on("#adm-hype",     () => { toast("GODLIKE 👑", "🔥"); state.sfx.unlock(); });
  on("#adm-reset",    () => {
    if (!confirm("FULL RESET — wipe rank, level, JC, gems, auras, bosses, everything?")) return;
    state.profile = resetProfile();
    state.clap.setSensitivity(state.profile.settings.sensitivity);
    state.sfx.setEnabled(state.profile.settings.sfxOn);
    applyTheme(state.profile.settings.theme);
    toast("Everything wiped. Clean slate.", "💣");
    navTo("lobby");
  });
  on("#adm-lock", () => { p.adminUnlocked = false; saveProfile(p); toast("Admin panel locked", "🔒"); navTo("lobby"); });
}

// xp needed to *be* a given level (mirror of ranks.xpForLevel)
function xpTarget(level) { return Math.round(120 * Math.pow(level - 1, 1.55)); }

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
      setTimeout(() => startPending(), 900);
    } catch (err) {
      toast("Mic unavailable — switching to keyboard mode", "⌨️");
      state.inputMode = "keyboard";
      startPending();
    }
  });

  $("#mic-keyboard").addEventListener("click", () => {
    state.inputMode = "keyboard";
    startPending();
  });

  const camPanelBtn = $("#mic-cam");
  camPanelBtn.addEventListener("click", () => setCam(!state.camera.on));
  syncMicPanelCamBtn();
}

// ---------------------------------------------------------------------------
// Keyboard / touch input
// ---------------------------------------------------------------------------
// Mouse clicks NEVER register claps (anti-autoclicker). Space is the
// no-mic fallback; touch taps count only where allowed (casual modes).
function attachKeyboard(allowTouch = false, clapFn = doClap) {
  detachKeyboard();
  const handler = (e) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); clapFn(1); }
  };
  state.keyHandler = handler;
  window.addEventListener("keydown", handler);
  if (allowTouch) {
    state.tapHandler = (e) => {
      if (e.pointerType === "mouse") return;   // clicking doesn't count
      if (e.target.closest("#arena-quit")) return;
      if (e.target.closest(".clap-stage") || e.target.closest(".arena")) clapFn(1);
    };
    app.addEventListener("pointerdown", state.tapHandler);
  }
}
function detachKeyboard() {
  if (state.keyHandler) window.removeEventListener("keydown", state.keyHandler);
  if (state.tapHandler) app.removeEventListener("pointerdown", state.tapHandler);
  state.keyHandler = state.tapHandler = null;
}

function doClap(strength) {
  if (state.match && state.match.running) state.match.registerClap(strength);
}

// Casual modes may tap-to-clap on touchscreens; competitive is mic/Space only.
function touchAllowed(cfg) {
  return ["practice", "classic", "custom"].includes(cfg.mode);
}

// Route the pending config to the right game type.
function startPending() {
  if (state.pending && state.pending.mode === "boss") beginBossFight();
  else beginMatch();
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
      attachKeyboard(touchAllowed(cfg));
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

  // Hype callouts at combo milestones
  const hypeStops = [
    { c: 12, t: "HEATING UP" }, { c: 22, t: "ON FIRE 🔥" },
    { c: 34, t: "UNSTOPPABLE" }, { c: 48, t: "GODLIKE 👑" },
  ];
  let hypeIdx = 0;

  const aura = auraById(state.profile.equippedAura);

  match.addEventListener("clap", (e) => {
    const { score, mult, strength, combo } = e.detail;
    state.sfx.aura(aura.sfx, combo);
    while (hypeIdx < hypeStops.length && combo >= hypeStops[hypeIdx].c) {
      showHype(hypeStops[hypeIdx].t);
      hypeIdx++;
    }
    if (scoreEl) {
      scoreEl.textContent = score.toLocaleString();
      scoreEl.classList.add("bump");
      setTimeout(() => scoreEl.classList.remove("bump"), 90);
    }
    comboEl.textContent = "x" + mult.toFixed(2);
    comboEl.classList.add("bump");
    setTimeout(() => comboEl.classList.remove("bump"), 100);
    clapEmoji.classList.remove("pulse"); void clapEmoji.offsetWidth; clapEmoji.classList.add("pulse");
    const rect = clapEmoji.getBoundingClientRect();
    state.fx.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, aura, strength, combo);
    if (state.camera.on) {
      camWindow.classList.add("pulse");
      clearTimeout(state._camPulse);
      state._camPulse = setTimeout(() => camWindow.classList.remove("pulse"), 130);
    }
  });

  let susWarned = false;
  match.addEventListener("sus", () => {
    if (susWarned) return;
    susWarned = true;
    toast("Whoa — inputs faster than humanly possible are ignored 🤨", "🚫");
    setTimeout(() => { susWarned = false; }, 4000);
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
      app.classList.add("shake");
      setTimeout(() => app.classList.remove("shake"), 500);
      koFlash(r.won);
      setTimeout(() => finishMatch(r), 1050);
    } else {
      finishMatch(r);
    }
  });
}

function showHype(text) {
  const stage = $(".clap-stage");
  if (!stage) return;
  const el = document.createElement("div");
  el.className = "hype";
  el.textContent = text;
  stage.appendChild(el);
  state.sfx.unlock();
  setTimeout(() => el.remove(), 900);
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
  const prevBestCps = state.profile.stats.bestCps;

  const report = applyMatchResult(state.profile, result);

  // Jerk Coins for completing the game (boost/premium multipliers apply).
  const jcReport = earnJc(state.profile, result);
  if (result.won) { state.sfx.jcGain(); state.fx.coinRain(Math.min(40, 10 + Math.round(jcReport.total / 20))); }

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

  app.innerHTML = renderResults(result, report, snapshot, jcReport);
  refreshHud();
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Personal-best CPS celebration
  if (result.peakCps > prevBestCps && result.peakCps >= 3) {
    const verdictEl = $(".res-verdict");
    if (verdictEl) {
      const rib = document.createElement("div");
      rib.className = "pb-ribbon";
      rib.textContent = `🏆 New personal best — ${result.peakCps} CPS`;
      verdictEl.insertAdjacentElement("afterend", rib);
    }
  }

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
// Playtime tracker (feeds the playtime reward)
// ---------------------------------------------------------------------------
let _ptDirty = 0;
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  state.profile.playSeconds = (state.profile.playSeconds || 0) + 5;
  _ptDirty += 5;
  if (_ptDirty >= 30) { saveProfile(state.profile); _ptDirty = 0; }
}, 5000);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
initParticles();
navTo("lobby");
refreshHud();
if (state.profile.settings.musicOn) musicBtn.classList.add("playing");

// Expose for debugging
window.JERKMANIA = state;
