import cfg from "./config.js";
import { createBackend, previewEarn, boostOn, BOARDS } from "./backend.js";
import { RANKS, rankFor, levelFor, THEMES, ITEMS, item, titleName } from "./catalog.js";
import { createTracker } from "./tracker.js";
import { createSpotify } from "./spotify.js";

// ------------------------------------------------------------------ helpers
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();
const clock = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const todayUTC = () => new Date().toISOString().slice(0, 10);
const store = {
  get(k, d) { try { const v = localStorage.getItem("repforge-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("repforge-" + k, JSON.stringify(v)); } catch (e) {} }
};

const ICONS = {
  coin: '<circle cx="12" cy="12" r="9" fill="currentColor" opacity=".18"/><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4M12 7.5v1.8M12 16.7v1.8"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6 1 6-1.5S14 4 12 8"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-7 0-3-1.6-5.2-3.5-7-.4 2-1.5 3-2.5 3 .5-3-1-6.5-4-9 0 4-5 6.5-5 13 0 4.2 3.5 7 8 7z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
  next: '<path d="M5 4v16l11-8zM19 4v16"/>',
  prev: '<path d="M19 4v16L8 12zM5 4v16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  flip: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2M14 9.5V11h-1.5M10 16.5V15h1.5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  check: '<path d="m5 12 5 5 9-10"/>'
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
function hydrateIcons(root = document) { root.querySelectorAll("svg[data-icon]").forEach((el) => { el.outerHTML = icon(el.dataset.icon); }); }

let emblemSeq = 0;
function emblem(rp, cls = "") {
  const r = typeof rp === "number" ? rankFor(rp) : rp, t = r.tier, id = "em" + (++emblemSeq);
  let mark;
  if (t.id === "rookie") mark = '<circle cx="32" cy="33" r="6" fill="#fff" opacity=".9"/>';
  else if (t.id === "legend") mark = '<path d="m32 18 4.2 8.6 9.5 1.4-6.9 6.7 1.6 9.4L32 39.6l-8.4 4.5 1.6-9.4-6.9-6.7 9.5-1.4z" fill="#fff"/>';
  else {
    const n = r.div, top = 33 - (n - 1) * 4.5;
    mark = Array.from({ length: n }, (_, i) => `<path d="M22 ${top + i * 9 + 4}l10-7 10 7" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  }
  return `<span class="emblem ${cls}" style="--tc:${t.color}" title="${esc(r.name)}"><svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.color}"/><stop offset="1" stop-color="${t.deep}"/></linearGradient></defs>
    <path d="M32 3 57 16v24L32 61 7 40V16z" fill="url(#${id})"/>
    <path d="M32 9 51 19v19L32 55 13 38V19z" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>
    ${mark}</svg></span>`;
}

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind; el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, kind === "bad" ? 4200 : 2600);
}

// ------------------------------------------------------------------ state
const backend = createBackend(cfg);
const spotify = createSpotify(cfg.SPOTIFY_CLIENT_ID);
const prefs = Object.assign({ voice: true }, store.get("prefs", {}));
let me = null, view = "train", board = store.get("board", "weekly");
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
  $("#hAvatar").textContent = me.username[0].toUpperCase();
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

// ------------------------------------------------------------------ routing
const VIEWS = ["train", "ranks", "store", "me"];
function go(v, push = true) {
  if (!VIEWS.includes(v)) v = "train";
  view = v;
  for (const x of VIEWS) $("#view-" + x).hidden = x !== v;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.go === v ? "page" : "false"));
  if (push && location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  window.scrollTo({ top: 0 });
  renderView();
  if (v === "ranks") loadBoard();
}
function renderView() {
  if (!me) return;
  if (view === "train") renderTrain();
  else if (view === "store") renderStore();
  else if (view === "me") renderMe();
}
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go); });
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

  const canDaily = me.last_daily !== todayUTC();
  $("#daily").hidden = !canDaily;
  if (canDaily) $("#dailyAmt").textContent = `+${50 + 10 * Math.min(me.streak, 10)} Grit` + (me.streak > 1 ? ` · ${me.streak}-day streak bonus` : "");

  renderBoostChips();
  renderSpotify();
  refreshSetButtons();
  loadRecent();
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
  $("#exPush").setAttribute("aria-pressed", m === "push"); $("#exSit").setAttribute("aria-pressed", m === "sit");
  tracker.setMode(m); resetSet();
  if (!source) $("#coverText").textContent = m === "push"
    ? "Put your phone down side-on, about 2 m away, so it sees your whole body."
    : "Phone side-on at floor level, whole body in frame. Counts when your torso comes upright.";
}
let confirmSwitch = false;
$("#exPush").addEventListener("click", () => setExercise("push"));
$("#exSit").addEventListener("click", () => setExercise("sit"));

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
  showCover(count ? "Paused. Finish the set to bank it, or start again to keep counting." : "Put your phone down side-on, about 2 m away, so it sees your whole body.");
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
    renderTrain();
  } catch (e) { toast(e.message || String(e), "bad"); }
  busy = false; refreshSetButtons();
});

async function loadRecent() {
  try {
    const rows = await backend.recentSets();
    $("#recent").innerHTML = rows.length ? rows.map((s) => `<li><span><b>${s.reps}</b> ${s.kind === "push" ? "push-ups" : "sit-ups"}${s.source === "tap" ? '<span class="tag">TAP</span>' : ""}</span><span>+${s.grit} Grit · ${relTime(s.created_at)}</span></li>`).join("")
      : `<li class="empty">No sets yet. Your first one unlocks the “First Rep” title.</li>`;
  } catch (e) { $("#recent").innerHTML = `<li class="empty">Couldn’t load recent sets.</li>`; }
}
function relTime(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

$("#daily").addEventListener("click", async () => {
  try { const r = await backend.claimDaily(); setMe(r.profile); bumpGrit(); toast(`+${r.amount} Grit claimed`, "good"); }
  catch (e) { toast(e.message, "bad"); }
});

// ------------------------------------------------------------------ reward sheet
function showReward(before, res, set) {
  const e = res.earned, r0 = rankFor(before.rp), r1 = rankFor(me.rp), L0 = levelFor(before.xp).level, L1 = levelFor(me.xp).level;
  const promoted = r1.i > r0.i;
  const unlocks = (res.unlocks || []).map((id) => `<div class="unlock">${icon("star")}<div><b>${esc(titleName(id))}</b><small>New title unlocked · +100 Grit</small></div><button class="btn sm" data-equip="${id}" type="button">Equip</button></div>`).join("");
  const sheet = $("#sheet");
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="rwTitle">
    <h2 id="rwTitle">${promoted ? "Ranked up" : "Set banked"}</h2>
    <p class="lead">${set.reps} ${set.kind === "push" ? "push-ups" : "sit-ups"} in ${clock(set.secs)}</p>
    <div class="earn">
      <div class="g"><b class="num" data-to="${e.grit + (e.bonus || 0)}">0</b><span>Grit</span></div>
      <div><b class="num" data-to="${e.xp}">0</b><span>XP</span></div>
      <div class="r"><b class="num" data-to="${e.rp}">0</b><span>Rank pts</span></div>
    </div>
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
  if (e.target.id === "sheet" || e.target.id === "rwClose") { $("#sheet").hidden = true; return; }
  const eq = e.target.closest("[data-equip]");
  if (eq) { await equip(eq.dataset.equip); eq.outerHTML = `<span class="meta on">Equipped</span>`; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) $("#sheet").hidden = true; });

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
  $("#lbSeg").innerHTML = Object.entries(BOARDS).map(([k, b]) => `<button type="button" data-board="${k}" aria-pressed="${k === board}">${b.label}</button>`).join("");
}
$("#lbSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-board]"); if (b) { board = b.dataset.board; store.set("board", board); renderBoardTabs(); loadBoard(); } });
$("#lbRefresh").addEventListener("click", () => loadBoard());

const unitFor = (b) => b === "rank" ? "RP" : "reps";
const nameColor = (theme) => (THEMES[theme] || THEMES.ember).color;
let boardReq = 0;
async function loadBoard() {
  const req = ++boardReq;
  renderBoardTabs();
  $("#podium").innerHTML = ""; $("#lbMe").hidden = true;
  $("#lbList").innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
  try {
    const { rows, me: mine } = await backend.leaderboard(board, me);
    if (req !== boardReq) return;
    const unit = unitFor(board);
    const top = rows.slice(0, 3), rest = rows.slice(3);
    const order = [top[1], top[0], top[2]];
    $("#podium").innerHTML = rows.length >= 3 ? order.map((r, i) => r ? `<div class="panel pod p${[2, 1, 3][i]}">
        <span class="place">${[2, 1, 3][i]}</span>${emblem(r.rp, "")}
        <span class="nm" style="color:${nameColor(r.theme)}">${esc(r.username)}</span><span class="tt">${esc(titleName(r.title))}</span>
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
  const inner = `<span class="pos">${pos}</span>${emblem(r.rp, "sm")}<span class="who-c"><span class="nm" style="color:${nameColor(r.theme)}">${esc(r.username)}${mine ? " (you)" : ""}</span><span class="tt">${esc(titleName(r.title))}</span></span><span class="val">${fmt(r.value)}<span class="unit">${unit}</span></span>`;
  return bare ? inner : `<li class="${mine ? "mine" : ""}">${inner}</li>`;
}

// ------------------------------------------------------------------ store
const pending = new Map();
function buyButton(it) {
  const can = me.grit >= it.price, armed = pending.has(it.id);
  if (!can) return `<button class="btn sm" type="button" disabled><span class="price">${icon("coin")}${fmt(it.price)}</span></button>`;
  return `<button class="btn sm ${armed ? "gold" : ""}" type="button" data-buy="${it.id}">${armed ? "Tap to confirm" : `<span class="price">${icon("coin")}${fmt(it.price)}</span>`}</button>`;
}
function renderStore() {
  const owns = (id) => me.inventory.includes(id);
  $("#storeBoosts").innerHTML = ITEMS.filter((i) => i.kind === "boost").map((it) => {
    let meta = it.minutes ? `${it.minutes} min` : "Single use";
    let on = false;
    if (it.id === "shield") { const n = Number(me.boosts?.shield || 0); if (n) { meta = `Holding ${n}/3`; on = true; } }
    else if (boostOn(me.boosts, it.id)) { meta = `Active · ${clock((new Date(me.boosts[it.id]) - Date.now()) / 1000)} left · buying adds time`; on = true; }
    return `<div class="panel card"><span class="ic">${icon(it.icon)}</span><b>${esc(it.name)}</b><p>${esc(it.desc)}</p><span class="meta ${on ? "on" : ""}" data-boost-meta="${it.id}">${meta}</span>${buyButton(it)}</div>`;
  }).join("");
  $("#storeTitles").innerHTML = ITEMS.filter((i) => i.kind === "title" && i.price).map((it) => {
    const own = owns(it.id), eq = me.title === it.id;
    return `<div class="panel card ${own ? "owned" : ""}"><div class="title-plate">${esc(it.name)}</div>
      ${own ? (eq ? `<span class="meta on">Equipped</span>` : `<button class="btn sm" type="button" data-equip="${it.id}">Equip</button>`) : buyButton(it)}</div>`;
  }).join("");
  $("#storeThemes").innerHTML = ITEMS.filter((i) => i.kind === "theme").map((it) => {
    const t = THEMES[it.id], own = owns(it.id), eq = me.theme === it.id;
    return `<div class="panel card"><div class="swatch ${t.shine ? "shine" : ""}" style="background-color:${t.color};--sw-ink:${t.ink}"></div><b>${esc(t.name)}</b>
      ${own ? (eq ? `<span class="meta on">Equipped</span>` : `<button class="btn sm" type="button" data-equip="${it.id}">Equip</button>`) : buyButton(it)}</div>`;
  }).join("");
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-buy]");
  if (b) {
    const id = b.dataset.buy;
    if (!pending.has(id)) { pending.set(id, setTimeout(() => { pending.delete(id); if (view === "store") renderStore(); }, 3000)); renderStore(); return; }
    clearTimeout(pending.get(id)); pending.delete(id);
    try { const r = await backend.buy(id); setMe(r.profile); toast(`${item(id).name} is yours`, "good"); }
    catch (err) { toast(err.message, "bad"); renderStore(); }
    return;
  }
  const q = e.target.closest("#view-store [data-equip], #view-me [data-equip]");
  if (q) equip(q.dataset.equip);
});
async function equip(id) {
  try { const r = await backend.equip(id); setMe(r.profile); toast(`${item(id).name} equipped`, "good"); }
  catch (err) { toast(err.message, "bad"); }
}

// ------------------------------------------------------------------ profile
function renderMe() {
  const r = rankFor(me.rp), L = levelFor(me.xp);
  $("#hero").innerHTML = `<span class="avatar">${esc(me.username[0].toUpperCase())}</span>
    <div class="hero-body"><span class="hero-name">${esc(me.username)}</span><span class="hero-title">${esc(titleName(me.title))}</span>
    <div class="hero-lvl"><span>Lv ${L.level}</span><div class="bar"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div><span class="num">${fmt(L.into)}/${fmt(L.need)} XP</span></div></div>
    ${emblem(r)}`;
  const stats = [["Total reps", me.total_push + me.total_sit], ["Push-ups", me.total_push], ["Sit-ups", me.total_sit], ["Best set", me.best_set], ["Sets", me.sets_count], ["Day streak", me.streak]];
  $("#stats").innerHTML = stats.map(([k, v]) => `<div class="panel stat"><b>${fmt(v)}</b><span>${k}</span></div>`).join("");

  $("#titleLocker").innerHTML = ITEMS.filter((i) => i.kind === "title").map((it) => {
    const own = me.inventory.includes(it.id);
    if (own) return `<button class="tpill" type="button" data-equip="${it.id}" aria-pressed="${me.title === it.id}">${esc(it.name)}</button>`;
    const how = it.price ? `Buy in the store for ${fmt(it.price)} Grit` : it.earn;
    return `<button class="tpill locked" type="button" data-how="${esc(how)}" title="${esc(how)}">${icon("lock")}${esc(it.name)}</button>`;
  }).join("");
  $("#themeLocker").innerHTML = ITEMS.filter((i) => i.kind === "theme").map((it) => {
    const t = THEMES[it.id], own = me.inventory.includes(it.id);
    return own ? `<button class="sw-btn" type="button" data-equip="${it.id}" aria-pressed="${me.theme === it.id}" aria-label="${t.name} theme" style="background:${t.color}"></button>`
      : `<button class="sw-btn locked" type="button" data-how="${esc(`${t.name}: ${fmt(it.price)} Grit in the store`)}" aria-label="${t.name} theme, locked" style="background:${t.color}"></button>`;
  }).join("");
  $("#ladder").innerHTML = RANKS.slice().reverse().map((x) => `<li class="${x.i === r.i ? "cur" : x.i < r.i ? "done" : ""}">${emblem(x, "sm")}<span>${esc(x.name)}</span><span>${fmt(x.rp)} RP</span></li>`).join("");
  renderSettings();
}
document.addEventListener("click", (e) => { const h = e.target.closest("[data-how]"); if (h) toast(h.dataset.how); });

async function renderSettings() {
  const online = backend.mode === "online";
  const sp = !spotify.configured
    ? `<div><b>Spotify</b><small>Add your Spotify Client ID to <code>js/config.js</code> and this Redirect URI in the Spotify dashboard: <code>${esc(spotify.redirectUri)}</code></small></div>`
    : `<div><b>Spotify</b><small>${spotify.connected ? "Connected. +10% Grit while music plays." : "Show what’s playing and control it from the Train tab."}</small></div>
       <button class="btn sm" type="button" id="spToggle">${spotify.connected ? "Disconnect" : "Connect"}</button>`;
  $("#settings").innerHTML = `
    <div class="row"><div><b>Say each rep out loud</b><small>Beeps instead when off</small></div><label class="switch"><input type="checkbox" id="setVoice" ${prefs.voice ? "checked" : ""}><span></span></label></div>
    <div class="row">${sp}</div>
    <div class="row"><div><b>Player name</b><small>Shown on the leaderboards</small></div>
      <form class="field" id="renameForm"><input id="renameInput" maxlength="16" value="${esc(me.username)}" aria-label="Player name"><button class="btn sm" type="submit">Save</button></form></div>
    <div class="row"><div><b>${online ? "Public account" : "Local mode"}</b><small id="acctNote">${online ? "Your sets count on the public leaderboards." : "Progress stays on this device. Add Supabase keys in js/config.js to make leaderboards public."}</small></div></div>
    ${online ? `<div class="row"><div><b>Keep your account</b><small id="emailNote">Add an email so you can sign in on another phone. Without one, clearing this browser loses the account.</small></div>
      <form class="field" id="emailForm"><input id="emailInput" type="email" placeholder="you@example.com" aria-label="Email" autocomplete="email"><button class="btn sm" type="submit">Save</button></form>
      <button class="btn sm ghost" type="button" id="emailSignIn">Sign in with email instead</button></div>` : ""}`;
  $("#setVoice").onchange = (e) => { prefs.voice = e.target.checked; store.set("prefs", prefs); };
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
async function boot() {
  hydrateIcons();
  try { if (await spotify.handleRedirect()) toast("Spotify connected", "good"); } catch (e) { toast(e.message, "bad"); }
  try { me = await backend.init(); }
  catch (e) { toast("Couldn’t reach the leaderboard server: " + e.message, "bad"); }
  if (!me) {
    $("#onboard").hidden = false;
    if (backend.mode === "local") $("#obNote").textContent = "3-16 letters, numbers or underscores. Local mode: progress stays on this device.";
    setTimeout(() => $("#obName").focus(), 50);
  } else renderHeader();
  go(location.hash.slice(1) || "train", false);
  pollSpotify();
}
$("#onboardForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#obGo"); btn.disabled = true; btn.textContent = "Creating…";
  try {
    me = await backend.createProfile($("#obName").value.trim());
    $("#onboard").hidden = true; renderHeader(); go("train");
    toast(`Welcome, ${me.username}. 150 Grit to start.`, "good");
  } catch (err) { toast(err.message, "bad"); }
  btn.disabled = false; btn.textContent = "Start training";
});

boot();
