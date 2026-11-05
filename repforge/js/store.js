// Store (categories, rarity, live preview, confirm-to-buy) and the profile Locker (equip / unequip what you own).
import { $, esc, fmt, clock, icon, toast, openSheet, closeSheet, avatarHTML, nameHTML, rankHTML, rarityTag, profileCard } from "./ui.js";
import { ITEMS, item, THEMES, SLOTS, owns, achievement, skill, BRANCHES, has, unlockName } from "./catalog.js";
import { boostOn } from "./backend.js";

let ctx = null, cat = "boost", lockerSlot = "title", armed = null, armTimer = 0, busy = false;
const CATS = [["boost", "Boosts"], ["title", "Titles"], ["frame", "Frames"], ["avatar", "Avatars"], ["namefx", "Name FX"], ["rankfx", "Rank FX"], ["background", "Backgrounds"], ["theme", "Themes"]];
const RANK = { common: 0, rare: 1, epic: 2, legendary: 3 };

export function howToGet(it) {
  if (it.granted_by === "default") return "Everyone has this";
  if (it.price != null) return `Store · ${fmt(it.price)} Grit`;
  const a = achievement(it.granted_by); if (a) return `Achievement: ${a.name} (${a.desc.toLowerCase()})`;
  const s = skill(it.granted_by); if (s) return `Skill: ${s.name} in ${BRANCHES.find((b) => b.id === s.branch).name}`;
  return "Special reward";
}

// Small visual for an item, used on store cards and locker tiles.
export function thumb(it, p) {
  switch (it.kind) {
    case "title": return `<div class="title-plate">${esc(it.name)}</div>`;
    case "theme": { const t = THEMES[it.id]; return `<div class="swatch ${t.shine ? "shine" : ""}" style="background-color:${t.color};--sw-ink:${t.ink}"></div>`; }
    case "frame": return `<div class="thumb">${avatarHTML(p, "lg", { frame: it.id })}</div>`;
    case "avatar": return `<div class="thumb">${avatarHTML(p, "lg", { avatar: it.id, frame: "none" })}</div>`;
    case "namefx": return `<div class="thumb name-thumb">${nameHTML(p, { namefx: it.id })}</div>`;
    case "rankfx": return `<div class="thumb">${rankHTML(p, "", { rankfx: it.id })}</div>`;
    case "background": return `<div class="pcard mini" data-bg="${it.id}"></div>`;
    case "boost": return `<span class="ic">${icon(it.icon)}</span>`;
  }
  return "";
}
const equippedId = (p, it) => it.kind === "boost" ? null : p[SLOTS[it.kind].field];

function status(p, it) {
  if (it.kind === "boost") {
    if (it.id === "shield") { const n = Number(p.boosts?.shield || 0), cap = has(p, "d2") ? 4 : 3; return n ? { text: `Holding ${n}/${cap}`, on: true } : { text: "Single use" }; }
    if (boostOn(p.boosts, it.id)) return { text: `Active · ${clock((new Date(p.boosts[it.id]) - Date.now()) / 1000)} left`, on: true, live: it.id };
    return { text: `${it.minutes} min` };
  }
  if (equippedId(p, it) === it.id) return { text: "Equipped", on: true };
  if (owns(p, it.id)) return { text: "Owned", on: true };
  return null;
}

export function renderStore(c) {
  ctx = c; const p = ctx.me(); if (!p) return;
  $("#sGrit").textContent = fmt(p.grit);
  $("#storeCats").innerHTML = CATS.map(([k, n]) => `<button type="button" data-cat="${k}" aria-pressed="${k === cat}">${n}</button>`).join("");
  const list = ITEMS.filter((it) => it.kind === cat && it.granted_by !== "default")
    .sort((a, b) => (a.price == null) - (b.price == null) || RANK[a.rarity] - RANK[b.rarity] || (a.price || 0) - (b.price || 0));
  $("#storeGrid").innerHTML = list.map((it) => {
    const st = status(p, it), own = it.kind !== "boost" && owns(p, it.id), forSale = it.price != null;
    const foot = st ? `<span class="meta ${st.on ? "on" : ""}" ${st.live ? `data-boost-meta="${st.live}"` : ""}>${st.text}</span>` : "";
    const price = forSale && !own ? `<span class="price ${p.grit >= it.price ? "" : "short"}">${icon("coin")}${fmt(it.price)}</span>` : !forSale && !own ? `<span class="earn-only">${icon("lock")}Earned</span>` : "";
    return `<button class="panel card shop ${own ? "owned" : ""}" type="button" data-item="${it.id}" style="--rc:var(--r-${it.rarity})">
      ${thumb(it, p)}<span class="card-row"><b>${esc(it.name)}</b>${rarityTag(it.rarity)}</span>
      ${it.desc ? `<p>${esc(it.desc)}</p>` : ""}<span class="card-row">${foot}${price}</span></button>`;
  }).join("");
}

export function openItem(id) {
  const p = ctx.me(), it = item(id), own = it.kind !== "boost" && owns(p, id), eq = equippedId(p, it) === id;
  const preview = it.kind === "boost" || it.kind === "theme" ? `<div class="preview-solo">${thumb(it, p)}</div>`
    : profileCard(p, { [SLOTS[it.kind].field]: id });
  let act = "";
  if (it.kind === "boost" || !own) {
    if (it.price == null) act = `<div class="unlock">${icon("lock")}<div><b>How to get it</b><small>${esc(howToGet(it))}</small></div></div>`;
    else if (p.grit < it.price) act = `<button class="btn" type="button" disabled>Need ${fmt(it.price - p.grit)} more Grit</button>`;
    else act = `<button class="btn gold" type="button" data-buy="${id}">${icon("coin")}Buy for ${fmt(it.price)}</button>`;
  } else if (eq && it.kind !== "theme" && !(it.kind === "title" && id === "rookie")) act = `<button class="btn" type="button" data-unequip="${it.kind}">Unequip</button>`;
  else if (!eq) act = `<button class="btn primary" type="button" data-equip-item="${id}">Equip</button>`;
  else act = `<span class="q-done">${icon("check")}Equipped</span>`;
  openSheet(`<div class="card-row"><span class="eyebrow">${SLOTS[it.kind]?.one || "Boost"}</span>${rarityTag(it.rarity)}</div>
    <h2>${esc(it.name)}</h2>${it.desc ? `<p class="lead" style="margin:0">${esc(it.desc)}</p>` : ""}
    ${preview}
    <small class="note">${own ? "You own this." : esc(howToGet(it))}${it.kind === "theme" ? " Themes recolour the whole app." : ""}</small>
    <div class="sheet-actions" id="itemActions">${act}</div>
    <button class="btn ghost" type="button" data-close>Close</button>`, it.name);
  if (it.kind === "theme") document.documentElement.style.setProperty("--accent", THEMES[id].color); // live preview
}

async function buy(id, btn) {
  if (armed !== id) {    // first tap arms, second tap buys
    armed = id; clearTimeout(armTimer);
    btn.innerHTML = `Tap again to spend ${fmt(item(id).price)} Grit`; btn.classList.add("armed");
    armTimer = setTimeout(() => { armed = null; btn.innerHTML = `${icon("coin")}Buy for ${fmt(item(id).price)}`; btn.classList.remove("armed"); }, 4000);
    return;
  }
  if (busy) return; busy = true; armed = null; clearTimeout(armTimer); btn.disabled = true;
  try {
    const r = await ctx.backend.buy(id);
    ctx.setMe(r.profile);
    toast(`${item(id).name} is yours`, "good");
    for (const u of r.unlocks || []) toast(`Achievement: ${unlockName(u)}`, "good");
    openItem(id); refresh();
  } catch (e) { toast(e.message, "bad"); btn.disabled = false; }
  busy = false;
}
async function equipItem(id) {
  try { const r = await ctx.backend.equip(id); ctx.setMe(r.profile); toast(`${item(id).name} equipped`, "good"); openItem(id); refresh(); }
  catch (e) { toast(e.message, "bad"); }
}
async function unequip(slot) {
  try { const r = await ctx.backend.unequip(slot); ctx.setMe(r.profile); toast(`${SLOTS[slot].one} removed`, "good"); closeSheet(); refresh(); }
  catch (e) { toast(e.message, "bad"); }
}
function refresh() { if (!$("#view-store").hidden) renderStore(ctx); if (!$("#view-me").hidden) renderLocker(ctx); }

// ---- locker (profile)
export function renderLocker(c) {
  ctx = c; const p = ctx.me(); if (!p) return;
  $("#lockerSeg").innerHTML = Object.entries(SLOTS).map(([k, s]) => `<button type="button" data-slot="${k}" aria-pressed="${k === lockerSlot}">${s.name}</button>`).join("");
  const all = ITEMS.filter((it) => it.kind === lockerSlot), got = all.filter((it) => owns(p, it.id));
  $("#lockerCount").textContent = `${got.length}/${all.length} collected`;
  $("#lockerGrid").innerHTML = all.sort((a, b) => owns(p, b.id) - owns(p, a.id) || RANK[a.rarity] - RANK[b.rarity]).map((it) => {
    const own = owns(p, it.id), eq = p[SLOTS[lockerSlot].field] === it.id;
    return `<button class="panel tile-item ${own ? "" : "locked"} ${eq ? "eq" : ""}" type="button" data-item="${it.id}" style="--rc:var(--r-${it.rarity})" title="${esc(own ? it.name : howToGet(it))}">
      ${thumb(it, p)}<span class="ti-name">${own ? "" : icon("lock")}${esc(it.name)}</span>${eq ? `<span class="ti-eq">${icon("check")}</span>` : ""}</button>`;
  }).join("");
}

export function bindStore(c) {
  ctx = c;
  $("#storeCats").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (b) { cat = b.dataset.cat; renderStore(ctx); } });
  $("#lockerSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-slot]"); if (b) { lockerSlot = b.dataset.slot; renderLocker(ctx); } });
  document.addEventListener("click", (e) => {
    const card = e.target.closest("#storeGrid [data-item], #lockerGrid [data-item]"); if (card) return openItem(card.dataset.item);
    const b = e.target.closest("#sheet [data-buy]"); if (b) return buy(b.dataset.buy, b);
    const q = e.target.closest("#sheet [data-equip-item]"); if (q) return equipItem(q.dataset.equipItem);
    const u = e.target.closest("#sheet [data-unequip]"); if (u) return unequip(u.dataset.unequip);
  });
  // closing the sheet ends a theme preview
  new MutationObserver(() => { if ($("#sheet").hidden) ctx.applyTheme?.(); }).observe($("#sheet"), { attributes: true, attributeFilter: ["hidden"] });
}
