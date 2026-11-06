// Guilds: browse / found / join, and a guild home with members, activity, applications and settings.
// Every permission is enforced server-side; the UI only shows the actions your role can use.
import { $, esc, fmt, relTime, icon, toast, openSheet, closeSheet, avatarHTML, nameHTML, guildBadge } from "./ui.js";
import { titleName, unlockName, levelFor, xpForLevel } from "./catalog.js";
import { openPlayer } from "./social.js";

let ctx = null, list = null, guild = null, tab = "members", q = "", qT = 0, busy = false;
export const EMBLEMS = ["shield", "flame", "bolt", "crown", "skull", "star", "moon", "dumbbell"];
export const GCOLORS = ["#ff8a3d", "#ff4d57", "#f5c84c", "#2fd69f", "#5b86ff", "#86e6ff", "#c77dff", "#ff5cae"];
const ROLE = { owner: "Owner", officer: "Officer", member: "Member" };
const glevel = (xp) => levelFor(Math.floor(xp / 5));
const online = () => ctx.backend.mode === "online";

export async function loadGuild(c) {
  ctx = c;
  const el = $("#guildBody");
  if (!online()) {
    el.innerHTML = `<div class="panel empty-state">${icon("shield")}<b>Guilds need the online leaderboard</b><p>Found or join a guild once REPFORGE is connected to Supabase (see <code>repforge/README.md</code>).</p></div>`;
    return;
  }
  if (!list && !guild) el.innerHTML = '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:64px"></div>';
  try {
    list = await ctx.backend.getGuilds(q);
    guild = list.mine ? await ctx.backend.getGuild(list.mine) : null;
    render();
  } catch (e) { el.innerHTML = `<div class="panel empty">Couldn’t load guilds: ${esc(e.message)}</div>`; }
}

function guildCard(g) {
  const applied = list.applied.includes(g.id);
  const btn = list.mine ? "" : applied ? `<button class="btn sm ghost" type="button" data-unapply="${g.id}">Applied · cancel</button>`
    : `<button class="btn sm ${g.open ? "primary" : ""}" type="button" data-joing="${g.id}">${g.open ? "Join" : "Apply"}</button>`;
  return `<div class="panel gcard" data-guild="${g.id}" style="--gc:${esc(g.color)}">${guildBadge(g)}
    <div class="gcard-main"><b>${esc(g.name)} <span class="gtag">[${esc(g.tag)}]</span></b>
      <small>Lv ${glevel(g.xp).level} · ${g.members}/50 members · ${fmt(g.week_reps)} reps this week · ${g.open ? "Open" : "Invite only"}</small>
      ${g.description ? `<small class="gdesc">${esc(g.description)}</small>` : ""}</div>${btn}</div>`;
}

function render() {
  const el = $("#guildBody");
  if (!guild) {
    el.innerHTML = `<div class="panel g-intro">${icon("shield")}<div><b>Train together</b><p>Guild members’ reps (up to 300 a day each) raise the guild’s level. Guilds race on the weekly guild board and against world bosses.</p></div></div>
      <button class="btn primary" type="button" data-found ${ctx.me().grit < 300 ? "disabled" : ""}>${icon("crown")}Found a guild · 300 Grit</button>
      ${ctx.me().grit < 300 ? `<p class="note">You need 300 Grit to found a guild. Joining is free.</p>` : ""}
      <div class="field search-field">${icon("eye")}<input id="guildSearch" type="search" placeholder="Search guilds by name or tag" value="${esc(q)}" aria-label="Search guilds"></div>
      <div class="glist">${list.guilds.length ? list.guilds.map(guildCard).join("") : `<p class="note">${q ? "No guilds match." : "No guilds yet. Found the first one."}</p>`}</div>`;
    return;
  }
  const g = guild, L = glevel(g.xp), staff = ["owner", "officer"].includes(g.my_role);
  const tabs = [["members", "Members"], ["activity", "Activity"], ...(staff ? [["apps", `Applications${g.applications.length ? ` <b class="dot">${g.applications.length}</b>` : ""}`]] : []), ["settings", "Settings"]];
  if (!tabs.some(([k]) => k === tab)) tab = "members";
  el.innerHTML = `<div class="panel gbanner" style="--gc:${esc(g.color)}">
      ${guildBadge(g, "lg")}
      <div class="gb-main"><span class="eyebrow">Guild · rank #${g.rank}</span><h2>${esc(g.name)} <span class="gtag">[${esc(g.tag)}]</span></h2>
        <div class="gb-lvl"><span>Lv ${L.level}</span><div class="bar"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div><span class="num">${fmt(g.xp)} XP</span></div>
        <small>${g.members}/50 members · ${fmt(g.week_reps)} reps this week · ${g.open ? "Open to all" : "Invite only"} · you are ${ROLE[g.my_role].toLowerCase()}</small>
        ${g.description ? `<p class="gdesc">${esc(g.description)}</p>` : ""}</div></div>
    <div class="seg scroll" id="guildSeg">${tabs.map(([k, l]) => `<button type="button" data-gtab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("")}</div>
    <div id="guildTab"></div>`;
  const t = $("#guildTab");
  if (tab === "members") {
    t.innerHTML = `<div class="panel"><ul class="plist">${g.members_list.map((m) => `<li class="prow" data-member="${m.id}">${avatarHTML(m)}
      <span class="prow-main">${nameHTML(m)}<span class="tt"><span class="role r-${m.role}">${ROLE[m.role]}</span> ${esc(titleName(m.title))}</span></span>
      <span class="prow-right"><span class="wk num">${fmt(m.contrib)}<small>guild XP · ${fmt(m.week_reps)} this week</small></span></span></li>`).join("")}</ul></div>
      <p class="note">Contribution counts up to 300 reps per member per day.</p>`;
  } else if (tab === "activity") {
    const ev = { founded: "founded the guild", joined: "joined", left: "left", removed: "was removed", promote: "became an officer", demote: "is a member again", transfer: "is the new owner", edited: "updated the guild" };
    const items = [...g.events.map((e) => ({ at: e.created_at, html: `${icon("shield")}<span><b>${esc(e.username || "Someone")}</b> ${ev[e.kind] || e.kind}</span>` })),
      ...g.recent_sets.map((s) => ({ at: s.created_at, html: `${icon("dumbbell")}<span><b>${esc(s.username)}</b> did ${s.reps} ${s.kind === "push" ? "push-ups" : s.kind === "sit" ? "sit-ups" : "squats"}</span>` }))]
      .sort((a, b) => b.at < a.at ? -1 : 1).slice(0, 25);
    t.innerHTML = `<div class="panel feed"><ul>${items.length ? items.map((i) => `<li>${i.html}<small>${relTime(i.at)}</small></li>`).join("") : `<li class="empty">Nothing yet.</li>`}</ul></div>`;
  } else if (tab === "apps") {
    t.innerHTML = g.applications.length ? `<div class="panel"><ul class="plist">${g.applications.map((a) => `<li class="prow" data-player="${a.id}">${avatarHTML(a)}<span class="prow-main">${nameHTML(a)}<span class="tt">${relTime(a.at)}</span></span>
      <span class="prow-right"><button class="btn sm primary" type="button" data-gapp="${a.id}" data-ok="1">Accept</button><button class="btn sm ghost" type="button" data-gapp="${a.id}" data-ok="0" aria-label="Decline">${icon("x")}</button></span></li>`).join("")}</ul></div>`
      : `<p class="note">No applications waiting.</p>`;
  } else {
    const owner = g.my_role === "owner";
    t.innerHTML = `${staff ? `<div class="panel settings">
        <div class="row"><div><b>Description</b><small>Up to 200 characters</small></div><div class="field"><input id="gDesc" maxlength="200" value="${esc(g.description)}"></div></div>
        ${owner ? `<div class="row"><div><b>Emblem</b></div><div class="chips pick" id="gEmblem">${EMBLEMS.map((e) => `<button type="button" class="tpill" data-v="${e}" aria-pressed="${e === g.emblem}" aria-label="${e}">${icon(e)}</button>`).join("")}</div></div>
        <div class="row"><div><b>Colour</b></div><div class="chips pick" id="gColor">${GCOLORS.map((c) => `<button type="button" class="sw-btn" data-v="${c}" aria-pressed="${c === g.color}" style="background:${c}" aria-label="Colour ${c}"></button>`).join("")}</div></div>
        <div class="row"><div><b>Open to everyone</b><small>Off: players apply and officers decide</small></div><label class="switch"><input type="checkbox" id="gOpen" ${g.open ? "checked" : ""}><span></span></label></div>` : ""}
        <div class="row"><button class="btn primary" type="button" id="gSave">Save changes</button></div></div>` : ""}
      <div class="panel settings"><div class="row"><div><b>Leave guild</b><small>${owner && g.members > 1 ? "Hand ownership to another member first (tap them in Members)." : owner ? "You’re the last member: leaving closes the guild." : "Your past contribution stays with the guild."}</small></div>
        <button class="btn sm ghost" type="button" data-leave-guild ${owner && g.members > 1 ? "disabled" : ""}>${owner && g.members === 1 ? "Close guild" : "Leave"}</button></div></div>`;
    const pick = (id) => $(id)?.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) $(id).querySelectorAll("[data-v]").forEach((x) => x.setAttribute("aria-pressed", x === b)); });
    pick("#gEmblem"); pick("#gColor");
    $("#gSave")?.addEventListener("click", () => act(() => ctx.backend.updateGuild({ description: $("#gDesc").value,
      emblem: $("#gEmblem [aria-pressed=true]")?.dataset.v ?? null, color: $("#gColor [aria-pressed=true]")?.dataset.v ?? null, open: $("#gOpen") ? $("#gOpen").checked : null }), "Guild updated"));
  }
}

function memberSheet(id) {
  const g = guild, m = g.members_list.find((x) => x.id === id), me = ctx.me();
  if (!m) return;
  if (m.id === me.id) return openPlayer(ctx, id);
  const owner = g.my_role === "owner", canKick = owner || (g.my_role === "officer" && m.role === "member");
  const acts = [`<button class="btn" type="button" data-view="${m.id}">${icon("user")}View profile</button>`];
  if (owner && m.role === "member") acts.push(`<button class="btn" type="button" data-mm="promote" data-u="${m.id}">Make officer</button>`);
  if (owner && m.role === "officer") acts.push(`<button class="btn" type="button" data-mm="demote" data-u="${m.id}">Make member</button>`);
  if (owner) acts.push(`<button class="btn" type="button" data-mm="transfer" data-u="${m.id}">Hand over ownership</button>`);
  if (canKick) acts.push(`<button class="btn ghost" type="button" data-mm="kick" data-u="${m.id}">Remove from guild</button>`);
  openSheet(`<div class="pcard-in" style="padding:0">${avatarHTML(m, "lg")}<div class="pcard-body">${nameHTML(m)}<span class="pcard-title">${ROLE[m.role]} · ${fmt(m.contrib)} guild XP</span></div></div>
    <div class="sheet-actions">${acts.join("")}</div><p class="note">Removing someone and handing over ownership take two taps.</p><button class="btn ghost" type="button" data-close>Close</button>`, m.username);
}

function foundSheet() {
  const sheet = openSheet(`<span class="eyebrow">New guild · 300 Grit</span><h2>Found a guild</h2>
    <label class="lbl" for="fgName">Name</label><div class="field"><input id="fgName" maxlength="24" placeholder="Iron Wolves"></div>
    <label class="lbl" for="fgTag">Tag (2-5 letters or numbers)</label><div class="field"><input id="fgTag" maxlength="5" placeholder="IWLF" style="text-transform:uppercase"></div>
    <span class="lbl">Emblem</span><div class="chips pick" id="fgEmblem">${EMBLEMS.map((e, i) => `<button type="button" class="tpill" data-v="${e}" aria-pressed="${i === 0}" aria-label="${e}">${icon(e)}</button>`).join("")}</div>
    <span class="lbl">Colour</span><div class="chips pick" id="fgColor">${GCOLORS.map((c, i) => `<button type="button" class="sw-btn" data-v="${c}" aria-pressed="${i === 0}" style="background:${c}" aria-label="Colour ${c}"></button>`).join("")}</div>
    <label class="lbl" for="fgDesc">Description</label><div class="field"><input id="fgDesc" maxlength="200" placeholder="What your guild is about"></div>
    <div class="row" style="padding:4px 0;border:0"><div><b>Open to everyone</b><small>Off: players apply and you decide</small></div><label class="switch"><input type="checkbox" id="fgOpen" checked><span></span></label></div>
    <button class="btn primary" type="button" id="fgGo">Found guild for 300 Grit</button><button class="btn ghost" type="button" data-close>Cancel</button>`, "Found a guild");
  ["#fgEmblem", "#fgColor"].forEach((id) => sheet.querySelector(id).addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) sheet.querySelectorAll(id + " [data-v]").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
  sheet.querySelector("#fgGo").addEventListener("click", (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    act(() => ctx.backend.createGuild({ name: sheet.querySelector("#fgName").value.trim(), tag: sheet.querySelector("#fgTag").value.trim().toUpperCase(),
      emblem: sheet.querySelector("#fgEmblem [aria-pressed=true]").dataset.v, color: sheet.querySelector("#fgColor [aria-pressed=true]").dataset.v,
      description: sheet.querySelector("#fgDesc").value.trim(), open: sheet.querySelector("#fgOpen").checked }), "Guild founded", (r) => { if (r.profile) ctx.setMe(r.profile); closeSheet(); })
      .finally(() => { btn.disabled = false; });
  });
}

async function act(fn, ok, after) {
  if (busy) return; busy = true;
  try { const r = await fn(); if (ok) toast(typeof ok === "function" ? ok(r) : ok, "good"); for (const u of r?.unlocks || []) toast(`Achievement: ${unlockName(u)}`, "good"); await after?.(r); await loadGuild(ctx); }
  catch (e) { toast(e.message, "bad"); }
  busy = false;
}
const twoTap = (btn, label) => { if (btn.dataset.armed === "1") return true; const old = btn.innerHTML; btn.dataset.armed = "1"; btn.textContent = label; setTimeout(() => { btn.dataset.armed = ""; btn.innerHTML = old; }, 4000); return false; };

export function bindGuild(c) {
  ctx = c;
  $("#guildBody").addEventListener("input", (e) => { if (e.target.id !== "guildSearch") return; q = e.target.value.trim(); clearTimeout(qT);
    qT = setTimeout(async () => { try { list = await ctx.backend.getGuilds(q); if (!guild) { const pos = e.target.selectionStart; render(); const i = $("#guildSearch"); i.focus(); i.setSelectionRange(pos, pos); } } catch (err) { toast(err.message, "bad"); } }, 300); });
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#guildBody [data-found]")) return foundSheet();
    const gt = t.closest("[data-gtab]"); if (gt) { tab = gt.dataset.gtab; return render(); }
    const j = t.closest("[data-joing]"); if (j) return act(() => ctx.backend.joinGuild(+j.dataset.joing), (r) => r.status === "applied" ? "Application sent" : "Welcome to the guild");
    const ua = t.closest("[data-unapply]"); if (ua) return act(() => ctx.backend.cancelGuildApplication(+ua.dataset.unapply), "Application cancelled");
    const ga = t.closest("[data-gapp]"); if (ga) return act(() => ctx.backend.respondGuildApplication(ga.dataset.gapp, ga.dataset.ok === "1"), ga.dataset.ok === "1" ? "Member added" : "Application declined");
    const mem = t.closest("#guildTab [data-member]"); if (mem) return memberSheet(mem.dataset.member);
    const v = t.closest("#sheet [data-view]"); if (v) return openPlayer(ctx, v.dataset.view);
    const mm = t.closest("#sheet [data-mm]");
    if (mm) {
      const a = mm.dataset.mm;
      if ((a === "kick" || a === "transfer") && !twoTap(mm, a === "kick" ? "Tap again to remove" : "Tap again to hand over")) return;
      return act(() => ctx.backend.manageMember(mm.dataset.u, a), { promote: "Promoted to officer", demote: "Now a member", transfer: "Ownership handed over", kick: "Removed from the guild" }[a], () => closeSheet());
    }
    const lg = t.closest("[data-leave-guild]"); if (lg && !lg.disabled) { if (!twoTap(lg, "Tap again to confirm")) return; return act(() => ctx.backend.leaveGuild(), (r) => r.status === "disbanded" ? "Guild closed" : "You left the guild"); }
  });
}

// Guild leaderboard (used by the Ranks view).
export async function guildBoardHTML(c) {
  ctx = c;
  const r = await ctx.backend.getGuilds("");
  if (!r.guilds.length) return `<p class="note">No guilds yet. Found one from the Guild page.</p>`;
  return r.guilds.map((g, i) => `<div class="panel gcard ${g.id === r.mine ? "mine" : ""}" style="--gc:${esc(g.color)}"><span class="pos num">${i + 1}</span>${guildBadge(g, "sm")}
    <div class="gcard-main"><b>${esc(g.name)} <span class="gtag">[${esc(g.tag)}]</span></b><small>Lv ${glevel(g.xp).level} · ${g.members} members</small></div>
    <span class="val">${fmt(g.week_reps)}<span class="unit">reps/wk</span></span></div>`).join("");
}
