import cfg from "./config.js";
import { createBackend, previewEarn, boostOn, BOARDS, localDay } from "./backend.js";
import { RANKS, rankFor, levelFor, THEMES, ITEMS, item, titleName, EXERCISES, KINDS, recordMeta, achievement, unlockName, showcaseSlots, SLOTS } from "./catalog.js";
import { createTracker } from "./tracker.js";
import { createSpotify } from "./spotify.js";
import { $, esc, fmt, clock, relTime, dayLabel, icon, hydrateIcons, emblem, toast, openSheet, closeSheet, avatarHTML, nameHTML, rankHTML } from "./ui.js";
import { renderStore, renderLocker, bindStore } from "./store.js";
import { loadProgression, bindProgression } from "./progression.js";
import { loadSocial, bindSocial, refreshSocialBadge } from "./social.js";
import { loadGuild, bindGuild, guildBoardHTML } from "./guild.js";
import { loadBoss, bindBoss, bossCardHTML, invalidateBoss } from "./boss.js";
import { seasonBoardHTML, bindSeason } from "./season.js";
import { sfx } from "./sfx.js";
import { loadHub, bindHub } from "./hub.js";
import { loadQuests, bindQuests, refreshQuestBadge } from "./quests.js";

// ------------------------------------------------------------------ helpers
const store = {
  get(k, d) { try { const v = localStorage.getItem("repforge-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("repforge-" + k, JSON.stringify(v)); } catch (e) {} }
};
const exName = (k) => EXERCISES[k].name.toLowerCase();

// ------------------------------------------------------------------ state
const backend = createBackend(cfg);
const spotify = createSpotify(cfg.SPOTIFY_CLIENT_ID);
const prefs = Object.assign({ voice: true, sfx: true }, store.get("prefs", {}));
let me = null, view = "train", board = store.get("board", null);
let ex = "push", count = 0, source = null, setStart = 0, lastTap = 0, busy = false, wake = null;
let music = null, musicOn = false;

const stage = $("#stage");
const tracker = createTracker({
  video: $("#video"), canvas: $("#canvas"), stage,
  accent: () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff8a3d",
  onRep: () => addRep(),
  onPhase: (t) => { $("#phase").textContent = t; },
  onMeter: (f) => { $("#meter").style.height = Math.max(0, Math.min(1, f)) * 100 + "%"; },
  onStatus: (s) => {
    if (s.msg) $("#coverText").textContent = s.msg;
    if (s.live) { $("#cover").hidden = true; $("#liveTag").hidden = false; refreshSetButtons(); }
    if (s.error) { source = null; showCover(s.error, true); }
  }
});

// ------------------------------------------------------------------ theme + header
function applyTheme(id) {
  const t = THEMES[id] || THEMES.ember;
  document.documentElement.style.setProperty("--accent", t.color);
  document.documentElement.style.setProperty("--accent-ink", t.ink);
  $('meta[name="theme-color"]').setAttribute("content", "#090b10");
}

function renderHeader() {
  if (!me) return;
  applyTheme(me.theme);
  $("#hAvatar").innerHTML = avatarHTML(me);
  $("#hName").textContent = me.username;
  $("#hTitle").textContent = titleName(me.title);
  const L = levelFor(me.xp);
  $("#hLvl").textContent = L.level;
  $("#hLvlRing").setAttribute("stroke-dasharray", `${(L.frac * 106.8).toFixed(1)} 107`);
  $("#hGrit").textContent = fmt(me.grit);
  $("#sGrit").textContent = fmt(me.grit);
}
function bumpGrit() { const p = $("#hGritPill"); p.classList.remove("pop"); void p.offsetWidth; p.classList.add("pop"); }

function setMe(p) { if (!p) return; me = p; renderHeader(); renderView(); }
const appCtx = { backend, me: () => me, applyTheme: () => me && applyTheme(me.theme),
  setMe: (p) => { me = p; renderHeader(); if (view === "train" || view === "store" || view === "me") renderView(); } };

// ------------------------------------------------------------------ routing
const VIEWS = ["train", "hub", "quests", "friends", "guild", "boss", "skills", "ranks", "store", "me"];
function go(v, push = true) {
  if (!VIEWS.includes(v)) v = "train";
  view = v;
  for (const x of VIEWS) $("#view-" + x).hidden = x !== v;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.go === v ? "page" : "false"));
  if (push && location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  window.scrollTo({ top: 0 });
  renderView();
  if (v === "ranks") loadBoard();
  if (v === "hub" && me) loadHub(appCtx);
  if (v === "quests" && me) loadQuests(appCtx);
  if (v === "skills" && me) loadProgression(appCtx);
  if (v === "friends" && me) loadSocial(appCtx);
  if (v === "guild" && me) loadGuild(appCtx);
  if (v === "boss" && me) loadBoss(appCtx);
  document.querySelector(".tab.mob")?.setAttribute("aria-current", ["skills", "store", "me", "guild", "boss"].includes(v) ? "page" : "false");
}
function renderView() {
  if (!me) return;
  if (view === "train") renderTrain();
  else if (view === "store") renderStore(appCtx);
  else if (view === "me") renderMe();
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]"); if (g) { if (g.closest("#sheet")) closeSheet(); go(g.dataset.go); return; }
  if (e.target.closest("[data-more]")) openSheet(`<span class="eyebrow">More</span><div class="more-grid">
    <button class="panel more-item" type="button" data-go="boss">${icon("skull")}<b>World boss</b><small>Fight it with everyone</small></button>
    <button class="panel more-item" type="button" data-go="guild">${icon("shield")}<b>Guild</b><small>Train as a team</small></button>
    <button class="panel more-item" type="button" data-go="skills">${icon("tree")}<b>Skills</b><small>Skill tree and achievements</small></button>
    <button class="panel more-item" type="button" data-go="store">${icon("bag")}<b>Store</b><small>Boosts and cosmetics</small></button>
    <button class="panel more-item" type="button" data-go="me">${icon("user")}<b>Profile</b><small>Locker, showcase, settings</small></button></div>
    <button class="btn ghost" type="button" data-close>Close</button>`, "More");
});
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"][data-go]')) { e.preventDefault(); go(e.target.dataset.go); } });
window.addEventListener("hashchange", () => go(location.hash.slice(1), false));

// ------------------------------------------------------------------ train
function renderTrain() {
  const r = rankFor(me.rp);
  $("#rankCard").style.setProperty("--tc", r.tier.color);
  $("#rcEmblem").innerHTML = emblem(r);
  $("#rcName").textContent = r.name;
  $("#rcRp").textContent = fmt(me.rp) + " RP";
  $("#rcBar").style.width = (r.frac * 100).toFixed(1) + "%";
  $("#rcNext").textContent = r.next ? `${fmt(r.toNext)} RP to ${r.next.name}` : "Top rank. Defend it.";

  const canDaily = !me.last_daily || me.last_daily < localDay();
  $("#daily").hidden = !canDaily;
  if (canDaily) $("#dailyAmt").textContent = `+${50 + 10 * Math.min(me.streak, 10)} Grit` + (me.streak > 1 ? ` · ${me.streak}-day streak bonus` : "");

  renderBoostChips();
  renderSpotify();
  refreshSetButtons();
  loadRecent();
  bossCardHTML(appCtx).then((h) => { $("#bossMini").innerHTML = h; $("#bossMini").hidden = !h; });
}

function renderBoostChips() {
  if (!me) return;
  const chips = [];
  for (const id of ["grit2x", "xpsurge", "rankrush"]) {
    if (boostOn(me.boosts, id)) {
      const left = (new Date(me.boosts[id]) - Date.now()) / 1000, it = item(id);
      chips.push(`<span class="chip">${icon(it.icon)}${esc(it.name)} <span class="num">${clock(left)}</span></span>`);
    }
  }
  const sh = Number(me.boosts?.shield || 0);
  if (sh) chips.push(`<span class="chip">${icon("shield")}${sh} Streak Shield${sh > 1 ? "s" : ""}</span>`);
  if (me.streak) chips.push(`<span class="chip">${icon("flame")}${me.streak}-day streak</span>`);
  if (musicOn) chips.push(`<span class="chip music">${icon("music")}Music +10% Grit</span>`);
  $("#activeBoosts").innerHTML = chips.join("");
}

function preview() { return previewEarn(me, { kind: ex, reps: count, source: source || "cam", music: musicOn }); }
function refreshSetButtons() {
  $("#undoBtn").disabled = count === 0;
  $("#finishBtn").disabled = count === 0 || busy;
  $("#stopBtn").disabled = !source;
  $("#stopBtn").innerHTML = source === "cam" ? icon("flip") + "Flip" : "Stop";
  $("#stopBtn").setAttribute("aria-label", source === "cam" ? "Switch camera" : "Stop counting");
  if (me) {
    const p = preview();
    $("#finishPreview").textContent = count ? `+${fmt(p.grit)} Grit · +${fmt(p.rp)} RP` : (source ? "Do a rep to start" : "Start the camera or tap mode");
  }
}

function setExercise(m) {
  if (ex === m) return;
  if (count && !confirmSwitch) { confirmSwitch = true; toast("Switching resets this set. Tap again to switch."); setTimeout(() => confirmSwitch = false, 3000); return; }
  confirmSwitch = false;
  ex = m;
  for (const k of KINDS) $("#ex" + k[0].toUpperCase() + k.slice(1)).setAttribute("aria-pressed", m === k);
  tracker.setMode(m); resetSet();
  if (!source) $("#coverText").textContent = COVER[m];
}
let confirmSwitch = false;
const COVER = {
  push: "Put your phone down side-on, about 2 m away, so it sees your whole body.",
  sit: "Phone side-on at floor level, whole body in frame. Counts when your torso comes upright.",
  squat: "Phone side-on at hip height, about 2.5 m away, head to feet in frame. Counts when your knees bend past 90° and you stand tall."
};
$("#exPush").addEventListener("click", () => setExercise("push"));
$("#exSit").addEventListener("click", () => setExercise("sit"));
$("#exSquat").addEventListener("click", () => setExercise("squat"));

function showCover(text, isErr) {
  $("#cover").hidden = false; $("#liveTag").hidden = true; stage.classList.remove("tapmode");
  const p = $("#coverText"); p.textContent = text; p.classList.toggle("err", !!isErr);
  $("#camBtn").disabled = false; refreshSetButtons();
}

async function keepAwake() { try { wake = await navigator.wakeLock?.request("screen"); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && source) keepAwake(); });

$("#camBtn").addEventListener("click", async () => {
  $("#camBtn").disabled = true; $("#coverText").classList.remove("err");
  try { await tracker.start(); source = "cam"; keepAwake(); refreshSetButtons(); }
  catch (e) { source = null; showCover(e.message || String(e), true); }
});
$("#tapBtn").addEventListener("click", () => {
  source = "tap"; $("#cover").hidden = true; stage.classList.add("tapmode");
  $("#phase").textContent = "Tap the screen for each rep"; keepAwake(); refreshSetButtons();
});
stage.addEventListener("pointerdown", (e) => {
  if (source !== "tap" || e.target.closest(".cover")) return;
  const now = performance.now();
  if (now - lastTap < 500) return; // max 2 reps a second, same as the server rule
  lastTap = now; addRep();
});
$("#stopBtn").addEventListener("click", async () => {
  if (source === "cam") { try { await tracker.flip(); } catch (e) { toast(e.message, "bad"); } return; }
  stopCounting();
});
function stopCounting() {
  if (source === "cam") tracker.stop();
  source = null;
  try { wake?.release(); } catch (e) {}
  showCover(count ? "Paused. Finish the set to bank it, or start again to keep counting." : COVER[ex]);
}

function addRep() {
  if (!setStart) setStart = Date.now();
  count++;
  const c = $("#count"); c.textContent = count; c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  stage.classList.remove("hit"); void stage.offsetWidth; stage.classList.add("hit");
  try { navigator.vibrate?.(25); } catch (e) {}
  if (prefs.voice && "speechSynthesis" in window) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(String(count)); u.rate = 1.25; speechSynthesis.speak(u); } catch (e) {}
  } else beep();
  refreshSetButtons();
}
let actx = null;
function beep() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.18, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.13);
  } catch (e) {}
}
$("#undoBtn").addEventListener("click", () => { if (count) { count--; $("#count").textContent = count; if (!count) setStart = 0; refreshSetButtons(); } });

function resetSet() { count = 0; setStart = 0; $("#count").textContent = "0"; $("#timer").textContent = "0:00"; tracker.reset(); refreshSetButtons(); }

$("#finishBtn").addEventListener("click", async () => {
  if (!count || busy) return;
  busy = true; refreshSetButtons();
  const before = me, reps = count, kind = ex, src = source || "cam";
  const secs = Math.round((Date.now() - setStart) / 1000) + 1;
  try {
    const res = await backend.submitSet({ kind, reps, secs, source: src, music: musicOn });
    me = res.profile; renderHeader(); bumpGrit();
    resetSet();
    showReward(before, res, { kind, reps, secs });
    invalidateBoss();
    if (res.contrib?.boss_fell) setTimeout(() => { sfx("boss"); toast("The world boss has fallen! Claim your reward on the Boss page.", "good"); }, 900);
    renderTrain();
    refreshQuestBadge(appCtx);
  } catch (e) { toast(e.message || String(e), "bad"); }
  busy = false; refreshSetButtons();
});

async function loadRecent() {
  try {
    const rows = await backend.recentSets();
    $("#recent").innerHTML = rows.length ? rows.map((s) => `<li><span><b>${s.reps}</b> ${exName(s.kind)}${s.source === "tap" ? '<span class="tag">TAP</span>' : ""}</span><span>+${s.grit} Grit · ${relTime(s.created_at)}</span></li>`).join("")
      : `<li class="empty">No sets yet. Your first one unlocks the “First Rep” title.</li>`;
  } catch (e) { $("#recent").innerHTML = `<li class="empty">Couldn’t load recent sets.</li>`; }
}

$("#daily").addEventListener("click", async () => {
  try { const r = await backend.claimDaily(); setMe(r.profile); bumpGrit(); toast(`+${r.amount} Grit claimed`, "good"); }
  catch (e) { toast(e.message, "bad"); }
});

// ------------------------------------------------------------------ reward sheet
function showReward(before, res, set) {
  const e = res.earned, r0 = rankFor(before.rp), r1 = rankFor(me.rp), L0 = levelFor(before.xp).level, L1 = levelFor(me.xp).level;
  const promoted = r1.i > r0.i, recs = res.records || [];
  const recHtml = recs.map((r) => { const m = recordMeta(r.key), f = (v) => m.unit === "time" ? clock(v) : fmt(v);
    return `<div class="record-hit"><span class="rh-tag">New record</span><b>${esc(m.label)}</b><span class="rh-vals"><s>${f(r.prev)}</s>${icon("chev")}<strong>${f(r.value)}</strong></span></div>`; }).join("");
  const unlocks = (res.unlocks || []).map((id) => { const a = achievement(id), isTitle = item(id)?.kind === "title";
    const extra = ITEMS.filter((it) => it.granted_by === id && it.kind !== "title").map((it) => it.name).join(", ");
    return `<div class="unlock">${icon("trophy")}<div><b>${esc(unlockName(id))}</b><small>Achievement · +${a ? a.grit : 100} Grit${isTitle ? " · new title" : ""}${extra ? ` · ${esc(extra)}` : ""}</small></div>${isTitle ? `<button class="btn sm" data-equip="${id}" type="button">Equip</button>` : ""}</div>`; }).join("");
  const sheet = $("#sheet");
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="rwTitle">
    <h2 id="rwTitle">${promoted ? "Ranked up" : recs.length ? "New record" : "Set banked"}</h2>
    <p class="lead">${set.reps} ${exName(set.kind)} in ${clock(set.secs)}</p>
    <div class="earn">
      <div class="g"><b class="num" data-to="${e.grit + (e.bonus || 0)}">0</b><span>Grit</span></div>
      <div><b class="num" data-to="${e.xp}">0</b><span>XP</span></div>
      <div class="r"><b class="num" data-to="${e.rp}">0</b><span>Rank pts</span></div>
    </div>
    ${recHtml}
    ${res.contrib && (res.contrib.boss_damage || res.contrib.season_points || res.contrib.guild_contrib) ? `<div class="contrib-row">
      ${res.contrib.boss_damage ? `<span>${icon("skull")}<b>−${fmt(res.contrib.boss_damage)}</b> boss HP</span>` : ""}
      ${res.contrib.season_points ? `<span>${icon("trophy")}<b>+${fmt(res.contrib.season_points)}</b> season pts</span>` : ""}
      ${res.contrib.guild_contrib ? `<span>${icon("shield")}<b>+${fmt(res.contrib.guild_contrib)}</b> guild XP</span>` : ""}</div>` : ""}
    ${promoted ? `<div class="promo" style="--tc:${r1.tier.color}">${emblem(r1, "lg")}<div><b>${esc(r1.name)}</b><small>Promoted from ${esc(r0.name)}</small></div></div>` : ""}
    ${L1 > L0 ? `<div class="unlock" style="border-color:var(--accent)">${icon("bolt")}<div><b>Level ${L1}</b><small>You levelled up</small></div></div>` : ""}
    ${unlocks}
    <div style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--muted);font-weight:700"><span>${esc(r1.name)}</span><span>${r1.next ? fmt(r1.toNext) + " RP to " + esc(r1.next.name) : "Max rank"}</span></div>
      <div class="bar" style="--accent:${r1.tier.color}"><i id="rwBar" style="width:${promoted ? 0 : (r0.frac * 100).toFixed(1)}%"></i></div>
    </div>
    <button class="btn primary" type="button" id="rwClose">Keep going</button>
  </div>`;
  hydrateIcons(sheet);
  sheet.hidden = false;
  sfx(promoted || L1 > L0 ? "levelup" : recs.length ? "unlock" : "set");
  requestAnimationFrame(() => requestAnimationFrame(() => { const b = $("#rwBar"); if (b) b.style.width = (r1.frac * 100).toFixed(1) + "%"; }));
  sheet.querySelectorAll("[data-to]").forEach((el) => countUp(el, +el.dataset.to));
  $("#rwClose").focus();
}
function countUp(el, to) {
  const t0 = performance.now(), d = 700;
  const step = (t) => { const k = Math.min(1, (t - t0) / d); el.textContent = "+" + fmt(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
$("#sheet").addEventListener("click", async (e) => {
  if (e.target.id === "sheet" || e.target.id === "rwClose" || e.target.closest("[data-close]")) { closeSheet(); return; }
  const eq = e.target.closest("[data-equip]");
  if (eq) { await equip(eq.dataset.equip); eq.outerHTML = `<span class="meta on">Equipped</span>`; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

// ------------------------------------------------------------------ spotify
function renderSpotify() {
  const el = $("#spotify");
  if (!spotify.configured) {
    el.innerHTML = `<div class="sp-art">${icon("music")}</div><div class="sp-body"><span class="sp-title">Music boost</span><span class="sp-sub">+10% Grit while Spotify plays. Set it up in Profile → Settings.</span></div>`;
    return;
  }
  if (!spotify.connected) {
    el.innerHTML = `<div class="sp-art">${icon("music")}</div><div class="sp-body"><span class="sp-title">Connect Spotify</span><span class="sp-sub">See what’s playing, skip tracks, earn +10% Grit</span></div><button class="btn sm" type="button" id="spConnect" style="background:var(--good);border-color:var(--good);color:#04170e">Connect</button>`;
    $("#spConnect").onclick = () => spotify.connect().catch((e) => toast(e.message, "bad"));
    return;
  }
  const m = music;
  el.innerHTML = `<div class="sp-art" style="${m?.art ? `background-image:url('${esc(m.art)}')` : ""}">${m?.art ? "" : icon("music")}</div>
    <div class="sp-body"><span class="sp-title">${esc(m ? m.title : "Nothing playing")}</span><span class="sp-sub">${esc(m ? m.artist + (m.device ? " · " + m.device : "") : "Start music in Spotify, it shows up here")}</span>
    <div class="bar"><i style="width:${m && m.duration ? Math.min(100, m.progress / m.duration * 100).toFixed(1) : 0}%"></i></div></div>
    <div class="sp-ctl"><button class="icon-btn" data-sp="prev" type="button" aria-label="Previous track">${icon("prev")}</button>
    <button class="icon-btn play" data-sp="${m?.playing ? "pause" : "play"}" type="button" aria-label="${m?.playing ? "Pause" : "Play"}">${icon(m?.playing ? "pause" : "play")}</button>
    <button class="icon-btn" data-sp="next" type="button" aria-label="Next track">${icon("next")}</button></div>`;
}
$("#spotify").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-sp]"); if (!b) return;
  try { await spotify[b.dataset.sp](); setTimeout(pollSpotify, 400); } catch (err) { toast(err.message, "bad"); }
});
async function pollSpotify() {
  if (!spotify.connected || document.hidden) return;
  try { music = await spotify.nowPlaying(); }
  catch (e) { music = null; if (/refused|expired|invalid/i.test(e.message)) { toast(e.message, "bad"); } }
  const was = musicOn; musicOn = !!music?.playing;
  if (view === "train") { renderSpotify(); if (was !== musicOn) { renderBoostChips(); refreshSetButtons(); } }
}

// ------------------------------------------------------------------ leaderboards
function renderBoardTabs() {
  $("#lbSeg").innerHTML = Object.entries(BOARDS).filter(([, b]) => !b.online || backend.mode === "online").map(([k, b]) => `<button type="button" data-board="${k}" aria-pressed="${k === board}">${b.label}</button>`).join("");
}
$("#lbSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-board]"); if (b) { board = b.dataset.board; store.set("board", board); renderBoardTabs(); loadBoard(); } });
$("#lbRefresh").addEventListener("click", () => loadBoard());

const unitFor = (b) => b === "rank" ? "RP" : "reps";
const nameColor = (theme) => (THEMES[theme] || THEMES.ember).color;
let boardReq = 0;
async function loadBoard() {
  const req = ++boardReq;
  if (!board || !BOARDS[board] || (BOARDS[board].online && backend.mode !== "online")) board = backend.mode === "online" ? "season" : "weekly";
  renderBoardTabs();
  $("#podium").innerHTML = ""; $("#lbMe").hidden = true;
  const special = board === "season" || board === "guilds";
  $("#lbSpecial").hidden = !special; $("#lbList").parentElement.hidden = special; $("#podium").hidden = special;
  $("#netTag").textContent = backend.mode === "online" ? "Live" : "Local"; $("#netTag").classList.toggle("on", backend.mode === "online");
  if (special) {
    $("#lbNote").textContent = "";
    $("#lbSpecial").innerHTML = '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:200px"></div>';
    try { const h = board === "season" ? await seasonBoardHTML(appCtx) : await guildBoardHTML(appCtx); if (req === boardReq) { $("#lbSpecial").innerHTML = h; hydrateIcons($("#lbSpecial")); } }
    catch (e) { if (req === boardReq) $("#lbSpecial").innerHTML = `<p class="note">Couldn’t load: ${esc(e.message)}</p>`; }
    return;
  }
  $("#lbList").innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
  try {
    const { rows, me: mine } = await backend.leaderboard(board, me);
    if (req !== boardReq) return;
    const unit = unitFor(board);
    const top = rows.slice(0, 3), rest = rows.slice(3);
    const order = [top[1], top[0], top[2]];
    $("#podium").innerHTML = rows.length >= 3 ? order.map((r, i) => r ? `<div class="panel pod p${[2, 1, 3][i]} ${backend.mode === "online" && r.id !== me?.id ? "clickable" : ""}" ${backend.mode === "online" && r.id !== me?.id ? `data-player="${esc(r.id)}"` : ""}>
        <span class="place">${[2, 1, 3][i]}</span>${avatarHTML(r, "lg")}${rankHTML(r, "sm")}
        <span class="nm" style="color:${nameColor(r.theme)}">${nameHTML(r)}</span><span class="tt">${esc(titleName(r.title))}</span>
        <span class="val">${fmt(r.value)}<span class="unit">${unit}</span></span></div>` : "<div></div>").join("") : "";
    const list = rows.length >= 3 ? rest : rows;
    const start = rows.length >= 3 ? 4 : 1;
    $("#lbList").innerHTML = list.length ? list.map((r, i) => row(r, start + i, unit, r.id === me?.id)).join("")
      : (rows.length ? "" : `<li class="empty" style="display:block">${board === "weekly" ? "No sets this week yet. Bank one and take #1." : "No players yet. Be the first."}</li>`);
    const inList = rows.some((r) => r.id === me?.id);
    if (mine && mine.pos && !inList) {
      $("#lbMe").innerHTML = row({ ...me, value: mine.value }, mine.pos, unit, true, true);
      $("#lbMe").hidden = false;
    }
    $("#netTag").textContent = backend.mode === "online" ? "Live" : "Local";
    $("#netTag").classList.toggle("on", backend.mode === "online");
    $("#lbNote").textContent = backend.mode === "online"
      ? "Weekly board covers the last 7 days. Tap-counted sets earn half rank points."
      : "Local mode: only you are on this board. Add your Supabase keys in js/config.js to go public.";
  } catch (e) {
    if (req !== boardReq) return;
    $("#lbList").innerHTML = `<li class="empty" style="display:block">Couldn’t load the leaderboard: ${esc(e.message)}</li>`;
  }
}
function row(r, pos, unit, mine, bare) {
  const inner = `<span class="pos">${pos}</span>${avatarHTML(r, "sm")}<span class="who-c"><span class="nm" style="color:${nameColor(r.theme)}">${nameHTML(r)}${mine ? " (you)" : ""}</span><span class="tt">${esc(titleName(r.title))}</span></span><span class="val">${fmt(r.value)}<span class="unit">${unit}</span></span>`;
  const link = backend.mode === "online" && !mine ? ` data-player="${esc(r.id)}" tabindex="0"` : "";
  return bare ? inner : `<li class="${mine ? "mine" : ""} ${link ? "clickable" : ""}"${link}>${inner}</li>`;
}

// ------------------------------------------------------------------ equip (reward sheet)
async function equip(id) {
  try { const r = await backend.equip(id); setMe(r.profile); toast(`${item(id).name} equipped`, "good"); }
  catch (err) { toast(err.message, "bad"); }
}

// ------------------------------------------------------------------ profile
function renderMe() {
  const r = rankFor(me.rp), L = levelFor(me.xp);
  $("#hero").setAttribute("data-bg", me.background || "none");
  $("#hero").innerHTML = `<div class="hero-in">${avatarHTML(me, "xl")}
    <div class="hero-body">${nameHTML(me)}<span class="hero-title">${me.title && me.title !== "none" ? esc(titleName(me.title)) : ""}</span>
    <div class="hero-lvl"><span>Lv ${L.level}</span><div class="bar"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div><span class="num">${fmt(L.into)}/${fmt(L.need)} XP</span></div></div>
    <div class="hero-rank">${rankHTML(me, "lg")}<small>${esc(r.name)}</small></div></div>`;
  renderShowcase();
  const stats = [["Total reps", me.total_reps ?? me.total_push + me.total_sit + (me.total_squat || 0)], ["Push-ups", me.total_push], ["Sit-ups", me.total_sit], ["Squats", me.total_squat || 0], ["Best set", me.best_set], ["Sets", me.sets_count], ["Day streak", me.streak], ["Quests done", me.quests_done || 0], ["Rest days", me.rest_count || 0]];
  $("#stats").innerHTML = stats.map(([k, v]) => `<div class="panel stat"><b>${fmt(v)}</b><span>${k}</span></div>`).join("");
  renderLocker(appCtx);
  $("#ladder").innerHTML = RANKS.slice().reverse().map((x) => `<li class="${x.i === r.i ? "cur" : x.i < r.i ? "done" : ""}">${emblem(x, "sm")}<span>${esc(x.name)}</span><span>${fmt(x.rp)} RP</span></li>`).join("");
  renderSettings();
}

// Achievement showcase (Steam-style): 1 slot, 3 with the Showcase skill.
function renderShowcase() {
  const slots = showcaseSlots(me), ids = (me.showcase || []).filter((id) => achievement(id));
  $("#showcase").innerHTML = Array.from({ length: slots }, (_, i) => {
    const a = achievement(ids[i]);
    return a ? `<div class="sc-item">${icon("trophy")}<b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`
      : `<button class="sc-item empty" type="button" data-edit-showcase>${icon("sparkle")}<small>Empty slot</small></button>`;
  }).join("") + (slots < 3 ? `<div class="sc-item hint">${icon("lock")}<small>Unlock the Showcase skill for 3 slots</small></div>` : "");
}
async function editShowcase() {
  let got;
  try { got = (await backend.getAchievements()).unlocked; } catch (e) { toast(e.message, "bad"); return; }
  const slots = showcaseSlots(me), chosen = new Set((me.showcase || []).filter((id) => got.some((u) => u.id === id)));
  const sheet = openSheet(`<span class="eyebrow">Showcase</span><h2>Pick ${slots === 1 ? "1 achievement" : `up to ${slots}`}</h2>
    <div class="sc-pick" id="scPick">${got.length ? got.map((u) => { const a = achievement(u.id); return `<button class="tpill" type="button" data-sc="${u.id}" aria-pressed="${chosen.has(u.id)}">${icon("trophy")}${esc(a.name)}</button>`; }).join("")
      : `<p class="note">Unlock achievements in Progression first.</p>`}</div>
    <button class="btn primary" type="button" id="scSave">Save showcase</button><button class="btn ghost" type="button" data-close>Cancel</button>`, "Showcase");
  sheet.querySelector("#scPick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sc]"); if (!b) return;
    const id = b.dataset.sc;
    if (chosen.has(id)) chosen.delete(id);
    else { if (slots === 1) chosen.clear(); if (chosen.size >= slots) { toast(`You can show ${slots}`); return; } chosen.add(id); }
    sheet.querySelectorAll("[data-sc]").forEach((x) => x.setAttribute("aria-pressed", chosen.has(x.dataset.sc)));
  });
  sheet.querySelector("#scSave").addEventListener("click", async () => {
    try { const r = await backend.setShowcase([...chosen]); setMe(r.profile); closeSheet(); toast("Showcase saved", "good"); } catch (e) { toast(e.message, "bad"); }
  });
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-edit-showcase]")) editShowcase(); });

async function renderSettings() {
  const online = backend.mode === "online";
  const sp = !spotify.configured
    ? `<div><b>Spotify</b><small>Add your Spotify Client ID to <code>js/config.js</code> and this Redirect URI in the Spotify dashboard: <code>${esc(spotify.redirectUri)}</code></small></div>`
    : `<div><b>Spotify</b><small>${spotify.connected ? "Connected. +10% Grit while music plays." : "Show what’s playing and control it from the Train tab."}</small></div>
       <button class="btn sm" type="button" id="spToggle">${spotify.connected ? "Disconnect" : "Connect"}</button>`;
  $("#settings").innerHTML = `
    <div class="row"><div><b>Say each rep out loud</b><small>Beeps instead when off</small></div><label class="switch"><input type="checkbox" id="setVoice" ${prefs.voice ? "checked" : ""}><span></span></label></div>
    <div class="row"><div><b>Sound effects</b><small>Rewards, level-ups, purchases and bosses</small></div><label class="switch"><input type="checkbox" id="setSfx" ${prefs.sfx !== false ? "checked" : ""}><span></span></label></div>
    <div class="row">${sp}</div>
    <div class="row"><div><b>Player name</b><small>Shown on the leaderboards</small></div>
      <form class="field" id="renameForm"><input id="renameInput" maxlength="16" value="${esc(me.username)}" aria-label="Player name"><button class="btn sm" type="submit">Save</button></form></div>
    <div class="row"><div><b>${online ? "Public account" : "Local mode"}</b><small id="acctNote">${online ? "Your sets count on the public leaderboards." : "Progress stays on this device. Add Supabase keys in js/config.js to make leaderboards public."}</small></div></div>
    ${online ? `<div class="row"><div><b>Keep your account</b><small id="emailNote">Add an email so you can sign in on another phone. Without one, clearing this browser loses the account.</small></div>
      <form class="field" id="emailForm"><input id="emailInput" type="email" placeholder="you@example.com" aria-label="Email" autocomplete="email"><button class="btn sm" type="submit">Save</button></form>
      <button class="btn sm ghost" type="button" id="emailSignIn">Sign in with email instead</button></div>` : ""}`;
  $("#setVoice").onchange = (e) => { prefs.voice = e.target.checked; store.set("prefs", prefs); };
  $("#setSfx").onchange = (e) => { prefs.sfx = e.target.checked; store.set("prefs", prefs); if (prefs.sfx) sfx("coin"); };
  const t = $("#spToggle");
  if (t) t.onclick = () => { if (spotify.connected) { spotify.disconnect(); music = null; musicOn = false; renderSettings(); toast("Spotify disconnected"); } else spotify.connect().catch((e) => toast(e.message, "bad")); };
  $("#renameForm").onsubmit = async (e) => {
    e.preventDefault();
    try { const p = await backend.createProfile($("#renameInput").value.trim()); setMe(p); toast("Name saved", "good"); } catch (err) { toast(err.message, "bad"); }
  };
  if (online) {
    const em = await backend.email().catch(() => null);
    if (em) $("#emailNote").textContent = `Saved to ${em}. Use “Sign in with email” on another device.`;
    $("#emailForm").onsubmit = async (e) => {
      e.preventDefault();
      try { await backend.linkEmail($("#emailInput").value.trim()); toast("Check your inbox to confirm the email", "good"); } catch (err) { toast(err.message, "bad"); }
    };
    $("#emailSignIn").onclick = async () => {
      const v = $("#emailInput").value.trim();
      if (!v) { toast("Type the email you saved first"); $("#emailInput").focus(); return; }
      try { await backend.signInEmail(v); toast("Sign-in link sent. Open it on this device.", "good"); } catch (err) { toast(err.message, "bad"); }
    };
  }
}

// ------------------------------------------------------------------ ticking clock
setInterval(() => {
  if (setStart && count) $("#timer").textContent = clock((Date.now() - setStart) / 1000);
  if (!me) return;
  if (view === "train") renderBoostChips();
  if (view === "store") document.querySelectorAll("[data-boost-meta]").forEach((el) => {
    const id = el.dataset.boostMeta;
    if (id !== "shield" && boostOn(me.boosts, id)) el.textContent = `Active · ${clock((new Date(me.boosts[id]) - Date.now()) / 1000)} left · buying adds time`;
  });
}, 1000);
setInterval(pollSpotify, 5000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollSpotify(); });

// ------------------------------------------------------------------ boot
async function syncTimezone() {
  // Days (quests, streaks, calendar) reset at the player's local midnight.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (backend.mode === "online" && tz && me && me.tz !== tz) { const p = await backend.setTimezone(tz); if (p) me = p; }
  } catch (e) { /* changed recently: keep the saved zone */ }
}
async function boot() {
  hydrateIcons();
  bindHub(); bindQuests(); bindStore(appCtx); bindProgression(); bindSocial(appCtx); bindGuild(appCtx); bindBoss(appCtx); bindSeason(appCtx, () => loadBoard());
  const showNet = () => { $("#offline").hidden = navigator.onLine; };
  window.addEventListener("online", () => { showNet(); toast("Back online", "good"); if (me) renderView(); });
  window.addEventListener("offline", showNet); showNet();
  const net = backend.mode === "online";
  $("#navNet").textContent = net ? "Live leaderboards" : "Local mode";
  $("#navNet").classList.toggle("on", net);
  try { if (await spotify.handleRedirect()) toast("Spotify connected", "good"); } catch (e) { toast(e.message, "bad"); }
  try { me = await backend.init(); }
  catch (e) { toast("Couldn’t reach the leaderboard server: " + e.message, "bad"); }
  if (!me) {
    $("#onboard").hidden = false;
    if (backend.mode === "local") $("#obNote").textContent = "3-16 letters, numbers or underscores. Local mode: progress stays on this device.";
    setTimeout(() => $("#obName").focus(), 50);
  } else { await syncTimezone(); renderHeader(); }
  go(location.hash.slice(1) || "train", false);
  if (me) { refreshQuestBadge(appCtx); refreshSocialBadge(appCtx); setInterval(() => refreshSocialBadge(appCtx), 60000); }
  pollSpotify();
}
$("#onboardForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#obGo"); btn.disabled = true; btn.textContent = "Creating…";
  try {
    me = await backend.createProfile($("#obName").value.trim());
    $("#onboard").hidden = true; await syncTimezone(); renderHeader(); go("train"); refreshQuestBadge(appCtx);
    toast(`Welcome, ${me.username}. 150 Grit to start.`, "good");
  } catch (err) { toast(err.message, "bad"); }
  btn.disabled = false; btn.textContent = "Start training";
});

boot();
