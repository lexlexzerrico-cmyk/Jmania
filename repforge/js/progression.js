// Progression: four-branch skill tree and the achievements list.
import { $, esc, fmt, dayLabel, icon, toast, openSheet, closeSheet } from "./ui.js";
import { BRANCHES, SKILLS, skill, has, spFree, levelFor, xpForLevel, ACHIEVEMENTS, achievement, ITEMS, item, unlockName, SLOTS } from "./catalog.js";

let ctx = null, tab = "tree", ach = null, busy = false;

export async function loadProgression(c) {
  ctx = c;
  render();
  try { ach = await ctx.backend.getAchievements(); render(); }
  catch (e) { $("#achList").innerHTML = `<div class="panel empty">Couldn’t load achievements: ${esc(e.message)}</div>`; }
}

function state(p, s) {
  if (has(p, s.id)) return "owned";
  if (s.requires && !has(p, s.requires)) return "locked";
  return spFree(p) >= s.cost ? "ready" : "short";
}
const grants = (id) => ITEMS.filter((it) => it.granted_by === id);
const grantText = (id) => grants(id).map((it) => `${SLOTS[it.kind]?.one || "Item"}: ${it.name}`).join(" · ");

function render() {
  const p = ctx.me(); if (!p) return;
  $("#progSeg").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ptab === tab));
  $("#progTree").hidden = tab !== "tree"; $("#progAch").hidden = tab !== "ach";
  const L = levelFor(p.xp), free = spFree(p), spent = SKILLS.filter((s) => has(p, s.id)).reduce((a, s) => a + s.cost, 0);
  $("#spCard").innerHTML = `<div class="sp-orb"><b class="num">${free}</b><span>skill point${free === 1 ? "" : "s"}</span></div>
    <div class="sp-body"><b>Level ${L.level}</b><div class="bar thin"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div>
    <small>Next point at level ${L.level + 1}: ${fmt(xpForLevel(L.level + 1) - p.xp)} XP to go · ${spent} spent of 36</small></div>`;

  $("#tree").innerHTML = BRANCHES.map((b) => {
    const nodes = SKILLS.filter((s) => s.branch === b.id);
    const got = nodes.filter((s) => has(p, s.id)).length;
    return `<div class="branch" style="--bc:${b.color}">
      <div class="branch-head"><b>${b.name}</b><small>${got}/5</small></div>
      <div class="branch-nodes">${nodes.map((s, i) => {
        const st = state(p, s), lit = has(p, s.id) && (i === 0 || has(p, nodes[i - 1].id));
        return `${i ? `<i class="link ${has(p, s.id) ? "lit" : ""}"></i>` : ""}
          <button class="node ${st} ${s.tier === 5 ? "cap" : ""}" type="button" data-skill="${s.id}" aria-label="${esc(s.name)}, ${st === "owned" ? "unlocked" : st === "ready" ? "ready to unlock" : "locked"}">
            <span class="node-gem">${icon(s.icon)}</span><span class="node-name">${esc(s.name)}</span><span class="node-cost">${st === "owned" ? icon("check") : s.cost + " SP"}</span>
          </button>`;
      }).join("")}</div></div>`;
  }).join("");

  if (!ach) { $("#achList").innerHTML = '<div class="skeleton" style="height:80px"></div>'.repeat(3); return; }
  const done = new Map(ach.unlocked.map((u) => [u.id, u]));
  $("#achSummary").innerHTML = `<b class="num">${done.size}</b><span>/ ${ACHIEVEMENTS.length} unlocked</span><div class="bar"><i style="width:${(done.size / ACHIEVEMENTS.length * 100).toFixed(1)}%"></i></div>`;
  const cats = [...new Set(ACHIEVEMENTS.map((a) => a.cat))];
  $("#achList").innerHTML = cats.map((c) => `<h3>${esc(c)}</h3><div class="ach-grid">${ACHIEVEMENTS.filter((a) => a.cat === c).map((a) => {
    const u = done.get(a.id), pr = !u && a.prog ? a.prog(p) : null, g = grantText(a.id);
    return `<div class="panel ach ${u ? "got" : ""}">
      <span class="ach-ic">${icon(u ? "trophy" : "lock")}</span>
      <div class="ach-body"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
        ${pr ? `<div class="q-prog"><div class="bar"><i style="width:${Math.min(100, pr[0] / pr[1] * 100).toFixed(1)}%"></i></div><span class="num">${fmt(Math.min(pr[0], pr[1]))}/${fmt(pr[1])}</span></div>` : ""}
        <span class="ach-rew">${u ? `Unlocked ${dayLabel(u.day, { month: "short", day: "numeric", year: "numeric" })}` : `+${a.grit} Grit`}${g ? ` · ${esc(g)}` : ""}</span></div></div>`;
  }).join("")}</div>`).join("");
}

function openSkill(id) {
  const p = ctx.me(), s = skill(id), b = BRANCHES.find((x) => x.id === s.branch), st = state(p, s), free = spFree(p), g = grantText(id);
  const req = s.requires ? skill(s.requires) : null;
  const action = st === "owned" ? `<span class="q-done">${icon("check")}Unlocked</span>`
    : st === "ready" ? `<button class="btn primary" type="button" data-unlock="${id}">Unlock for ${s.cost} skill point${s.cost === 1 ? "" : "s"}</button>`
    : st === "locked" ? `<button class="btn" type="button" disabled>Unlock ${esc(req.name)} first</button>`
    : `<button class="btn" type="button" disabled>Needs ${s.cost} skill points (you have ${free})</button>`;
  openSheet(`<div class="skill-sheet" style="--bc:${b.color}">
      <span class="node-gem big">${icon(s.icon)}</span>
      <div><span class="eyebrow" style="color:${b.color}">${b.name} · tier ${s.tier}${s.tier === 5 ? " · capstone" : ""}</span><h2>${esc(s.name)}</h2></div></div>
    <p class="lead" style="margin:0">${esc(s.desc)}.</p>
    ${g ? `<div class="unlock">${icon("sparkle")}<div><b>Unlocks</b><small>${esc(g)}</small></div></div>` : ""}
    <p class="note">Skills are permanent. Bonuses are percentages and one-off unlocks, so they never ask you for more reps.</p>
    ${action}<button class="btn ghost" type="button" data-close>Close</button>`, s.name);
}

async function unlock(id, btn) {
  if (busy) return; busy = true; btn.disabled = true;
  try {
    const r = await ctx.backend.unlockSkill(id);
    ctx.setMe(r.profile); closeSheet();
    toast(`${skill(id).name} unlocked`, "good");
    for (const g of r.granted || []) toast(`New ${SLOTS[item(g)?.kind]?.one.toLowerCase() || "item"}: ${item(g)?.name}`, "good");
    for (const u of r.unlocks || []) toast(`Achievement: ${unlockName(u)}`, "good");
    ach = await ctx.backend.getAchievements().catch(() => ach);
    render();
    $(`[data-skill="${id}"]`)?.classList.add("just");
  } catch (e) { toast(e.message, "bad"); btn.disabled = false; }
  busy = false;
}

export function bindProgression() {
  $("#progSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-ptab]"); if (b) { tab = b.dataset.ptab; render(); } });
  $("#tree").addEventListener("click", (e) => { const n = e.target.closest("[data-skill]"); if (n) openSkill(n.dataset.skill); });
  $("#sheet").addEventListener("click", (e) => { const u = e.target.closest("[data-unlock]"); if (u) unlock(u.dataset.unlock, u); });
}
export const refreshProgression = () => { if (ctx && !$("#view-skills").hidden) render(); };
