// Seasons: one per calendar month. Season points (SP) are separate from permanent rank points and
// count at most 300 reps a day. Rendered inside the Ranks view.
import { $, esc, fmt, until, dayLabel, icon, toast, avatarHTML, nameHTML } from "./ui.js";
import { unlockName } from "./catalog.js";
import { sfx } from "./sfx.js";

export const STIERS = [
  { id: "bronze", name: "Bronze", sp: 0, color: "#d08a55", grit: 50 }, { id: "silver", name: "Silver", sp: 300, color: "#cdd6e2", grit: 100 },
  { id: "gold", name: "Gold", sp: 900, color: "#f5c84c", grit: 200 }, { id: "platinum", name: "Platinum", sp: 2000, color: "#55dccb", grit: 300 },
  { id: "diamond", name: "Diamond", sp: 4000, color: "#82adff", grit: 450 }, { id: "legend", name: "Legend", sp: 7000, color: "#ff6464", grit: 600 }
];
const tier = (id) => STIERS.find((t) => t.id === id) || STIERS[0];
let ctx = null;

export async function seasonBoardHTML(c) {
  ctx = c;
  const s = await ctx.backend.getSeason(), me = ctx.me(), t = tier(s.my_tier), i = STIERS.indexOf(t), nx = STIERS[i + 1];
  const frac = nx ? (s.my_sp - t.sp) / (nx.sp - t.sp) : 1;
  const claims = s.history.filter((h) => !h.claimed);
  return `<div class="panel season-card" style="--tc:${t.color}">
      <div class="sc-top"><div><span class="eyebrow">${esc(s.name)}</span><h3 class="season-name">${fmt(s.my_sp)} <small>SP</small></h3></div>
        <div class="tier-badge">${icon("trophy")}<b>${t.name}</b>${s.my_place ? `<small>#${s.my_place} of ${fmt(s.players)}</small>` : `<small>Not placed yet</small>`}</div></div>
      <div class="bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
      <small>${nx ? `${fmt(nx.sp - s.my_sp)} SP to ${nx.name}` : "Top tier"} · ends in ${until(s.ends_at)} · today ${fmt(s.my_today)}/300 reps count</small>
      <div class="stier-row">${STIERS.map((x) => `<span class="${s.my_sp >= x.sp ? "on" : ""}" style="--tc:${x.color}"><b>${x.name}</b><small>${fmt(x.sp)}+ · ${x.grit} Grit</small></span>`).join("")}</div>
    </div>
    ${claims.map((h) => `<div class="panel boss-claim">${icon("gift")}<div><b>${esc(h.name)} ended</b><small>${fmt(h.sp)} SP · ${tier(h.tier).name} · reward ${tier(h.tier).grit} Grit${h.sp >= 300 ? " + Season Veteran" : ""}</small></div>
      <button class="btn gold" type="button" data-claim-season="${h.id}">Claim</button></div>`).join("")}
    <div class="panel"><ol class="lb">${s.top.length ? s.top.map((r, n) => `<li class="${r.id === me.id ? "mine" : "clickable"}" ${r.id === me.id ? "" : `data-player="${r.id}"`}><span class="pos">${n + 1}</span>${avatarHTML(r, "sm")}
      <span class="who-c"><span class="nm">${nameHTML(r)}${r.id === me.id ? " (you)" : ""}</span><span class="tt" style="color:${tier(r.tier).color}">${tier(r.tier).name}</span></span><span class="val">${fmt(r.sp)}<span class="unit">SP</span></span></li>`).join("")
      : `<li class="empty" style="display:block">No season points yet. Finish a set to get on the board.</li>`}</ol></div>
    <p class="note">Season points use the same weights as rank points, count up to 300 reps a day, and reset every month. Your permanent rank never resets. Past seasons: ${s.history.length ? s.history.map((h) => `${esc(h.name)} (${tier(h.tier).name})`).join(", ") : "none yet"}.</p>`;
}

export function bindSeason(c, reload) {
  ctx = c;
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-claim-season]"); if (!b) return;
    b.disabled = true;
    try { const r = await ctx.backend.claimSeason(+b.dataset.claimSeason); ctx.setMe(r.profile); sfx("levelup"); toast(`${tier(r.tier).name} · #${r.place} · +${r.grit} Grit`, "good"); for (const u of r.unlocks || []) toast(`Achievement: ${unlockName(u)}`, "good"); reload(); }
    catch (err) { toast(err.message, "bad"); b.disabled = false; }
  });
}
