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
import { Net, netSupported } from "./net.js";
import { checkAchievements, ACHIEVEMENTS } from "./achievements.js";
import { FxEngine, EFFECTS, effectById } from "./fx.js";
import { BOSSES, BossFight } from "./rpg.js";
import { World8Bit } from "./world8bit.js";
import { levelFromXp } from "./ranks.js";
import { TITLES, titleById, unlockedTitles, grantTitle } from "./titles.js";
import { questProgress, claimQuest, ensureQuests, questDef } from "./quests.js";
import {
  SKILLS, skillById, RARITIES, RARITY_ORDER, buildMods,
  rollRarity, pickSkillOfRarity, DUST_VALUE, SUMMON_COST, SUMMON_COST_10,
  STARTER_LOADOUT, TYPES,
} from "./goons.js";
import {
  earnJc, claimDaily, claimPlaytime, dailyInfo, playtimeInfo,
  buyBoost, buyPremium, grantGems, spendJc, boostActive, BOOST_MS,
} from "./economy.js";
import {
  $, $$, toast, renderHud, renderLobby, renderRanks, renderCustomSetup,
  renderMicPanel, renderArena, renderResults, renderAchievements, renderSettings,
  renderShop, renderWorld, renderBossFight, renderBossResults, renderAdmin, renderVersus,
  renderTutorial, renderSummon, renderCollection, renderLoadout, goonCard, GOON_ICON,
  initParticles, renderConnect, renderNetStatus,
} from "./ui.js";

const ADMIN_CODE = "JERKGOD";
const SECRET_JOWY = "JOWYJERKMASTER";

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
  worldEventsOn: true,
  inputMode: "mic",     // "mic" | "keyboard"
  micReady: false,
  pending: null,        // pending match config while on mic panel
  keyHandler: null,
  net: null,            // active Net transport for online 1v1
  serverUrl: localStorage.getItem("jm_server") || "",
  online: null,         // { ranked } while an online match is being set up
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
  if (typeof syncAdminFab === "function") syncAdminFab();
}

function navTo(screen) {
  // leaving arena? make sure any fight stops
  if (state.match) { state.match.abort(); state.match = null; }
  if (state.bossFight) { state.bossFight.abort(); state.bossFight = null; }
  if (state.world8) { state.world8.destroy(); state.world8 = null; }
  if (state.versus) { state.versus.stop(); state.versus = null; }
  // Tear down any online session unless we're mid-online-match (arena handles it).
  if (state.net && screen !== "arena" && !state._netMatchActive) { closeNet(); }
  if (state.inputMode === "mic" && state.micReady) { state.clap.stop(); state.micReady = false; }
  detachKeyboard();

  switch (screen) {
    case "lobby":        app.innerHTML = renderLobby(state.profile); wireLobby(); break;
    case "ranks":        app.innerHTML = renderRanks(state.profile); break;
    case "custom":       app.innerHTML = renderCustomSetup(); wireCustomSetup(); break;
    case "achievements": app.innerHTML = renderAchievements(state.profile); break;
    case "settings":     app.innerHTML = renderSettings(state.profile); wireSettings(); break;
    case "shop":         app.innerHTML = renderShop(state.profile); wireShop(); break;
    case "summon":       app.innerHTML = renderSummon(state.profile); wireSummon(); break;
    case "collection":   app.innerHTML = renderCollection(state.profile); break;
    case "loadout":      app.innerHTML = renderLoadout(state.profile); wireLoadout(); break;
    case "world":        app.innerHTML = renderWorld(state.profile); wireWorld8Bit(); break;
    case "connect":      app.innerHTML = renderConnect(state.profile, state.serverUrl); wireConnect(); break;
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
  if (mode === "versus") { startVersus(); return; }
  // "Play Ranked" now leads with real-player matchmaking; the bot ranked
  // match lives behind "Ranked vs bot" on the connect screen as a fallback.
  if (mode === "ranked") { navTo("connect"); return; }
  if (mode === "ranked-bot") { state.pending = buildConfig("ranked"); showMicPanel(); return; }
  state.pending = buildConfig(mode);
  showMicPanel();
}

// ---------------------------------------------------------------------------
// In-app modals (prompt/confirm are blocked in sandboxed iframes)
// ---------------------------------------------------------------------------
function confirmModal(msg, onYes, { danger = false } = {}) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <div class="modal-note" style="font-size:14px;color:var(--text)">${msg}</div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn ghost" data-no>Cancel</button>
        <button class="btn" data-yes ${danger ? 'style="background:var(--bad)"' : ""}>Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  back.addEventListener("click", (e) => {
    if (e.target === back || e.target.closest("[data-no]")) { back.remove(); return; }
    if (e.target.closest("[data-yes]")) { back.remove(); onYes(); }
  });
}

function passcodeModal(onOk) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h3>🛠️ Developer Access</h3>
      <div class="modal-note">Enter the developer passcode to unlock the admin panel.</div>
      <input type="password" class="text-input" id="pc-input" placeholder="Passcode" autocomplete="off" />
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn ghost" data-no>Cancel</button>
        <button class="btn" id="pc-ok">Unlock</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const input = back.querySelector("#pc-input");
  input.focus();
  const submit = () => { const v = input.value; back.remove(); onOk(v); };
  back.querySelector("#pc-ok").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-no]")) back.remove(); });
}

// ---------------------------------------------------------------------------
// Goon Skills — gacha, collection, loadout
// ---------------------------------------------------------------------------
function pull(count) {
  const g = state.profile.goons;
  const cost = count === 10 ? SUMMON_COST_10 : SUMMON_COST;
  if ((g.clapCoins || 0) < cost) { toast("Not enough Clap Coins", "🪙"); return null; }
  g.clapCoins -= cost;
  g.gacha.luck = (g.gacha.luck || 0);
  const results = [];
  const n = count === 10 ? 10 : 1;
  let guaranteedRare = count === 10; // 10x guarantees at least Rare+
  for (let i = 0; i < n; i++) {
    let rarity = rollRarity(g.gacha);
    if (guaranteedRare && i === n - 1 && ["common", "uncommon"].includes(rarity)) rarity = "rare";
    if (["rare", "epic", "legendary", "artifact"].includes(rarity)) guaranteedRare = false;
    const skill = pickSkillOfRarity(rarity, false);
    const already = g.owned[skill.id] || 0;
    const isNew = already === 0;
    let dust = 0;
    if (isNew) { g.owned[skill.id] = 1; }
    else { g.owned[skill.id] = already + 1; dust = DUST_VALUE[skill.rarity] || 5; g.dust = (g.dust || 0) + dust; }
    results.push({ skill, isNew, dust });
    g.history.unshift({ id: skill.id, r: skill.rarity, ts: Date.now(), isNew });
  }
  g.history = g.history.slice(0, 40);
  saveProfile(state.profile);
  return results;
}

function wireSummon() {
  const s1 = $("#summon-1"), s10 = $("#summon-10");
  if (s1 && !s1.disabled) s1.addEventListener("click", () => doSummon(1));
  if (s10 && !s10.disabled) s10.addEventListener("click", () => doSummon(10));
}

function doSummon(count) {
  const results = pull(count);
  if (!results) return;
  state.sfx.click();
  showReveal(results, 0);
}

function showReveal(results, idx) {
  const reduced = state.profile.settings.reducedMotion;
  const back = document.createElement("div");
  back.className = "modal-back reveal-back";
  document.body.appendChild(back);

  const renderOne = (i) => {
    const { skill, isNew, dust } = results[i];
    const r = RARITIES[skill.rarity];
    // rarity build-up sound
    const tierIdx = RARITY_ORDER.indexOf(skill.rarity);
    if (tierIdx >= 4) state.sfx.win(); else if (tierIdx >= 2) state.sfx.jcGain(); else state.sfx.click();
    if (!reduced) state.fx.burst(innerWidth / 2, innerHeight * 0.42, effectById("rainbow"), 1, 10 + tierIdx * 4);
    back.innerHTML = `
      <div class="reveal-card">
        <div class="reveal-flash rar-${skill.rarity}" style="--rc:${r.color};--rg:${r.glow}"></div>
        ${goonCard(skill, { isNew, owned: state.profile.goons.owned[skill.id] })}
        ${dust ? `<div class="reveal-dust">Duplicate → +${dust} ✨ Goon Dust</div>` : ""}
        <div class="reveal-progress">${i + 1} / ${results.length}</div>
        <div class="row" style="justify-content:center;margin-top:10px">
          ${results.length > 1 ? `<button class="btn ghost" id="reveal-skip">Skip all</button>` : ""}
          <button class="btn" id="reveal-next">${i + 1 < results.length ? "Next" : "Done"}</button>
        </div>
      </div>`;
    back.querySelector("#reveal-next").addEventListener("click", () => {
      state.sfx.click();
      if (i + 1 < results.length) renderOne(i + 1);
      else finishReveal();
    });
    const skip = back.querySelector("#reveal-skip");
    if (skip) skip.addEventListener("click", () => { state.sfx.click(); finishReveal(); });
  };
  const finishReveal = () => {
    back.remove();
    const newCount = results.filter((r) => r.isNew).length;
    const dustTotal = results.reduce((s, r) => s + r.dust, 0);
    if (newCount) toast(`${newCount} new Goon${newCount > 1 ? "s" : ""} added!`, "🃏");
    if (dustTotal) toast(`+${dustTotal} Goon Dust from duplicates`, "✨");
    navTo("summon");
  };
  renderOne(idx);
}

function wireLoadout() {
  app.addEventListener("click", function loClick(e) {
    const opt = e.target.closest("[data-equip-slot]");
    if (opt) {
      const slot = opt.dataset.equipSlot;
      const id = opt.dataset.equipId || null;
      // a skill can only occupy its own type slot; also prevent same card twice
      if (id) {
        const sk = skillById(id);
        if (!sk || sk.type !== slot) return;
        for (const t of TYPES) if (t !== slot && state.profile.goons.loadout[t] === id) state.profile.goons.loadout[t] = null;
      }
      state.profile.goons.loadout[slot] = id;
      saveProfile(state.profile);
      state.sfx.click();
      app.removeEventListener("click", loClick);
      navTo("loadout");
      return;
    }
    const rec = e.target.closest("#recommend-loadout");
    if (rec) {
      const g = state.profile.goons;
      for (const slot in STARTER_LOADOUT) {
        const id = STARTER_LOADOUT[slot];
        if (g.owned[id]) g.loadout[slot] = id;
      }
      saveProfile(state.profile);
      state.sfx.win();
      toast("Recommended starter loadout equipped", "✨");
      app.removeEventListener("click", loClick);
      navTo("loadout");
    }
  });
}

// ---------------------------------------------------------------------------
// 8-bit overworld
// ---------------------------------------------------------------------------
function wireWorld8Bit() {
  const canvas = $("#world8-canvas");
  if (!canvas) return;
  state.world8 = new World8Bit(canvas, state.profile, BOSSES, (bossIndex) => {
    // encounter → open the boss battle
    if (state.world8) { state.world8.destroy(); state.world8 = null; }
    state.sfx.go();
    startBoss(bossIndex);
  });
  // Carry over admin toggles set from the floating console.
  state.world8.noclip = !!state._noclip;
  state.world8.eventsOn = state.worldEventsOn;
  // Touch D-pad
  const dpad = $("#dpad");
  if (dpad) {
    const setDir = (dir, on) => {
      const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] || [0, 0];
      state._dpad = state._dpad || { x: 0, y: 0 };
      if (dir === "up" || dir === "down") state._dpad.y = on ? v[1] : 0;
      if (dir === "left" || dir === "right") state._dpad.x = on ? v[0] : 0;
      if (state.world8) state.world8.setTouch(state._dpad.x, state._dpad.y);
    };
    dpad.querySelectorAll(".dpad-btn").forEach((b) => {
      const d = b.dataset.dir;
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); setDir(d, true); });
      b.addEventListener("pointerup", () => setDir(d, false));
      b.addEventListener("pointerleave", () => setDir(d, false));
      b.addEventListener("pointercancel", () => setDir(d, false));
    });
  }
}

// ---------------------------------------------------------------------------
// Versus — local 2-player (keyboard + tap)
// ---------------------------------------------------------------------------
function startVersus() {
  app.innerHTML = renderVersus(state.profile);
  refreshHud();
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#arena-quit").addEventListener("click", () => { state.sfx.click(); navTo("lobby"); });

  runCountdown(() => {
    const V = {
      tug: 50, p1combo: 0, p2combo: 0, p1last: 0, p2last: 0,
      running: true, endAt: performance.now() + 45000, raf: null,
      stop() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); },
    };
    state.versus = V;
    const you = $("#clash-you"), foe = $("#clash-foe"), bolt = $("#clash-bolt");
    const youPct = $("#you-pct"), foePct = $("#foe-pct"), timer = $("#timer-text");
    const eff = effectById(state.profile.equippedAura);

    const push = (who) => {
      if (!V.running) return;
      const now = performance.now();
      if (who === 1) { V.p1combo = now - V.p1last < 250 ? V.p1combo + 1 : 0; V.p1last = now; }
      else { V.p2combo = now - V.p2last < 250 ? V.p2combo + 1 : 0; V.p2last = now; }
      const amt = 1.3 * (1 + Math.min(20, who === 1 ? V.p1combo : V.p2combo) * 0.03);
      V.tug += who === 1 ? amt : -amt;
      V.tug = Math.max(0, Math.min(100, V.tug));
      state.sfx.aura(eff.sfx, who === 1 ? V.p1combo : V.p2combo);
      const el = who === 1 ? $("#vs-p1") : $("#vs-p2");
      if (el) { el.classList.add("hit"); setTimeout(() => el.classList.remove("hit"), 80); }
      if (V.tug >= 100) return endVersus(V, 1);
      if (V.tug <= 0) return endVersus(V, 2);
    };

    V.key = (e) => {
      if (e.repeat) return;
      if (e.code === "KeyA") { e.preventDefault(); push(1); }
      else if (e.code === "KeyL") { e.preventDefault(); push(2); }
    };
    addEventListener("keydown", V.key);
    $("#vs-p1").addEventListener("pointerdown", (e) => { e.preventDefault(); push(1); });
    $("#vs-p2").addEventListener("pointerdown", (e) => { e.preventDefault(); push(2); });

    const loop = () => {
      if (!V.running) return;
      const remain = Math.max(0, V.endAt - performance.now());
      timer.textContent = Math.ceil(remain / 1000);
      you.style.width = V.tug + "%"; foe.style.width = (100 - V.tug) + "%";
      bolt.style.left = V.tug + "%";
      youPct.textContent = Math.round(V.tug); foePct.textContent = Math.round(100 - V.tug);
      if (remain <= 0) return endVersus(V, V.tug >= 50 ? 1 : 2);
      V.raf = requestAnimationFrame(loop);
    };
    loop();
  });
}

function endVersus(V, winner) {
  if (!V.running) return;
  V.stop();
  removeEventListener("keydown", V.key);
  state.sfx.bossDown();
  app.classList.add("shake");
  setTimeout(() => app.classList.remove("shake"), 500);
  const koEl = document.createElement("div");
  koEl.className = "ko-flash";
  koEl.innerHTML = `<div class="ko-text">PLAYER ${winner} WINS</div>`;
  document.body.appendChild(koEl);
  setTimeout(() => koEl.remove(), 1100);
  setTimeout(() => {
    state.versus = null;
    app.innerHTML = `
      <section class="screen results"><div class="res-card">
        <div class="res-verdict win">PLAYER ${winner} WINS</div>
        <div style="font-size:70px;margin:14px 0">${winner === 1 ? "🅰️" : "🇱"} 👑</div>
        <div style="color:var(--text-dim);margin-bottom:18px">Local 2-player battle · ${winner === 1 ? "left" : "right"} side dominated the bar</div>
        <div class="row" style="justify-content:center">
          <button class="btn big" data-play="versus">🔁 Rematch</button>
          <button class="btn ghost big" data-nav="lobby">🏠 Lobby</button>
        </div>
      </div></section>`;
    refreshHud();
  }, 1100);
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
    st.sfxOn = on; saveProfile(state.profile);
    e.currentTarget.classList.toggle("on", on);
    applyAccessibility();
    if (on) state.sfx.click();
  });

  $("#set-mute").addEventListener("click", (e) => {
    const on = !st.muteAll;
    st.muteAll = on; saveProfile(state.profile);
    e.currentTarget.classList.toggle("on", on);
    if (on) { state.music.stop(); musicBtn.classList.remove("playing"); }
    else if (st.musicOn) { state.music.start().then(() => musicBtn.classList.add("playing")).catch(() => {}); }
    applyAccessibility();
  });

  $("#set-motion").addEventListener("click", (e) => {
    const on = !st.reducedMotion;
    st.reducedMotion = on; saveProfile(state.profile);
    e.currentTarget.classList.toggle("on", on);
    applyAccessibility();
    if (!on) state.sfx.click();
  });

  $("#set-cam").addEventListener("click", (e) => {
    setCam(!state.camera.on);
    // reflect after the async toggle settles
    setTimeout(() => e.currentTarget.classList.toggle("on", state.camera.on), 200);
  });

  $("#title-row").addEventListener("click", (e) => {
    const b = e.target.closest("[data-title]"); if (!b) return;
    state.profile.equippedTitle = b.dataset.title || null;
    saveProfile(state.profile);
    $$("#title-row .title-pick").forEach((x) => x.classList.remove("active"));
    b.classList.add("active"); state.sfx.click();
  });

  // Custom effect art uploads
  $$(".art-file").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = input.id.replace("art-in-", "");
      handleArtUpload(id, e.target.files && e.target.files[0]);
    });
  });
  app.addEventListener("click", function artRemove(e) {
    const rm = e.target.closest("[data-art-remove]");
    if (!rm) return;
    delete state.profile.customArt[rm.dataset.artRemove];
    saveProfile(state.profile);
    state.sfx.click();
    app.removeEventListener("click", artRemove);
    navTo("settings");
  });

  const recal = $("#recalibrate");
  if (recal) recal.addEventListener("click", () => {
    state.profile.micCalibrated = false; saveProfile(state.profile);
    toast("Mic will recalibrate on your next Clap Mode game", "🎚️");
    state.sfx.click();
  });

  $("#reset-btn").addEventListener("click", () => {
    confirmModal("Reset ALL progress — rank, level, stats, JC, achievements and history? This can't be undone.", () => {
      state.profile = resetProfile();
      state.clap.setSensitivity(state.profile.settings.sensitivity);
      state.sfx.setEnabled(state.profile.settings.sfxOn);
      applyTheme(state.profile.settings.theme);
      toast("Progress reset — fresh start!", "🧼");
      navTo("lobby");
    }, { danger: true });
  });

  $("#admin-access").addEventListener("click", () => {
    if (state.profile.adminUnlocked) { openAdminConsole(); return; }
    passcodeModal((code) => {
      if (code && code.trim().toUpperCase() === ADMIN_CODE) {
        state.profile.adminUnlocked = true;
        saveProfile(state.profile);
        state.sfx.win();
        syncAdminFab();
        toast("Admin access granted 🛠️ — drag the console anywhere, open it anytime with the 🛠️ button", "🔓");
        openAdminConsole();
      } else if (code) {
        toast("Wrong passcode", "🔒");
      }
    });
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
  // Daily quest claims (delegated)
  app.addEventListener("click", function questClick(e) {
    const q = e.target.closest("[data-claim-quest]");
    if (!q || q.disabled) return;
    const got = claimQuest(state.profile, q.dataset.claimQuest);
    if (got) {
      toast(`Quest complete — +${got} JC`, "📋");
      state.sfx.jcGain(); state.fx.coinRain(20);
      app.removeEventListener("click", questClick);
      navTo("lobby");
    }
  });
  const key = $("#secret-keyhole");
  if (key) key.addEventListener("click", () => { state.sfx.click(); secretModal(); });
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------
function wireShop() {
  app.addEventListener("click", shopClick);
  function shopClick(e) {
    // Preview / test an effect right where you're standing (no purchase).
    const tryEl = e.target.closest("[data-try]");
    if (tryEl && (e.target.closest(".aura-preview") || e.target.closest(".aura-swatch"))) {
      e.stopPropagation();
      const eff = effectById(tryEl.dataset.try);
      const r = tryEl.getBoundingClientRect();
      for (let i = 0; i < 3; i++) setTimeout(() => {
        state.fx.burst(r.left + r.width / 2, r.top + r.height / 2 + 20, eff, 1, 12);
        state.sfx.aura(eff.sfx, 12);
      }, i * 140);
      return;
    }
    const buy = e.target.closest("[data-buy]");
    if (buy) {
      const eff = effectById(buy.dataset.buy);
      if (eff.rarity === "premium" && !state.profile.premium) { toast("Premium required", "★"); return; }
      if (!spendJc(state.profile, eff.price)) { toast(`Not enough JC — need ${eff.price.toLocaleString()}`, "🪙"); return; }
      state.profile.ownedAuras.push(eff.id);
      state.profile.equippedAura = eff.id;
      saveProfile(state.profile);
      state.sfx.jcGain(); state.fx.coinRain(16);
      toast(`${eff.name} unlocked & equipped!`, "🎨");
      app.removeEventListener("click", shopClick);
      navTo("shop");
      return;
    }
    const equip = e.target.closest("[data-equip]");
    if (equip) {
      state.profile.equippedAura = equip.dataset.equip;
      saveProfile(state.profile);
      state.sfx.click();
      toast(`${effectById(equip.dataset.equip).name} equipped`, "🎨");
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
  const aura = effectById(state.profile.equippedAura);

  fight.addEventListener("hit", (e) => {
    const d = e.detail;
    state.sfx.aura(aura.sfx, d.combo);
    state.sfx.bossHit();
    figure.classList.remove("hurt"); void figure.offsetWidth; figure.classList.add("hurt");
    clapEmoji.classList.remove("pulse"); void clapEmoji.offsetWidth; clapEmoji.classList.add("pulse");
    comboEl.textContent = "x" + d.mult.toFixed(2);
    const r = figure.getBoundingClientRect();
    clapFx(aura, r.left + r.width / 2, r.top + r.height / 2, d.strength, d.combo);
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
  const drops = { title: null, effect: null };   // unique first-kill drops for the results screen
  const prevLevel = levelFromXp(state.profile.xp);

  if (r.won) {
    state.sfx.bossDown();
    app.classList.add("shake");
    setTimeout(() => app.classList.remove("shake"), 500);
    isNewKill = bossIndex === (state.profile.rpgBeaten || 0);
    if (isNewKill) {
      state.profile.rpgBeaten = bossIndex + 1;
      // Claim the boss's mantle (title) + any unbuyable effect drop.
      if (r.boss.dropTitle && !(state.profile.titles || []).includes(r.boss.dropTitle)) {
        grantTitle(state.profile, r.boss.dropTitle);
        drops.title = titleById(r.boss.dropTitle);
      }
      if (r.boss.dropEffect && !(state.profile.ownedAuras || []).includes(r.boss.dropEffect)) {
        if (!Array.isArray(state.profile.ownedAuras)) state.profile.ownedAuras = ["none"];
        state.profile.ownedAuras.push(r.boss.dropEffect);
        drops.effect = effectById(r.boss.dropEffect);
      }
    }
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
  // Feed quests (boss kills, claps, cps) and title unlocks.
  questProgress(state.profile, {
    totalClaps: r.totalClaps, peakCps: r.peakCps, peakCombo: r.peakCombo,
    won: r.won, hasOpponent: true, knockout: r.won, bossKill: r.won && isNewKill,
  });
  checkTitleUnlocks(prevLevel);
  saveProfile(state.profile);

  app.innerHTML = renderBossResults(r, jcReport, xpGained, isNewKill, drops);
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

  // Title grants (admin-only)
  on("#adm-title-tester", () => { grantTitle(p, "tester"); p.equippedTitle = "tester"; toast("TESTER title granted & equipped", "🧪"); re(); });
  on("#adm-title-dev",    () => { grantTitle(p, "developer"); p.equippedTitle = "developer"; toast("DEVELOPER title granted & equipped", "👨‍💻"); re(); });
  on("#adm-title-jowy",   () => { grantTitle(p, "jowy"); p.equippedTitle = "jowy"; state.fx.burst(innerWidth / 2, innerHeight / 2, effectById("poison"), 1, 12); toast("JOWY title granted", "🟢"); re(); });
  on("#adm-title-revoke", () => { p.titles = []; if (["tester", "developer", "jowy"].includes(p.equippedTitle)) p.equippedTitle = null; toast("Special titles revoked", "🚫"); re(); });

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

  on("#adm-auras",   () => { p.ownedAuras = EFFECTS.map((a) => a.id); toast("Every effect unlocked", "🎨"); re(); });
  on("#adm-dev",     () => { if (!p.ownedAuras.includes("dev")) p.ownedAuras.push("dev"); p.equippedAura = "dev"; toast("Developer Aura equipped", "👨‍💻"); re(); });
  on("#adm-susanoo", () => { if (!p.ownedAuras.includes("susanoo")) p.ownedAuras.push("susanoo"); p.equippedAura = "susanoo"; state.fx.guardianFlash(); toast("Spectral Guardian equipped", "👹"); re(); });
  on("#adm-guardian", () => { state.fx.guardianFlash(); state.sfx.aura("vboom"); });
  on("#adm-burst",   () => { const a = effectById(p.equippedAura); state.fx.burst(innerWidth / 2, innerHeight / 2, a, 1, 20); state.sfx.aura(a.sfx, 20); });
  on("#adm-premium", () => { p.premium = !p.premium; toast(p.premium ? "Premium granted" : "Premium revoked", "★"); re(); });

  on("#adm-god",      () => { p.godClap = !p.godClap; toast(`God Clap ${p.godClap ? "ON — 10× boss damage" : "OFF"}`, "🙏"); re(); });
  on("#adm-daily",    () => { p.lastDaily = null; toast("Daily reward reset — claim it in the lobby", "📅"); re(); });
  on("#adm-playtime", () => { p.playSeconds = (p.playSeconds || 0) + 600; toast("+10 min playtime credited", "⏱️"); re(); });
  on("#adm-history",  () => { p.history = []; toast("History cleared", "🧹"); re(); });
  on("#adm-quests",   () => { const q = ensureQuests(p); q.items.forEach((it) => { const d = questDef(it.id); if (d) it.prog = d.target; }); toast("All quests ready to claim", "📋"); re(); });
  on("#adm-reset",    () => {
    confirmModal("FULL RESET — wipe rank, level, JC, gems, effects, bosses, everything?", () => {
      state.profile = resetProfile();
      state.clap.setSensitivity(state.profile.settings.sensitivity);
      state.sfx.setEnabled(state.profile.settings.sfxOn);
      applyTheme(state.profile.settings.theme);
      toast("Everything wiped. Clean slate.", "💣");
      navTo("lobby");
    }, { danger: true });
  });
  on("#adm-lock", () => { p.adminUnlocked = false; saveProfile(p); toast("Admin panel locked", "🔒"); navTo("lobby"); });
}

// xp needed to *be* a given level (mirror of ranks.xpForLevel)
function xpTarget(level) { return Math.round(120 * Math.pow(level - 1, 1.55)); }

// ---------------------------------------------------------------------------
// Custom effect art — the player uploads their own image/GIF, played locally
// ---------------------------------------------------------------------------
const HEAVY_ART = { susanoo: 1, chakra: 1, domain: 1, void: 1, galaxy: 1, bankai: 1 };

// Downscale + store an uploaded file as a data URL (GIFs kept as-is to animate).
function handleArtUpload(effectId, file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { toast("Please choose an image or GIF", "⚠️"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const raw = reader.result;
    const store = (url) => {
      if (url.length > 4.6 * 1024 * 1024) { toast("That file's too big — try one under ~4 MB", "⚠️"); return; }
      state.profile.customArt[effectId] = url;
      saveProfile(state.profile);
      state.sfx.win();
      toast("Custom art saved 🖼️", "✅");
      navTo("settings");
    };
    if (file.type === "image/gif") return store(raw); // keep GIF animation
    const img = new Image();
    img.onload = () => {
      const max = 700; let { width: w, height: h } = img;
      const r = Math.min(1, max / Math.max(w, h)); w = Math.round(w * r); h = Math.round(h * r);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      try { store(c.toDataURL("image/png")); } catch { store(raw); }
    };
    img.onerror = () => store(raw);
    img.src = raw;
  };
  reader.readAsDataURL(file);
}

// Play the uploaded image as an effect overlay (throttled for heavy ones).
function playCustomArt(effect, x, y) {
  const url = state.profile.customArt && state.profile.customArt[effect.id];
  if (!url) return false;
  const heavy = !!(HEAVY_ART[effect.id] || HEAVY_ART[effect.kind]);
  const now = performance.now();
  state._artCd = state._artCd || {};
  if (now - (state._artCd[effect.id] || 0) < (heavy ? 1100 : 220)) return true;
  state._artCd[effect.id] = now;

  const wrap = document.createElement("div");
  wrap.className = "custom-fx-wrap " + (heavy ? "heavy" : "light");
  if (heavy && !state.profile.settings.reducedMotion) {
    const bg = document.createElement("div"); bg.className = "custom-fx-bg"; wrap.appendChild(bg);
  }
  if (!heavy) { wrap.style.left = x + "px"; wrap.style.top = y + "px"; }
  const im = document.createElement("img");
  im.className = "custom-fx-img"; im.src = url; im.alt = "";
  wrap.appendChild(im);
  document.body.appendChild(wrap);
  const life = heavy ? 1650 : 600;
  setTimeout(() => { wrap.classList.add("out"); setTimeout(() => wrap.remove(), 400); }, life - 400);
  return true;
}

// Unified clap visual: custom art if the equipped effect has it, else the
// built-in canvas effect (a light spark accent still plays alongside art).
function clapFx(effect, cx, cy, strength, combo) {
  if (playCustomArt(effect, cx, cy)) {
    state.fx.burst(cx, cy, { kind: "spark", colors: effect.colors || ["#b8a8ff", "#fff"] }, strength, Math.min(combo, 8));
  } else {
    state.fx.burst(cx, cy, effect, strength, combo);
  }
}

// ---------------------------------------------------------------------------
// Floating admin console — a button + overlay usable on ANY screen, including
// mid-match. Opens over whatever you're doing so you can "admin abuse" live.
// ---------------------------------------------------------------------------
const adminFab = $("#admin-fab");
const adminOverlay = $("#admin-overlay");

function syncAdminFab() {
  adminFab.classList.toggle("hidden", !state.profile.adminUnlocked);
}

adminFab.addEventListener("click", () => {
  if (!state.profile.adminUnlocked) return;
  adminOverlay.classList.toggle("hidden");
  if (!adminOverlay.classList.contains("hidden")) buildAdminOverlay();
});

// Open the floating console (used by the settings "admin access" button too).
function openAdminConsole() {
  if (!state.profile.adminUnlocked) return;
  adminOverlay.classList.remove("hidden");
  buildAdminOverlay();
}

function buildAdminOverlay() {
  const p = state.profile;
  const q = (id, icon, label) => `<button class="afab-btn" id="${id}"><span>${icon}</span>${label}</button>`;
  const minimized = state._adminMin ? "min" : "";
  adminOverlay.innerHTML = `
    <div class="afab-panel ${minimized}" id="afab-win">
      <div class="afab-titlebar" id="afab-drag">
        <div class="afab-title">🛠️ DEV CONSOLE</div>
        <div class="afab-winbtns">
          <button id="afab-min" title="Minimize/restore">${state._adminMin ? "▢" : "▁"}</button>
          <button id="afab-x" title="Close">✕</button>
        </div>
      </div>
      <div class="afab-scroll">
        <div class="afab-sec">💰 Currency</div>
        <div class="afab-grid">
          ${q("fab-jc", "💰", "+10k JC")}
          ${q("fab-jc100", "🏦", "+100k JC")}
          ${q("fab-coins", "🪙", "+5k Coins")}
          ${q("fab-gems", "💎", "+1k Gems")}
          ${q("fab-drop", "🌧️", "JC Drop")}
          ${q("fab-boost", "⚡", "2× Boost")}
        </div>
        <div class="afab-sec">📈 Progression</div>
        <div class="afab-grid">
          ${q("fab-lvl", "⭐", "+10 Levels")}
          ${q("fab-rankup", "⬆️", "+1 Division")}
          ${q("fab-radiant", "🌟", "Max Rank")}
          ${q("fab-ach", "🏅", "All Achieve")}
          ${q("fab-bosses", "🗺️", "All Bosses")}
          ${q("fab-quests", "📋", "All Quests")}
        </div>
        <div class="afab-sec">✨ Cosmetics</div>
        <div class="afab-grid">
          ${q("fab-auras", "🎨", "All Effects")}
          ${q("fab-effect", "💥", "Test Effect")}
          ${q("fab-rinnegan", "🟣", "Rinnegan")}
          ${q("fab-susanoo", "👹", "Susanoo")}
          ${q("fab-titles", "🏷️", "All Titles")}
          ${q("fab-premium", "★", p.premium ? "Un-Premium" : "Premium")}
        </div>
        <div class="afab-sec">🎮 Game</div>
        <div class="afab-grid">
          ${q("fab-god", p.godClap ? "🙏" : "😇", p.godClap ? "God ON" : "God OFF")}
          ${q("fab-win", "🏆", "Win Now")}
          ${q("fab-heal", "💗", "Refill Boss")}
          ${q("fab-noclip", state._noclip ? "👻" : "🧱", state._noclip ? "Noclip ON" : "Noclip OFF")}
          ${q("fab-event", state.worldEventsOn ? "🎲" : "🚫", state.worldEventsOn ? "Events ON" : "Events OFF")}
          ${q("fab-goons", "🃏", "Unlock Goons")}
        </div>
        <div class="afab-sec">🧰 Utility</div>
        <div class="afab-grid">
          ${q("fab-daily", "📅", "Reset Daily")}
          ${q("fab-playtime", "⏱️", "+10m Play")}
          ${q("fab-history", "🧹", "Clr History")}
          ${q("fab-target", "🎯", "Admin Other")}
          ${q("fab-lock", "🔒", "Lock Admin")}
          ${q("fab-reset", "💣", "FULL RESET")}
        </div>
      </div>
    </div>`;

  positionAdminWin();
  makeAdminDraggable();

  const on = (id, fn) => { const el = $("#" + id); if (el) el.addEventListener("click", () => { fn(); state.sfx.click(); }); };
  const save = () => saveProfile(p);

  // window chrome
  on("afab-x", () => adminOverlay.classList.add("hidden"));
  on("afab-min", () => { state._adminMin = !state._adminMin; buildAdminOverlay(); });

  // currency
  on("fab-jc", () => { p.jc += 10000; save(); refreshHud(); toast("+10,000 JC", "💰"); });
  on("fab-jc100", () => { p.jc += 100000; save(); refreshHud(); toast("+100,000 JC", "🏦"); });
  on("fab-coins", () => { p.goons.clapCoins += 5000; save(); toast("+5,000 Clap Coins", "🪙"); });
  on("fab-gems", () => { p.gems += 1000; save(); refreshHud(); toast("+1,000 Gems", "💎"); });
  on("fab-drop", () => { p.jc += 500; save(); state.fx.coinRain(80); state.sfx.jcGain(); refreshHud(); });
  on("fab-boost", () => { p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + BOOST_MS; save(); toast("2× boost +20 min", "⚡"); });

  // progression
  on("fab-lvl", () => { const lp = levelProgress(p.xp); p.xp = xpTarget(lp.level + 10); save(); refreshHud(); toast(`Level ${lp.level + 10}`, "⭐"); });
  on("fab-rankup", () => { if (p.rankIndex < MAX_RANK_INDEX) p.rankIndex++; save(); refreshHud(); toast(`Rank: ${rankFromIndex(p.rankIndex).label}`, "⬆️"); });
  on("fab-radiant", () => { p.rankIndex = MAX_RANK_INDEX; p.rr = 100; save(); refreshHud(); toast("RADIANT.", "🌟"); });
  on("fab-ach", () => { p.achievements = ACHIEVEMENTS.map((a) => a.id); save(); toast("All achievements unlocked", "🏅"); });
  on("fab-bosses", () => { p.rpgBeaten = BOSSES.length; save(); toast("All bosses beaten", "🗺️"); });
  on("fab-quests", () => { const qz = ensureQuests(p); qz.items.forEach((it) => { const d = questDef(it.id); if (d) it.prog = d.target; }); save(); toast("All quests ready to claim", "📋"); });

  // cosmetics
  on("fab-auras", () => { p.ownedAuras = EFFECTS.map((a) => a.id); save(); toast("Every effect unlocked", "🎨"); });
  on("fab-effect", () => { const a = effectById(p.equippedAura); clapFx(a, innerWidth / 2, innerHeight / 2, 1, 20); state.sfx.aura(a.sfx, 20); });
  on("fab-rinnegan", () => { if (!p.ownedAuras.includes("rinnegan")) p.ownedAuras.push("rinnegan"); p.equippedAura = "rinnegan"; save(); state.fx.burst(innerWidth / 2, innerHeight / 2, effectById("rinnegan"), 1, 20); state.sfx.aura("gong", 20); toast("Rinnegan equipped 🟣", "👁️"); });
  on("fab-susanoo", () => { if (!p.ownedAuras.includes("susanoo")) p.ownedAuras.push("susanoo"); p.equippedAura = "susanoo"; save(); if (!playCustomArt({ id: "susanoo", kind: "susanoo" }, innerWidth / 2, innerHeight / 2)) state.fx.guardianFlash(); state.sfx.aura("vboom"); toast("Spectral Guardian equipped", "👹"); });
  on("fab-titles", () => { TITLES.forEach((t) => grantTitle(p, t.id)); save(); toast("All titles granted", "🏷️"); });
  on("fab-premium", () => { p.premium = !p.premium; save(); toast(p.premium ? "Premium granted" : "Premium revoked", "★"); buildAdminOverlay(); });

  // game
  on("fab-god", () => { p.godClap = !p.godClap; save(); toast(`God Clap ${p.godClap ? "ON — 10× boss dmg" : "OFF"}`, "🙏"); buildAdminOverlay(); });
  on("fab-win", () => {
    if (state.match && state.match.running) { state.match.tug = 100; state.match.youPush = 1e9; state.match._finish(); }
    else if (state.bossFight && state.bossFight.running) { state.bossFight.hp = 0; state.bossFight._finish(true); }
    else toast("No active match", "🤷");
  });
  on("fab-heal", () => { if (state.bossFight && state.bossFight.running) { state.bossFight.hp = state.bossFight.boss.hp; toast("Boss HP refilled", "💗"); } else toast("No active boss", "🤷"); });
  on("fab-noclip", () => { state._noclip = !state._noclip; if (state.world8) state.world8.noclip = state._noclip; toast(`Noclip ${state._noclip ? "ON — walk through walls" : "OFF"}`, state._noclip ? "👻" : "🧱"); buildAdminOverlay(); });
  on("fab-event", () => { state.worldEventsOn = !state.worldEventsOn; if (state.world8) state.world8.eventsOn = state.worldEventsOn; toast(`World events ${state.worldEventsOn ? "ON" : "OFF"}`, "🎲"); buildAdminOverlay(); });
  on("fab-goons", () => { SKILLS.forEach((s) => { p.goons.owned[s.id] = Math.max(1, p.goons.owned[s.id] || 0); }); save(); toast("All Goons unlocked", "🃏"); });

  // utility
  on("fab-daily", () => { p.lastDaily = null; save(); toast("Daily reward reset", "📅"); });
  on("fab-playtime", () => { p.playSeconds = (p.playSeconds || 0) + 600; save(); toast("+10 min playtime", "⏱️"); });
  on("fab-history", () => { p.history = []; save(); toast("History cleared", "🧹"); });
  on("fab-target", () => { adminOverlay.classList.add("hidden"); adminTargetModal(); });
  on("fab-lock", () => { p.adminUnlocked = false; save(); syncAdminFab(); adminOverlay.classList.add("hidden"); toast("Admin locked", "🔒"); });
  on("fab-reset", () => {
    confirmModal("FULL RESET — wipe rank, level, JC, gems, effects, bosses, everything?", () => {
      state.profile = resetProfile();
      state.clap.setSensitivity(state.profile.settings.sensitivity);
      state.sfx.setEnabled(state.profile.settings.sfxOn);
      applyTheme(state.profile.settings.theme);
      adminOverlay.classList.add("hidden");
      toast("Everything wiped. Clean slate.", "💣");
      navTo("lobby");
    }, { danger: true });
  });
}

// Restore last window position (or center-right on first open).
function positionAdminWin() {
  const win = $("#afab-win");
  if (!win) return;
  if (!state._adminPos) {
    const w = Math.min(440, innerWidth - 24);
    state._adminPos = { x: Math.max(12, innerWidth - w - 20), y: 74 };
  }
  const w = win.offsetWidth || 440, h = 80;
  state._adminPos.x = Math.max(6, Math.min(innerWidth - w, state._adminPos.x));
  state._adminPos.y = Math.max(6, Math.min(innerHeight - h, state._adminPos.y));
  win.style.left = state._adminPos.x + "px";
  win.style.top = state._adminPos.y + "px";
}

// Drag the console by its title bar (pointer events → works on touch too).
function makeAdminDraggable() {
  const win = $("#afab-win"), bar = $("#afab-drag");
  if (!win || !bar) return;
  const down = (e) => {
    if (e.target.closest(".afab-winbtns")) return;   // don't drag from the buttons
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const ox = state._adminPos.x, oy = state._adminPos.y;
    const move = (ev) => {
      state._adminPos.x = ox + (ev.clientX - startX);
      state._adminPos.y = oy + (ev.clientY - startY);
      positionAdminWin();
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  bar.addEventListener("pointerdown", down);
}

// "Admin another person" — apply an admin action to a named profile export you
// paste in (offline stand-in for account targeting, since there's no backend).
function adminTargetModal() {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h3>🎯 Admin Another Player</h3>
      <div class="modal-note">There's no online backend, so you can act on another player's <b>save code</b>: have them paste their code (Settings → Export), edit it here, and hand it back. Paste a save code to grant them a title / coins.</div>
      <textarea class="text-input" id="tgt-code" rows="3" placeholder="paste their save code…" style="resize:vertical;font-family:monospace;font-size:11px"></textarea>
      <div class="chip-row" style="margin-top:10px">
        <button class="chip" data-tgt="jc">+10k JC</button>
        <button class="chip" data-tgt="tester">Grant TESTER</button>
        <button class="chip" data-tgt="dev">Grant DEVELOPER</button>
        <button class="chip" data-tgt="jowy">Grant JOWY</button>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn ghost" data-no>Close</button>
        <button class="btn" id="tgt-apply">Apply → new code</button>
      </div>
      <div id="tgt-out" style="margin-top:12px"></div>
    </div>`;
  document.body.appendChild(back);
  let action = "jc";
  back.querySelectorAll("[data-tgt]").forEach((b) => b.addEventListener("click", () => {
    action = b.dataset.tgt;
    back.querySelectorAll("[data-tgt]").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
  }));
  back.querySelector("#tgt-apply").addEventListener("click", () => {
    try {
      const code = back.querySelector("#tgt-code").value.trim();
      const prof = JSON.parse(decodeURIComponent(escape(atob(code))));
      if (action === "jc") prof.jc = (prof.jc || 0) + 10000;
      else { if (!Array.isArray(prof.titles)) prof.titles = []; if (!prof.titles.includes(action)) prof.titles.push(action); prof.equippedTitle = action; }
      const out = btoa(unescape(encodeURIComponent(JSON.stringify(prof))));
      back.querySelector("#tgt-out").innerHTML = `<div class="modal-note">Hand this new code back to them (Settings → Import):</div><textarea class="text-input" rows="3" readonly style="font-family:monospace;font-size:10px">${out}</textarea>`;
      state.sfx.win();
    } catch { toast("That's not a valid save code", "🚫"); }
  });
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-no]")) back.remove(); });
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

// ===========================================================================
// Online 1v1 (WebRTC) — friend copy-paste + server matchmaking
// ===========================================================================
function onlineConfig(ranked, foeName) {
  return {
    mode: ranked ? "ranked" : "duel",
    label: ranked ? "RANKED · ONLINE 🌐" : "1v1 · ONLINE 🌐",
    duration: 25,
    ranked: !!ranked,
    online: true,
    bot: { name: foeName || "Opponent" },   // {name} only → clash UI, no local AI
    hostRole: state.net ? state.net.role !== "guest" : true,
  };
}

function closeNet() {
  if (state.net) { try { state.net.close(); } catch {} }
  state.net = null;
  state.online = null;
  state._netMatchActive = false;
  state._netReady = state._peerReady = state._foeLeft = state._foeEnded = false;
  state._foeName = null;
}

function newNet(ranked) {
  closeNet();
  const net = new Net();
  state.net = net;
  state.online = { ranked };
  net.addEventListener("status", (e) => netStatus(e.detail || "Connecting…"));
  net.addEventListener("neterror", (e) => { toast(e.detail || "Connection failed", "🚫"); clearNetStatus(); closeNet(); });
  net.addEventListener("open", onNetOpen);
  net.addEventListener("close", onNetClose);
  net.addEventListener("msg", (e) => onNetMsg(e.detail));
  return net;
}

function netStatus(msg, sub = "") {
  let el = document.getElementById("net-status");
  if (!el) {
    document.body.insertAdjacentHTML("beforeend", renderNetStatus(msg, sub));
    el = document.getElementById("net-status");
    el.querySelector("#net-cancel").addEventListener("click", () => { clearNetStatus(); closeNet(); navTo("connect"); });
  } else {
    el.querySelector("#net-status-msg").textContent = msg;
    el.querySelector("#net-status-sub").textContent = sub || "";
  }
}
function clearNetStatus() { const el = document.getElementById("net-status"); if (el) el.remove(); }

function onNetOpen() {
  clearNetStatus();
  state.net.send({ t: "hi", name: state.profile.name || "Player", rank: state.profile.rankIndex || 0 });
  // Into the shared pre-match input setup; the ready handshake syncs the start.
  state.pending = onlineConfig(state.online.ranked, state._foeName || state.net.peerName);
  showMicPanel();
}

function onNetClose() {
  if (state._netMatchActive && state.match && state.match.running) {
    // Opponent bailed mid-match — award the win by forfeit.
    state._foeLeft = true;
    toast("Opponent left — you win by forfeit! 🏆", "🔌");
    state.match.foePush = -1;
    state.match._finish();
    return;
  }
  if (!state._netMatchActive) {
    toast("Opponent disconnected", "🔌");
    clearNetStatus();
    closeNet();
    if (!document.querySelector(".arena")) navTo("connect");
  }
}

function onNetMsg(m) {
  if (!m || !m.t) return;
  switch (m.t) {
    case "hi":   state._foeName = m.name || "Opponent"; break;
    case "ready": state._peerReady = true; maybeStartOnline(); break;
    case "go":   if (state.net && state.net.role === "guest") beginOnlineMatch(); break;
    case "c":    if (state.match) state.match.foeClap(m.s || 1, m.p); break;
    case "end":  state._foeEnded = true; break;
    case "bye":  onNetClose(); break;
  }
}

function onlineReady() {
  state._netReady = true;
  if (state.net) state.net.send({ t: "ready" });
  netStatus("You're ready ✓", "Waiting for your opponent…");
  maybeStartOnline();
}

function maybeStartOnline() {
  if (!state._netReady || !state._peerReady || !state.net) return;
  if (state.net.role === "guest") return;      // guest waits for the host's "go"
  state.net.send({ t: "go" });                 // host is authoritative
  beginOnlineMatch();
}

function beginOnlineMatch() {
  clearNetStatus();
  state._netMatchActive = true;
  state._foeEnded = state._foeLeft = false;
  if (state.pending) {
    state.pending.bot.name = state._foeName || (state.net && state.net.peerName) || "Opponent";
    state.pending.hostRole = state.net ? state.net.role !== "guest" : true;
  }
  beginMatch();
}

function wireConnect() {
  $$(".net-tab").forEach((t) => t.addEventListener("click", () => {
    $$(".net-tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const which = t.dataset.nettab;
    $$(".net-pane").forEach((p) => { p.style.display = p.dataset.pane === which ? "" : "none"; });
  }));

  // ---- Friend (copy-paste) — host ----
  const createBtn = $("#net-create");
  if (createBtn) createBtn.addEventListener("click", async () => {
    if (!netSupported()) { toast("This browser can't do WebRTC 1v1", "🚫"); return; }
    createBtn.disabled = true; createBtn.textContent = "Generating…";
    const net = newNet(false);
    try {
      const code = await net.createOffer();
      $("#host-out").style.display = "";
      $("#host-code").value = code;
      createBtn.textContent = "✓ Code ready — send it";
    } catch { toast("Couldn't create a code (WebRTC blocked here?)", "🚫"); createBtn.disabled = false; createBtn.textContent = "Create connect code"; closeNet(); }
  });
  const hostCopy = $("#host-copy"); if (hostCopy) hostCopy.addEventListener("click", () => copyText($("#host-code").value));
  const hostConnect = $("#host-connect");
  if (hostConnect) hostConnect.addEventListener("click", async () => {
    const ans = ($("#host-answer").value || "").trim();
    if (!ans) { toast("Paste your friend's reply code first", "📋"); return; }
    if (!state.net) { toast("Create a code first", "①"); return; }
    netStatus("Connecting…", "Linking to your friend");
    try { await state.net.acceptAnswer(ans); } catch { toast("That reply code didn't work", "🚫"); clearNetStatus(); }
  });

  // ---- Friend (copy-paste) — join ----
  const joinBtn = $("#net-join");
  if (joinBtn) joinBtn.addEventListener("click", async () => {
    if (!netSupported()) { toast("This browser can't do WebRTC 1v1", "🚫"); return; }
    const offer = ($("#join-offer").value || "").trim();
    if (!offer) { toast("Paste your friend's code first", "📋"); return; }
    joinBtn.disabled = true; joinBtn.textContent = "Generating…";
    const net = newNet(false);
    try {
      const reply = await net.acceptOffer(offer);
      $("#join-out").style.display = "";
      $("#join-code").value = reply;
      joinBtn.textContent = "✓ Reply ready — send it back";
      netStatus("Waiting for your friend…", "The match starts when they connect");
    } catch { toast("That code didn't work", "🚫"); joinBtn.disabled = false; joinBtn.textContent = "Generate reply →"; closeNet(); }
  });
  const joinCopy = $("#join-copy"); if (joinCopy) joinCopy.addEventListener("click", () => copyText($("#join-code").value));

  // ---- Ranked / server ----
  const server = $("#net-server");
  const saveServer = () => { if (server) { state.serverUrl = server.value.trim(); localStorage.setItem("jm_server", state.serverUrl); } };
  const quick = $("#net-quick");
  if (quick) quick.addEventListener("click", () => {
    saveServer();
    if (!state.serverUrl) { toast("Enter a matchmaking server URL first", "🌐"); return; }
    startServerMatch("queue", { ranked: true });
  });
  const roomToggle = $("#net-room");
  if (roomToggle) roomToggle.addEventListener("click", () => { const w = $("#net-room-wrap"); w.style.display = w.style.display === "none" ? "" : "none"; });
  const roomHost = $("#net-room-host");
  if (roomHost) roomHost.addEventListener("click", () => {
    saveServer(); const room = ($("#net-roomcode").value || "").trim();
    if (!state.serverUrl || !room) { toast("Server URL + room code needed", "🔑"); return; }
    startServerMatch("host", { ranked: false, room });
  });
  const roomJoin = $("#net-room-join");
  if (roomJoin) roomJoin.addEventListener("click", () => {
    saveServer(); const room = ($("#net-roomcode").value || "").trim();
    if (!state.serverUrl || !room) { toast("Server URL + room code needed", "🔑"); return; }
    startServerMatch("join", { ranked: false, room });
  });
}

function startServerMatch(mode, { ranked, room = "" }) {
  if (!netSupported()) { toast("This browser can't do WebRTC 1v1", "🚫"); return; }
  const net = newNet(ranked);
  netStatus(mode === "queue" ? "Searching for an opponent…" : "Connecting to room…", "");
  net.connectServer(state.serverUrl, { mode, room, rank: state.profile.rankIndex || 0, name: state.profile.name || "Player" });
}

function copyText(t) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(t).then(() => toast("Copied!", "📋"), () => toast("Copy failed — select the text and copy manually", "📋"));
  } else { toast("Select the text and copy manually", "📋"); }
}

// ---------------------------------------------------------------------------
// Keyboard / touch input
// ---------------------------------------------------------------------------
// KEYBOARD MODE is deliberately different from clapping: you "clap" by
// ALTERNATING F and J like two hands — mashing one key does nothing. Mouse
// clicks never count (anti-autoclicker). Touch taps (two fingers) count in
// casual modes only.
function attachKeyboard(allowTouch = false, clapFn = doClap) {
  detachKeyboard();
  let lastKey = null;
  const handler = (e) => {
    if (e.repeat) return;
    if (e.code === "KeyF" || e.code === "KeyJ") {
      e.preventDefault();
      if (e.code !== lastKey) { lastKey = e.code; clapFn(1); }   // must alternate
    } else if (e.code === "Space") {
      // single-key fallback, slightly weaker so alternation stays best
      e.preventDefault(); clapFn(0.75);
    }
  };
  state.keyHandler = handler;
  window.addEventListener("keydown", handler);
  if (allowTouch) {
    let lastSide = null;
    state.tapHandler = (e) => {
      if (e.pointerType === "mouse") return;   // clicking doesn't count
      if (e.target.closest("#arena-quit")) return;
      if (!(e.target.closest(".clap-stage") || e.target.closest(".arena"))) return;
      // Two-finger alternation: tapping alternating sides of the screen.
      const side = e.clientX < window.innerWidth / 2 ? "L" : "R";
      if (side !== lastSide) { lastSide = side; clapFn(1); } else clapFn(0.75);
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
  // Online: finishing input setup marks you READY; the match begins once both
  // players are ready (synchronised by the host).
  if (state.pending && state.pending.online) { onlineReady(); return; }
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
    if (cfg.online) {
      // Forfeit an online match: tell the opponent, then bail.
      if (state.net) state.net.send({ t: "bye" });
      state._netMatchActive = false;
      closeNet();
    }
    if (state.match) state.match.abort();
    cleanupInputs();
    navTo("lobby");
  });

  // Countdown, then start
  // Equip the player's Goon loadout into this match (capped effects).
  cfg.loadoutMods = buildMods(state.profile.goons.loadout, { mode: cfg.mode, ranked: cfg.ranked });

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
    : "⌨️ Alternate F and J (two hands!) — or tap left/right — when it says GO";
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

  const aura = effectById(state.profile.equippedAura);

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
    clapFx(aura, rect.left + rect.width / 2, rect.top + rect.height / 2, strength, combo);
    if (state.camera.on) {
      camWindow.classList.add("pulse");
      clearTimeout(state._camPulse);
      state._camPulse = setTimeout(() => camWindow.classList.remove("pulse"), 130);
    }
    // Online: relay every clap (with the exact bar push) so both peers agree.
    if (cfg.online && state.net) state.net.send({ t: "c", s: strength, p: e.detail.push });
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

  // Live events: burst window / silence hazard banners
  match.addEventListener("event", (e) => {
    const t = e.detail.type;
    const stage = $(".clap-stage");
    if (stage) stage.classList.toggle("ev-burst", t === "burst");
    if (stage) stage.classList.toggle("ev-silence", t === "silence");
    if (t === "burst") { showBanner("⚡ BURST — DOUBLE POINTS!", "burst"); state.sfx.go(); }
    else if (t === "silence") { showBanner("🤫 SILENCE — STOP CLAPPING!", "silence"); state.sfx.lose(); }
  });

  // Perfect-timing pulse feedback
  match.addEventListener("perfect", () => {
    state.sfx.perfect();
    showHype("PERFECT!");
  });

  match.addEventListener("end", (result) => {
    cleanupInputs();
    const r = result.detail;

    // Online: let late claps cross the wire, then decide from synced totals so
    // both peers agree on the winner.
    if (cfg.online) {
      if (state.net) state.net.send({ t: "end" });
      const finalize = () => {
        const m = state.match;
        if (m) {
          r.won = state._foeLeft ? true : m.onlineVerdict() === 1;
          const tot = m.youPush + m.foePush || 1;
          r.margin = Math.round(Math.abs(m.youPush - m.foePush) / tot * 100);
          r.youBar = Math.round((m.youPush / tot) * 100);
          r.foeBar = 100 - r.youBar;
        }
        r.knockout = false;
        state._netMatchActive = false;
        finishMatch(r);
        closeNet();
      };
      state._foeLeft ? finalize() : setTimeout(finalize, 650);
      return;
    }

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

function showBanner(text, cls) {
  const host = $(".arena") || app;
  const el = document.createElement("div");
  el.className = `event-banner ${cls}`;
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => el.remove(), 1600);
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
  const prevLevel = levelFromXp(state.profile.xp);

  const report = applyMatchResult(state.profile, result);

  // Keyboard mode is far easier to spam than real claps, so it earns way less.
  const kbScale = state.inputMode === "keyboard" ? 0.3 : 1;
  result.inputMode = state.inputMode;

  // Jerk Coins for completing the game (boost/premium multipliers apply).
  const jcReport = earnJc(state.profile, result, 0, kbScale);
  if (result.won) { state.sfx.jcGain(); state.fx.coinRain(Math.min(40, 10 + Math.round(jcReport.total / 20))); }

  // Clap Coins (gacha currency) + economy-skill bonuses from the loadout.
  const mods = result.loadoutMods || buildMods(state.profile.goons.loadout, { mode: result.mode, ranked: result.ranked });
  const baseCoins = Math.round((30 + result.totalClaps * 0.6 + (result.won ? 20 : 6)) * kbScale);
  const coins = Math.round(baseCoins * (1 + (mods.coinPct || 0)));
  state.profile.goons.clapCoins = (state.profile.goons.clapCoins || 0) + coins;
  if (mods.dust) state.profile.goons.dust = (state.profile.goons.dust || 0) + mods.dust;
  result._clapCoins = coins;

  // Daily quest progress + title auto-unlocks + per-mode best.
  questProgress(state.profile, result);
  checkTitleUnlocks(prevLevel);
  const bests = state.profile.bests;
  let newBest = false;
  if (!result.hasOpponent && !result.practice) {
    if ((bests[result.mode] || 0) < result.score) { bests[result.mode] = result.score; newBest = true; }
  }
  saveProfile(state.profile);

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
// Accessibility application
// ---------------------------------------------------------------------------
function applyAccessibility() {
  const st = state.profile.settings;
  state.fx.userReduced = !!st.reducedMotion;
  // muteAll silences sfx entirely; otherwise honor sfxOn
  state.sfx.setEnabled(!st.muteAll && st.sfxOn);
}
applyAccessibility();

// ---------------------------------------------------------------------------
// Secret code entry (lobby keyhole)
// ---------------------------------------------------------------------------
function secretModal() {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h3>🔑 Secret Terminal</h3>
      <div class="modal-note">You found the hidden terminal. Enter a code…</div>
      <input type="text" class="text-input" id="sc-input" placeholder="enter code" autocomplete="off" />
      <div class="row" style="justify-content:flex-end;margin-top:16px">
        <button class="btn ghost" data-no>Close</button>
        <button class="btn" id="sc-ok">Enter</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const input = back.querySelector("#sc-input");
  input.focus();
  const submit = () => {
    const code = (input.value || "").trim().toUpperCase();
    back.remove();
    if (code === SECRET_JOWY) {
      grantTitle(state.profile, "jowy");
      state.profile.equippedTitle = "jowy";
      saveProfile(state.profile);
      state.sfx.win();
      state.fx.burst(innerWidth / 2, innerHeight / 2, effectById("poison"), 1, 12);
      toast("🟢 JOWY title unlocked — you stink (affectionately)", "🪰");
      navTo("lobby");
    } else if (code) {
      toast("Nothing happens…", "🔒");
    }
  };
  back.querySelector("#sc-ok").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-no]")) back.remove(); });
}

// ---------------------------------------------------------------------------
// Onboarding tutorial
// ---------------------------------------------------------------------------
function showTutorial() {
  let step = 0;
  const back = document.createElement("div");
  back.className = "modal-back tut-back";
  document.body.appendChild(back);
  const render = () => {
    back.innerHTML = renderTutorial(step);
    back.querySelector("#tut-next").addEventListener("click", () => {
      state.sfx.click();
      if (step >= 4) { finish(); } else { step++; render(); }
    });
    back.querySelector("#tut-skip").addEventListener("click", finish);
  };
  const finish = () => {
    back.remove();
    state.profile.tutorialSeen = true;
    saveProfile(state.profile);
  };
  render();
}

// ---------------------------------------------------------------------------
// Title auto-unlock notifications
// ---------------------------------------------------------------------------
function checkTitleUnlocks(prevLevel) {
  const level = levelFromXp(state.profile.xp);
  const before = new Set(unlockedTitles(state.profile, prevLevel).map((t) => t.id));
  const now = unlockedTitles(state.profile, level);
  now.forEach((t) => { if (!before.has(t.id)) toast(`New title unlocked — ${t.name}`, "🏷️"); });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
initParticles(state.profile.settings.reducedMotion);
ensureQuests(state.profile);
navTo("lobby");
refreshHud();
if (state.profile.settings.musicOn && !state.profile.settings.muteAll) musicBtn.classList.add("playing");
if (!state.profile.tutorialSeen) setTimeout(showTutorial, 500);

// Expose for debugging
window.JERKMANIA = state;
