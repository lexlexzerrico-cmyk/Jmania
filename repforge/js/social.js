// Friends: friend list with activity status, requests, player search, rivalries (private challenges),
// and Steam-style player profiles with a side-by-side comparison. Online only.
import { $, esc, fmt, until, relTime, dayLabel, icon, toast, openSheet, closeSheet, avatarHTML, nameHTML, rankHTML, profileCard } from "./ui.js";
import { rankFor, levelFor, titleName, unlockName, recordMeta, EXERCISES, achievement } from "./catalog.js";

let ctx = null, tab = "friends", social = null, comps = null, searchT = 0, lastQ = "", busy = false;
const METRICS = { reps: "All reps", push: "Push-ups", sit: "Sit-ups", squat: "Squats", days: "Training days" };
const STATUS = { training: ["Training now", "on"], trained: ["Trained today", "ok"], resting: ["Rest day", "rest"], idle: ["", ""] };

const online = () => ctx.backend.mode === "online";
export function setSocialBadge() {
  const n = social ? social.incoming.length + (social.invites || 0) : 0;
  document.querySelectorAll(".s-badge").forEach((b) => { b.textContent = n; b.hidden = !n; });
}
export async function refreshSocialBadge(c) {
  ctx = c; if (!online()) return;
  try { social = await ctx.backend.getSocial(); setSocialBadge(); } catch (e) { /* optional */ }
}

export async function loadSocial(c) {
  ctx = c;
  renderTabs();
  if (!online()) {
    $("#socialBody").innerHTML = `<div class="panel empty-state">${icon("user")}<b>Friends need the online leaderboard</b>
      <p>Friends, rivalries and player profiles work once REPFORGE is connected to Supabase. Setup takes about five minutes: see <code>repforge/README.md</code>.</p></div>`;
    return;
  }
  if (!social) $("#socialBody").innerHTML = '<div class="skeleton" style="height:64px"></div>'.repeat(3);
  try {
    [social, comps] = await Promise.all([ctx.backend.getSocial(), ctx.backend.getCompetitions()]);
    setSocialBadge(); render();
  } catch (e) { $("#socialBody").innerHTML = `<div class="panel empty">Couldn’t load friends: ${esc(e.message)}</div>`; }
}

function renderTabs() {
  const n = social ? social.incoming.length : 0, inv = comps ? comps.filter((c) => c.my_status === "invited" && !c.finished).length : 0;
  const tabs = [["friends", "Friends"], ["requests", `Requests${n ? ` <b class="dot">${n}</b>` : ""}`], ["find", "Find"], ["rivals", `Rivals${inv ? ` <b class="dot">${inv}</b>` : ""}`]];
  $("#socialSeg").innerHTML = tabs.map(([k, l]) => `<button type="button" data-stab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("");
}

function statusChip(f) {
  const [label, cls] = STATUS[f.status] || STATUS.idle;
  if (label) return `<span class="act ${cls}">${label}</span>`;
  return `<span class="act">${f.last_set_at ? "Active " + relTime(f.last_set_at) : "No sets yet"}</span>`;
}
function playerRow(f, right) {
  return `<li class="prow" data-player="${f.id}">${avatarHTML(f, "")}<span class="prow-main">${nameHTML(f)}<span class="tt">${esc(titleName(f.title))}</span></span>
    <span class="prow-right">${right}</span></li>`;
}

function render() {
  renderTabs();
  const el = $("#socialBody");
  if (tab === "friends") {
    const fr = social.friends.slice().sort((a, b) => ({ training: 0, trained: 1, resting: 2, idle: 3 }[a.status] - ({ training: 0, trained: 1, resting: 2, idle: 3 }[b.status])) || b.week_reps - a.week_reps);
    el.innerHTML = fr.length ? `<div class="panel"><ul class="plist">${fr.map((f) => playerRow(f, `${statusChip(f)}<span class="wk num">${fmt(f.week_reps)}<small> reps / 7d</small></span>`)).join("")}</ul></div>
      <p class="note">${fr.length} friend${fr.length === 1 ? "" : "s"} · tap one to compare stats or start a challenge.</p>`
      : `<div class="panel empty-state">${icon("user")}<b>No friends yet</b><p>Find players by name and send a request. Training is easier with company.</p><button class="btn primary" type="button" data-stab="find">Find players</button></div>`;
  } else if (tab === "requests") {
    const inc = social.incoming, out = social.outgoing;
    el.innerHTML = `<h3>Incoming</h3>${inc.length ? `<div class="panel"><ul class="plist">${inc.map((r) => playerRow(r.player, `<span class="act">${relTime(r.at)}</span><button class="btn sm primary" type="button" data-accept="${r.request}">Accept</button><button class="btn sm ghost" type="button" data-decline="${r.request}" aria-label="Decline">${icon("x")}</button>`)).join("")}</ul></div>` : `<p class="note">No requests waiting.</p>`}
      <h3>Sent</h3>${out.length ? `<div class="panel"><ul class="plist">${out.map((r) => playerRow(r.player, `<span class="act">${relTime(r.at)}</span><button class="btn sm ghost" type="button" data-cancel="${r.request}">Cancel</button>`)).join("")}</ul></div>` : `<p class="note">Nothing pending.</p>`}`;
  } else if (tab === "find") {
    el.innerHTML = `<div class="field search-field">${icon("eye")}<input id="findInput" type="search" placeholder="Search players by name" autocomplete="off" aria-label="Search players" value="${esc(lastQ)}"></div>
      <div id="findResults"><p class="note">Your player name is <b>${esc(ctx.me().username)}</b>. Share it so friends can find you.</p></div>`;
    const inp = $("#findInput"); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    if (lastQ.length >= 2) runSearch(lastQ);
  } else if (tab === "rivals") {
    const active = (comps || []).filter((c) => !c.finished), done = (comps || []).filter((c) => c.finished);
    el.innerHTML = `<button class="btn primary" type="button" data-new-challenge ${social.friends.length ? "" : "disabled"}>${icon("trophy")}New challenge</button>
      ${social.friends.length ? "" : `<p class="note">Add a friend first, then challenge them.</p>`}
      ${active.length ? `<h3>Running</h3>${active.map(compCard).join("")}` : ""}
      ${done.length ? `<h3>Finished</h3>${done.map(compCard).join("")}` : ""}
      ${!active.length && !done.length ? `<div class="panel empty-state">${icon("trophy")}<b>No challenges yet</b><p>Pick friends, a type of exercise and a length. Scores come only from finished sets, capped at 300 reps a day.</p></div>` : ""}`;
  }
}

function compCard(c) {
  const me = ctx.me(), joined = c.members.filter((m) => m.status === "joined"), top = Math.max(1, ...joined.map((m) => m.score));
  const left = c.finished ? `Ended ${dayLabel(c.ends_at.slice(0, 10), { month: "short", day: "numeric" })}` : `${until(c.ends_at)} left`;
  let act = "";
  if (c.my_status === "invited" && !c.finished) act = `<button class="btn sm primary" type="button" data-join="${c.id}">Join</button><button class="btn sm ghost" type="button" data-decline-comp="${c.id}">Decline</button>`;
  else if (c.finished && c.my_status === "joined" && !c.claimed) act = `<button class="btn sm gold" type="button" data-claim-comp="${c.id}">${icon("gift")}Claim reward</button>`;
  else if (c.claimed) act = `<span class="q-done">${icon("check")}${c.claimed.grit ? `+${c.claimed.grit} Grit` : "Done"} · #${c.claimed.place}</span>`;
  else if (!c.finished && c.my_status === "joined") act = `<button class="link-btn" type="button" data-leave="${c.id}">Leave</button>`;
  return `<div class="panel comp ${c.finished ? "done" : ""}">
    <div class="comp-head"><div><b>${esc(c.name)}</b><small>${METRICS[c.metric]}${c.cam_only ? " · camera only" : ""} · ${left}</small></div>${icon(c.finished ? "trophy" : "flame")}</div>
    <ol class="standings">${c.members.map((m, i) => `<li class="${m.id === me.id ? "me" : ""} ${m.status === "invited" ? "inv" : ""}">
      <span class="pos num">${m.status === "joined" ? i + 1 : "–"}</span>${avatarHTML(m, "sm")}<span class="st-name">${nameHTML(m)}${m.status === "invited" ? " <small>invited</small>" : ""}</span>
      <span class="st-bar"><i style="width:${m.status === "joined" ? (m.score / top * 100).toFixed(1) : 0}%"></i></span><span class="num st-score">${fmt(m.score)}</span></li>`).join("")}</ol>
    ${act ? `<div class="comp-act">${act}</div>` : ""}</div>`;
}

let searchSeq = 0;
async function runSearch(q) {
  const seq = ++searchSeq, box = $("#findResults");
  if (q.length < 2) { box.innerHTML = `<p class="note">Type at least 2 characters.</p>`; return; }
  box.innerHTML = '<div class="skeleton" style="height:56px"></div>';
  try {
    const rows = await ctx.backend.searchPlayers(q);
    if (seq !== searchSeq) return;
    box.innerHTML = rows.length ? `<div class="panel"><ul class="plist">${rows.map((r) => playerRow(r, relBtn(r))).join("")}</ul></div>` : `<p class="note">No players match “${esc(q)}”.</p>`;
  } catch (e) { if (seq === searchSeq) box.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
}
function relBtn(r) {
  return { friend: `<span class="act ok">Friends</span>`, outgoing: `<span class="act">Request sent</span>`,
    incoming: `<button class="btn sm primary" type="button" data-add="${r.id}">Accept</button>`,
    none: `<button class="btn sm" type="button" data-add="${r.id}">Add</button>` }[r.relation] || "";
}

// ---------------------------------------------------------------- player profile
export async function openPlayer(c, id) {
  ctx = c;
  if (!online()) { toast("Player profiles need the online leaderboard"); return; }
  const me = ctx.me();
  if (id === me.id) { closeSheet(); document.querySelector('[data-go="me"]')?.click(); return; }
  const sheet = openSheet(`<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:200px"></div>`, "Player");
  try {
    const [o, mine] = await Promise.all([ctx.backend.getPlayer(id), ctx.backend.getAchievements().catch(() => ({ unlocked: [] }))]);
    const myAch = mine.unlocked.length, r = rankFor(o.rp);
    const rows = [["Rank points", me.rp, o.rp], ["Level", levelFor(me.xp).level, levelFor(o.xp).level], ["Total reps", me.total_reps ?? 0, o.total_reps],
      ["Push-ups", me.total_push, o.total_push], ["Sit-ups", me.total_sit, o.total_sit], ["Squats", me.total_squat || 0, o.total_squat],
      ["Best set", me.best_set, o.best_set], ["Day streak", me.streak, o.streak], ["Achievements", myAch, o.achievements], ["Challenge wins", me.comp_wins || 0, o.comp_wins || 0]];
    const cmp = rows.map(([k, a, b]) => { const t = Math.max(1, a, b); return `<li><span class="num ${a > b ? "lead" : ""}">${fmt(a)}</span>
      <span class="cmp-mid"><span class="cmp-bar l"><i style="width:${(a / t * 100).toFixed(1)}%"></i></span><small>${k}</small><span class="cmp-bar r"><i style="width:${(b / t * 100).toFixed(1)}%"></i></span></span>
      <span class="num ${b > a ? "lead" : ""}">${fmt(b)}</span></li>`; }).join("");
    const recs = o.records.filter((x) => x.key.startsWith("set_")).map((x) => `<div class="mini-rec"><small>${esc(recordMeta(x.key).label.replace("Most ", "").replace(" in a set", ""))}</small><b class="num">${fmt(x.value)}</b></div>`).join("");
    const show = (o.showcase || []).map((id) => achievement(id)).filter(Boolean).map((a) => `<div class="sc-item">${icon("trophy")}<b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join("");
    const acts = (o.recent_sets || []).map((s) => `<li><i class="sw" style="background:${EXERCISES[s.kind].color}"></i><span><b>${s.reps}</b> ${EXERCISES[s.kind].name.toLowerCase()}${s.source === "tap" ? ' <span class="tag">TAP</span>' : ""}</span><small>${relTime(s.created_at)}</small></li>`).join("");
    const actions = { none: `<button class="btn primary" type="button" data-add="${o.id}">${icon("user")}Add friend</button>`,
      outgoing: `<button class="btn" type="button" disabled>Request sent</button>`,
      incoming: `<button class="btn primary" type="button" data-add="${o.id}">Accept friend request</button>`,
      friend: `<button class="btn primary" type="button" data-new-challenge="${o.id}">${icon("trophy")}Challenge</button><button class="btn ghost" type="button" data-remove="${o.id}">Remove friend</button>` }[o.relation];
    sheet.innerHTML = `${profileCard(o)}
      <div class="pp-meta">${statusChip(o)}<span class="act">${esc(r.name)} · Lv ${levelFor(o.xp).level}</span><span class="act">${fmt(o.friends_count)} friends</span><span class="act">Joined ${dayLabel(o.created_at.slice(0, 10), { month: "short", year: "numeric" })}</span></div>
      <div class="sheet-actions">${actions}</div>
      ${show ? `<h3>Showcase</h3><div class="showcase">${show}</div>` : ""}
      <h3>You vs ${esc(o.username)}</h3><ul class="cmp">${cmp}</ul>
      ${recs ? `<h3>Best sets (camera)</h3><div class="mini-recs">${recs}</div>` : ""}
      ${acts ? `<h3>Recent activity</h3><ul class="feed-list">${acts}</ul>` : ""}
      <button class="btn ghost" type="button" data-close>Close</button>`;
  } catch (e) { sheet.innerHTML = `<p class="note">Couldn’t load this player: ${esc(e.message)}</p><button class="btn ghost" type="button" data-close>Close</button>`; }
}

// ---------------------------------------------------------------- new challenge
function openNewChallenge(pre) {
  const friends = social?.friends || [];
  if (!friends.length) { toast("Add a friend first"); return; }
  const sel = new Set(pre ? [pre] : []);
  const sheet = openSheet(`<span class="eyebrow">Rivalry</span><h2>New challenge</h2>
    <label class="lbl" for="chName">Name</label><div class="field"><input id="chName" maxlength="40" value="Push-up duel"></div>
    <span class="lbl">Scoring</span><div class="chips pick" id="chMetric">${Object.entries(METRICS).map(([k, l], i) => `<button type="button" class="tpill" data-v="${k}" aria-pressed="${k === "push"}">${l}</button>`).join("")}</div>
    <span class="lbl">Length</span><div class="chips pick" id="chDays">${[1, 3, 7, 14].map((d) => `<button type="button" class="tpill" data-v="${d}" aria-pressed="${d === 7}">${d} day${d > 1 ? "s" : ""}</button>`).join("")}</div>
    <div class="row" style="padding:4px 0;border:0"><div><b>Camera-tracked sets only</b><small>Recommended. Tap-counted sets won’t score.</small></div><label class="switch"><input type="checkbox" id="chCam" checked><span></span></label></div>
    <span class="lbl">Friends (up to 7)</span><div class="chips pick" id="chFriends">${friends.map((f) => `<button type="button" class="tpill" data-v="${f.id}" aria-pressed="${sel.has(f.id)}">${esc(f.username)}</button>`).join("")}</div>
    <p class="note">Starts now. Only sets finished during the challenge count, at most 300 reps a day each. When it ends, first place gets 150 Grit and everyone else who trained gets 50 (needs two or more players training; up to 3 paid challenges a week).</p>
    <button class="btn primary" type="button" id="chCreate">Send challenge</button><button class="btn ghost" type="button" data-close>Cancel</button>`, "New challenge");
  const pick = (id, multi) => sheet.querySelector(id).addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    if (multi) { const on = b.getAttribute("aria-pressed") !== "true"; if (on && sel.size >= 7) return toast("Up to 7 friends"); b.setAttribute("aria-pressed", on); on ? sel.add(b.dataset.v) : sel.delete(b.dataset.v); }
    else sheet.querySelectorAll(id + " [data-v]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  });
  pick("#chMetric"); pick("#chDays"); pick("#chFriends", true);
  sheet.querySelector("#chMetric").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); const n = sheet.querySelector("#chName");
    if (b && /duel$|challenge$|week$/i.test(n.value)) n.value = { reps: "Rep challenge", push: "Push-up duel", sit: "Sit-up duel", squat: "Squat duel", days: "Consistency week" }[b.dataset.v];
  });
  sheet.querySelector("#chCreate").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      await ctx.backend.createCompetition({ name: sheet.querySelector("#chName").value.trim(), metric: sheet.querySelector("#chMetric [aria-pressed=true]").dataset.v,
        days: +sheet.querySelector("#chDays [aria-pressed=true]").dataset.v, camOnly: sheet.querySelector("#chCam").checked, invite: [...sel] });
      closeSheet(); toast("Challenge sent", "good"); tab = "rivals"; comps = await ctx.backend.getCompetitions(); render();
    } catch (err) { toast(err.message, "bad"); btn.disabled = false; }
  });
}

// ---------------------------------------------------------------- actions
async function act(fn, ok, after) {
  if (busy) return; busy = true;
  try { const r = await fn(); if (ok) toast(typeof ok === "function" ? ok(r) : ok, "good"); for (const u of r?.unlocks || []) toast(`Achievement: ${unlockName(u)}`, "good"); await after?.(r); }
  catch (e) { toast(e.message, "bad"); }
  busy = false;
  try { [social, comps] = await Promise.all([ctx.backend.getSocial(), ctx.backend.getCompetitions()]); setSocialBadge(); if (!$("#view-friends").hidden) render(); } catch (e) {}
}

export function bindSocial(c) {
  ctx = c;
  $("#socialSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-stab]"); if (b && social) { tab = b.dataset.stab; render(); } });
  $("#socialBody").addEventListener("input", (e) => { if (e.target.id !== "findInput") return; lastQ = e.target.value.trim(); clearTimeout(searchT); searchT = setTimeout(() => runSearch(lastQ), 300); });
  document.addEventListener("click", (e) => {
    const t = e.target;
    const st = t.closest("#socialBody [data-stab]"); if (st) { tab = st.dataset.stab; return render(); }
    const pl = t.closest("[data-player]"); if (pl && !t.closest("button")) return openPlayer(ctx, pl.dataset.player);
    const add = t.closest("[data-add]"); if (add) { add.disabled = true; return act(() => ctx.backend.sendFriendRequest(add.dataset.add), (r) => r.status === "accepted" ? "You’re now friends" : "Request sent", async () => { if (!$("#sheet").hidden) openPlayer(ctx, add.dataset.add); if (tab === "find") runSearch(lastQ); }); }
    const ac = t.closest("[data-accept]"); if (ac) return act(() => ctx.backend.respondFriendRequest(+ac.dataset.accept, true), "Friend added");
    const dc = t.closest("[data-decline]"); if (dc) return act(() => ctx.backend.respondFriendRequest(+dc.dataset.decline, false), "Request declined");
    const cn = t.closest("[data-cancel]"); if (cn) return act(() => ctx.backend.cancelFriendRequest(+cn.dataset.cancel), "Request cancelled");
    const rm = t.closest("[data-remove]");
    if (rm) {
      if (rm.dataset.armed !== "1") { rm.dataset.armed = "1"; rm.textContent = "Tap again to remove"; setTimeout(() => { rm.dataset.armed = ""; rm.textContent = "Remove friend"; }, 4000); return; }
      return act(() => ctx.backend.removeFriend(rm.dataset.remove), "Friend removed", () => closeSheet());
    }
    const nc = t.closest("[data-new-challenge]");
    if (nc && !nc.disabled) return (social ? Promise.resolve() : ctx.backend.getSocial().then((x) => { social = x; })).then(() => openNewChallenge(nc.dataset.newChallenge || null)).catch((err) => toast(err.message, "bad"));
    const jn = t.closest("[data-join]"); if (jn) return act(() => ctx.backend.respondCompetition(+jn.dataset.join, true), "You’re in. Good luck");
    const dcc = t.closest("[data-decline-comp]"); if (dcc) return act(() => ctx.backend.respondCompetition(+dcc.dataset.declineComp, false), "Challenge declined");
    const lv = t.closest("[data-leave]");
    if (lv) {
      if (lv.dataset.armed !== "1") { lv.dataset.armed = "1"; lv.textContent = "Tap again to leave"; setTimeout(() => { lv.dataset.armed = ""; lv.textContent = "Leave"; }, 4000); return; }
      return act(() => ctx.backend.leaveCompetition(+lv.dataset.leave), "You left the challenge");
    }
    const cl = t.closest("[data-claim-comp]");
    if (cl) return act(() => ctx.backend.claimCompetition(+cl.dataset.claimComp), (r) => r.grit ? `#${r.place} · +${r.grit} Grit` : `Finished #${r.place}`, (r) => r.profile && ctx.setMe(r.profile));
  });
}
