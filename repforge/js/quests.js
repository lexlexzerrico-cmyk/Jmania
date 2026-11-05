// Daily and weekly quests, rest days, and the claimable-count badge on the nav.
import { $, esc, fmt, until, icon, toast } from "./ui.js";
import { titleName, unlockName } from "./catalog.js";

let ctx = null, data = null, busy = false;
const METRIC_ICON = { checkin: "check", reps: "dumbbell", reps_push: "dumbbell", reps_sit: "dumbbell", reps_squat: "dumbbell", sets: "scroll", cam_sets: "camera", secs: "clock", days: "calendar", records: "star", rest: "moon" };

export function setBadge(q) {
  const n = q ? q.quests.filter((x) => !x.claimed && x.progress >= x.target).length : 0;
  document.querySelectorAll(".q-badge").forEach((b) => { b.textContent = n; b.hidden = !n; });
}
export async function refreshQuestBadge(c) {
  ctx = c;
  try { data = await ctx.backend.getQuests(); setBadge(data); if (!$("#view-quests").hidden) render(); } catch (e) { /* badge is optional */ }
}

export async function loadQuests(c) {
  ctx = c;
  if (!data) $("#questDaily").innerHTML = '<div class="skeleton" style="height:84px"></div>'.repeat(3);
  try { data = await ctx.backend.getQuests(); setBadge(data); render(); }
  catch (e) { $("#questDaily").innerHTML = `<div class="panel empty">Couldn’t load quests: ${esc(e.message)}</div>`; }
}

function card(q) {
  const done = q.progress >= q.target, pct = Math.min(100, q.progress / q.target * 100);
  const isRestable = q.id === "d_checkin" && !q.claimed && !done && !data.trained_today && !data.rested_today && data.rest_this_week < (data.rest_limit || 2);
  const action = q.claimed ? `<span class="q-done">${icon("check")}Claimed</span>`
    : done ? `<button class="btn sm gold q-claim" type="button" data-claim="${q.id}">Claim</button>`
    : isRestable ? `<button class="btn sm" type="button" data-rest>${icon("moon")}Rest day</button>` : "";
  const prog = q.metric === "secs" ? `${Math.floor(q.progress / 60)}/${Math.floor(q.target / 60)} min` : `${fmt(q.progress)}/${fmt(q.target)}`;
  return `<div class="panel quest ${done ? "ready" : ""} ${q.claimed ? "claimed" : ""}" data-q="${q.id}">
    <span class="q-ic">${icon(METRIC_ICON[q.metric] || "scroll")}</span>
    <div class="q-body">
      <div class="q-top"><b>${esc(q.title)}</b><span class="q-rew"><span>+${q.xp} XP</span><span class="g">${icon("coin")}${q.grit}</span></span></div>
      <small>${esc(q.description)}</small>
      <div class="q-prog"><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div><span class="num">${prog}</span></div>
    </div>
    <div class="q-act">${action}</div>
  </div>`;
}

function render() {
  if (!data) return;
  const daily = data.quests.filter((q) => q.period === "daily"), weekly = data.quests.filter((q) => q.period === "weekly");
  const dDone = daily.filter((q) => q.claimed).length, wDone = weekly.filter((q) => q.claimed).length;
  $("#questDailyMeta").innerHTML = `<span class="num">${dDone}/${daily.length}</span> claimed · resets in <span class="num" data-reset="${data.daily_reset}">${until(data.daily_reset)}</span>`;
  $("#questWeeklyMeta").innerHTML = `<span class="num">${wDone}/${weekly.length}</span> claimed · resets in <span class="num" data-reset="${data.weekly_reset}">${until(data.weekly_reset)}</span>`;
  $("#questDaily").innerHTML = daily.map(card).join("");
  $("#questWeekly").innerHTML = weekly.map(card).join("");
  const me = ctx.me(), owned = me.inventory.includes("questbound");
  $("#questSummary").innerHTML = `
    <div class="qs-ring" style="--p:${(dDone / daily.length * 100).toFixed(0)}"><span class="num">${dDone}/${daily.length}</span></div>
    <div class="qs-body"><b>${dDone === daily.length ? "Daily quests complete" : "Today’s quests"}</b>
      <small>${owned ? `${fmt(data.quests_done)} quest rewards claimed` : `${fmt(data.quests_done)}/25 claims toward the <b>${esc(titleName("questbound"))}</b> title`}</small>
      <small>${data.rested_today ? "Today is a rest day. Your streak is safe." : `Rest days: ${data.rest_this_week}/${data.rest_limit || 2} used this week. They keep your streak alive.`}</small></div>`;
}

async function claim(id, btn) {
  if (busy) return; busy = true; btn.disabled = true;
  try {
    const r = await ctx.backend.claimQuest(id);
    ctx.setMe(r.profile);
    const el = btn.closest(".quest"); el?.classList.add("pop-claim");
    toast(`+${r.xp} XP · +${r.grit} Grit`, "good");
    for (const u of r.unlocks || []) toast(`Achievement: ${unlockName(u)}`, "good");
    data = await ctx.backend.getQuests(); setBadge(data);
    setTimeout(render, 450);
  } catch (e) { toast(e.message, "bad"); btn.disabled = false; }
  busy = false;
}
async function restDay(btn) {
  btn.disabled = true;
  try {
    const r = await ctx.backend.logRestDay();
    ctx.setMe(r.profile);
    toast("Rest day logged. Streak kept.", "good");
    for (const u of r.unlocks || []) toast(`Achievement: ${unlockName(u)}`, "good");
    data = await ctx.backend.getQuests(); setBadge(data); render();
  } catch (e) { toast(e.message, "bad"); btn.disabled = false; }
}

export function bindQuests() {
  $("#view-quests").addEventListener("click", (e) => {
    const c = e.target.closest("[data-claim]"); if (c) return claim(c.dataset.claim, c);
    const r = e.target.closest("[data-rest]"); if (r) return restDay(r);
  });
  setInterval(() => document.querySelectorAll("[data-reset]").forEach((el) => { el.textContent = until(el.dataset.reset); }), 30000);
}
