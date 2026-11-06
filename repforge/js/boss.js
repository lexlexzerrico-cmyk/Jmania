// World boss: community-wide fight. Health and damage live on the server; finished sets deal damage
// (up to 300 reps a day per player, tap sets at half). Rewards are claimed once after the boss falls.
import { $, esc, fmt, until, icon, toast, avatarHTML, nameHTML, guildBadge } from "./ui.js";
import { unlockName } from "./catalog.js";
import { sfx } from "./sfx.js";

let ctx = null, data = null, tab = "fighters", cache = { at: 0, data: null }, busy = false;
const online = () => ctx.backend.mode === "online";

// Original boss art: a hulking titan silhouette with per-boss features; cracks show as health drops.
export function bossArt(def, color, hpFrac = 1, defeated = false) {
  const hurt = 1 - hpFrac, c = esc(color);
  const extra = {
    iron: `<g fill="#cfd6e0" opacity=".9"><circle cx="70" cy="96" r="3"/><circle cx="130" cy="96" r="3"/><circle cx="70" cy="128" r="3"/><circle cx="130" cy="128" r="3"/></g>`,
    ember: `<path d="M68 40 52 8l26 22M132 40l16-32-26 22" fill="${c}"/><path d="M60 170q40 30 80 0" stroke="#ffb020" stroke-width="4" fill="none" opacity=".7"/>`,
    frost: `<path d="M72 34l6-24 8 22 14-28 14 28 8-22 6 24z" fill="#e8fbff"/>`,
    void: `<ellipse cx="100" cy="22" rx="34" ry="8" fill="none" stroke="${c}" stroke-width="4"/><circle cx="100" cy="112" r="14" fill="#0a0612" stroke="${c}" stroke-width="3"/>`
  }[def] || "";
  return `<svg class="boss-svg ${defeated ? "down" : ""}" viewBox="0 0 200 210" role="img" aria-label="Boss artwork">
    <defs><radialGradient id="aura-${def}" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
      <linearGradient id="body-${def}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#14161d"/></linearGradient></defs>
    <circle cx="100" cy="112" r="96" fill="url(#aura-${def})" class="boss-aura"/>
    <g class="boss-body">
      <path d="M44 84 20 150l18 8 22-52z M156 84l24 66-18 8-22-52z" fill="url(#body-${def})" stroke="#0a0b10" stroke-width="2"/>
      <path d="M58 70h84l12 30-8 74H54l-8-74z" fill="url(#body-${def})" stroke="#0a0b10" stroke-width="2"/>
      <path d="M74 32h52l8 34-34 12-34-12z" fill="url(#body-${def})" stroke="#0a0b10" stroke-width="2"/>
      <path d="M84 50h10l-2 6h-8zM106 50h10l-2 6h-8z" fill="${defeated ? "#555" : "#fff"}" class="boss-eyes"/>
      <path d="M62 174h30l-4 30H58zM108 174h30l4 30h-30z" fill="url(#body-${def})" stroke="#0a0b10" stroke-width="2"/>
      ${extra}
      <g stroke="#0a0b10" stroke-width="2.5" fill="none" opacity="${Math.min(1, hurt * 1.6).toFixed(2)}">
        <path d="M80 80l10 18-6 14 12 16"/><path d="M128 90l-12 14 8 10-6 18"/>${hurt > .5 ? '<path d="M96 36l4 14-6 8"/><path d="M60 140l14 8 2 14"/>' : ""}</g>
    </g></svg>`;
}

const tierOf = (d) => d >= 300 ? 300 : d >= 100 ? 200 : d >= 1 ? 100 : 0;

export async function loadBoss(c) {
  ctx = c;
  const el = $("#bossBody");
  if (!online()) { el.innerHTML = `<div class="panel empty-state">${icon("skull")}<b>World bosses need the online leaderboard</b><p>The whole community fights the same boss, so this needs REPFORGE connected to Supabase (see <code>repforge/README.md</code>).</p></div>`; return; }
  if (!data) el.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  try { data = await ctx.backend.getBoss(); cache = { at: Date.now(), data }; render(); }
  catch (e) { el.innerHTML = `<div class="panel empty">Couldn’t load the boss: ${esc(e.message)}</div>`; }
}

function render() {
  const b = data, frac = b.hp / b.max_hp, down = !!b.defeated_at, me = ctx.me();
  const myTier = tierOf(b.my_damage), next = b.my_damage < 1 ? 1 : b.my_damage < 100 ? 100 : b.my_damage < 300 ? 300 : null;
  $("#bossBody").innerHTML = `
    <div class="panel boss-hero ${down ? "won" : ""}" style="--bc:${esc(b.color)}">
      <div class="boss-art">${bossArt(b.def, b.color, frac, down)}</div>
      <div class="boss-info">
        <span class="eyebrow">World boss${down ? " · defeated" : ` · ${until(b.ends_at)} left`}</span>
        <h2>${esc(b.name)}</h2><small class="boss-title">${esc(b.title)}</small>
        <div class="hp"><div class="hp-bar"><i style="width:${(frac * 100).toFixed(2)}%"></i></div>
          <div class="hp-nums"><b class="num">${fmt(b.hp)}</b><span class="num">/ ${fmt(b.max_hp)} HP</span></div></div>
        <div class="boss-stats"><span><b class="num">${fmt(b.fighters)}</b> fighters</span><span><b class="num">${fmt(b.max_hp - b.hp)}</b> damage dealt</span></div>
      </div>
      ${down ? `<div class="victory"><b>Victory</b><small>The community brought it down. Next boss in ${until(new Date(new Date(b.defeated_at).getTime() + 12 * 3600e3).toISOString())}.</small></div>` : ""}
    </div>
    ${b.claimable.map((c) => `<div class="panel boss-claim">${icon("gift")}<div><b>${esc(c.name)} fell</b><small>You dealt ${fmt(c.damage)} damage · reward ${tierOf(c.damage)} Grit + ${tierOf(c.damage)} XP</small></div>
      <button class="btn gold" type="button" data-claim-boss="${c.id}">Claim</button></div>`).join("")}
    <div class="panel boss-me">
      <div><span class="eyebrow">Your fight</span><b class="num big">${fmt(b.my_damage)}</b><small>damage</small></div>
      <div class="boss-cap"><small>Today: ${fmt(b.my_today)}/300 reps count</small><div class="bar thin"><i style="width:${Math.min(100, b.my_today / 3).toFixed(1)}%"></i></div>
        <small>${down ? (b.my_damage ? "Claim your reward above." : "You missed this one. The next boss comes soon.") : next ? `${fmt(next - b.my_damage)} more damage for the ${tierOf(next)} Grit reward` : "Top reward tier reached"}</small></div>
      <div class="tiers">${[[1, 100], [100, 200], [300, 300]].map(([d, g]) => `<span class="${b.my_damage >= d ? "on" : ""}"><b>${g}</b><small>${d}+ dmg</small></span>`).join("")}</div>
    </div>
    <div class="seg" id="bossSeg"><button type="button" data-btab="fighters" aria-pressed="${tab === "fighters"}">Top fighters</button><button type="button" data-btab="guilds" aria-pressed="${tab === "guilds"}">Guilds</button><button type="button" data-btab="history" aria-pressed="${tab === "history"}">Past bosses</button></div>
    <div class="panel">${tab === "fighters" ? `<ol class="lb">${b.top.length ? b.top.map((f, i) => `<li class="${f.id === me.id ? "mine" : ""} clickable" data-player="${f.id}"><span class="pos">${i + 1}</span>${avatarHTML(f, "sm")}<span class="who-c"><span class="nm">${nameHTML(f)}</span></span><span class="val">${fmt(f.damage)}<span class="unit">dmg</span></span></li>`).join("") : `<li class="empty" style="display:block">No hits yet. Finish a set to strike first.</li>`}</ol>`
      : tab === "guilds" ? `<ol class="lb">${b.guilds.length ? b.guilds.map((g, i) => `<li><span class="pos">${i + 1}</span>${guildBadge(g, "sm")}<span class="who-c"><span class="nm">${esc(g.name)} [${esc(g.tag)}]</span></span><span class="val">${fmt(g.damage)}<span class="unit">dmg</span></span></li>`).join("") : `<li class="empty" style="display:block">No guild damage yet.</li>`}</ol>`
      : `<ul class="feed-list" style="padding:4px 14px">${b.history.length ? b.history.map((h) => `<li>${icon(h.defeated ? "trophy" : "moon")}<span><b>${esc(h.name)}</b> ${h.defeated ? "defeated" : "escaped"}</span><small>${h.my_damage ? fmt(h.my_damage) + " dmg" : "—"}</small></li>`).join("") : `<li>No earlier bosses yet.</li>`}</ul>`}</div>
    <p class="note">Every finished set hits the boss: 1 damage per camera rep, ½ per tapped rep, up to 300 reps a day. Rewards: 100 / 200 / 300 Grit and XP for 1+ / 100+ / 300+ damage once it falls.</p>`;
}

// Small card for the Train screen.
export async function bossCardHTML(c) {
  ctx = c;
  if (!online()) return "";
  try {
    if (Date.now() - cache.at > 60000 || !cache.data) cache = { at: Date.now(), data: await ctx.backend.getBoss() };
    const b = cache.data, pct = b.hp / b.max_hp * 100;
    return `<button class="panel boss-mini" type="button" data-go="boss" style="--bc:${esc(b.color)}"><span class="bm-art">${bossArt(b.def, b.color, b.hp / b.max_hp, !!b.defeated_at)}</span>
      <span class="bm-main"><span class="eyebrow">World boss · ${b.defeated_at ? "defeated" : until(b.ends_at) + " left"}</span><b>${esc(b.name)}</b>
      <span class="hp-bar sm"><i style="width:${pct.toFixed(1)}%"></i></span><small>${fmt(b.hp)} HP left · you: ${fmt(b.my_damage)} dmg${b.claimable.length ? " · reward ready" : ""}</small></span></button>`;
  } catch (e) { return ""; }
}
export const invalidateBoss = () => { cache.at = 0; };

export function bindBoss(c) {
  ctx = c;
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-btab]"); if (t) { tab = t.dataset.btab; return render(); }
    const cl = e.target.closest("[data-claim-boss]");
    if (cl && !busy) {
      busy = true; cl.disabled = true;
      try { const r = await ctx.backend.claimBoss(+cl.dataset.claimBoss); ctx.setMe(r.profile); sfx("boss"); toast(`+${r.grit} Grit · +${r.xp} XP`, "good"); for (const u of r.unlocks || []) toast(`Achievement: ${unlockName(u)}`, "good"); invalidateBoss(); await loadBoss(ctx); }
      catch (err) { toast(err.message, "bad"); cl.disabled = false; }
      busy = false;
    }
  });
}
