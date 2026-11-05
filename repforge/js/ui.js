// Shared UI helpers: DOM, formatting, icons, rank emblems, toasts, bottom sheets.
import { rankFor } from "./catalog.js";

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => Number(n || 0).toLocaleString();
export const clock = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
export const until = (iso) => { const s = Math.max(0, (new Date(iso) - Date.now()) / 1000); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
export const dayLabel = (day, opts = { weekday: "short", month: "short", day: "numeric" }) => new Date(day + "T12:00:00").toLocaleDateString([], opts);
export function relTime(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

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
  check: '<path d="m5 12 5 5 9-10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  scroll: '<path d="M7 3h11a2 2 0 0 1 2 2v2h-4M7 3a2 2 0 0 0-2 2v12a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3V9M7 3a2 2 0 0 1 2 2v12a3 3 0 0 1-3 3"/><path d="M10 9h6M10 13h6"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  chevl: '<path d="m15 6-6 6 6 6"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
};
export const icon = (n) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
export function hydrateIcons(root = document) { root.querySelectorAll("svg[data-icon]").forEach((el) => { el.outerHTML = icon(el.dataset.icon); }); }

let emblemSeq = 0;
export function emblem(rp, cls = "") {
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

export function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind; el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, kind === "bad" ? 4200 : 2600);
}

// One bottom sheet for the whole app. Returns the sheet element.
export function openSheet(html, label) {
  const wrap = $("#sheet");
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || "Details")}">${html}</div>`;
  hydrateIcons(wrap);
  wrap.hidden = false;
  const focusable = wrap.querySelector("button, [href], input");
  focusable?.focus();
  return wrap.firstElementChild;
}
export const closeSheet = () => { $("#sheet").hidden = true; };
