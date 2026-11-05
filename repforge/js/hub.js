// Dashboard ("Hub"): stat tiles, activity chart, consistency, personal records, calendar, recent activity.
import { $, esc, fmt, clock, dayLabel, relTime, icon, emblem, toast, openSheet } from "./ui.js";
import { rankFor, levelFor, EXERCISES, KINDS, RECORDS, recordMeta, titleName } from "./catalog.js";
import { addDays, weekStart } from "./backend.js";

const st = { range: "7d", table: false, month: null, selected: null, data: null, byDay: new Map(), req: 0 };
let ctx = null;

export async function loadHub(c) {
  ctx = c;
  const req = ++st.req;
  if (!st.data) $("#hubTiles").innerHTML = '<div class="skeleton tile-sk"></div>'.repeat(4);
  try {
    const data = await ctx.backend.dashboard();
    if (req !== st.req) return;
    st.data = data;
    st.byDay = new Map(data.days.map((x) => [x.d, x]));
    st.rest = new Set(data.rest);
    st.quests = new Map(data.quest_days.map((x) => [x.d, x.n]));
    st.recs = new Map(data.record_days.map((x) => [x.d, x.n]));
    st.unl = new Map(data.unlock_days.map((x) => [x.d, x.n]));
    st.month ||= data.today.slice(0, 7);
    st.selected ||= data.today;
    render();
    loadDay(st.selected);
  } catch (e) {
    $("#hubTiles").innerHTML = `<div class="panel empty" style="grid-column:1/-1">Couldn’t load your stats: ${esc(e.message)}</div>`;
  }
}

const reps = (x) => x ? x.push + x.sit + x.squat : 0;
function sumRange(d0, d1) { let n = 0; for (const [d, x] of st.byDay) if (d >= d0 && d <= d1) n += reps(x); return n; }
function activeDays(d0, d1) { let n = 0; for (const [d, x] of st.byDay) if (d >= d0 && d <= d1 && reps(x)) n++; return n; }
function restDays(d0, d1) { let n = 0; for (const d of st.rest) if (d >= d0 && d <= d1) n++; return n; }

function render() {
  const me = ctx.me(), t = st.data.today;
  const tiles = [
    ["Today", sumRange(t, t), dayLabel(t, { weekday: "long" })],
    ["This week", sumRange(weekStart(t), t), "since Monday"],
    ["This month", sumRange(t.slice(0, 8) + "01", t), dayLabel(t, { month: "long" })],
    ["Lifetime", me.total_reps ?? me.total_push + me.total_sit + (me.total_squat || 0), `${fmt(me.sets_count)} sets`]
  ];
  $("#hubTiles").innerHTML = tiles.map(([k, v, s]) => `<div class="panel tile"><span class="eyebrow">${k}</span><b class="num">${fmt(v)}</b><small>${esc(s)} · reps</small></div>`).join("");

  const r = rankFor(me.rp), L = levelFor(me.xp);
  $("#hubStrip").innerHTML = `
    <div class="strip-item" style="--tc:${r.tier.color}">${emblem(r, "sm")}<div><b>${esc(r.name)}</b><small>${fmt(me.rp)} RP</small></div></div>
    <div class="strip-item"><span class="lv-badge">${L.level}</span><div style="flex:1;min-width:0"><b>Level ${L.level}</b><div class="bar thin"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div><small>${fmt(L.into)}/${fmt(L.need)} XP</small></div></div>
    <div class="strip-item gold">${icon("coin")}<div><b class="num">${fmt(me.grit)}</b><small>Grit</small></div></div>
    <div class="strip-item flame">${icon("flame")}<div><b>${me.streak} day${me.streak === 1 ? "" : "s"}</b><small>streak</small></div></div>`;

  renderChart();
  renderRecords();
  renderCalendar();
  renderRecent();
}

// ------------------------------------------------------------ activity chart
function buckets() {
  const t = st.data.today, out = [];
  if (st.range === "12w") {
    const w0 = addDays(weekStart(t), -77);
    for (let i = 0; i < 12; i++) {
      const a = addDays(w0, i * 7), b = addDays(a, 6), x = { push: 0, sit: 0, squat: 0 };
      for (const [d, v] of st.byDay) if (d >= a && d <= b) for (const k of KINDS) x[k] += v[k];
      out.push({ ...x, key: a, tip: `Week of ${dayLabel(a, { month: "short", day: "numeric" })}`, label: i % 3 === 2 || i === 11 ? dayLabel(a, { month: "short", day: "numeric" }) : "" });
    }
  } else {
    const n = st.range === "30d" ? 30 : 7;
    for (let i = n - 1; i >= 0; i--) {
      const d = addDays(t, -i), v = st.byDay.get(d) || { push: 0, sit: 0, squat: 0 };
      const label = n === 7 ? dayLabel(d, { weekday: "short" }) : (i % 5 === 0 ? String(+d.slice(8)) : "");
      out.push({ push: v.push, sit: v.sit, squat: v.squat, key: d, tip: dayLabel(d), label });
    }
  }
  return out;
}
function niceTicks(max) {
  if (max <= 0) return [0, 10, 20, 30];
  const raw = max / 3, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step, ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}
function renderChart() {
  $("#rangeSeg").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.range === st.range));
  const data = buckets(), box = $("#chart"), W = Math.max(280, box.clientWidth || 320), H = 210;
  const L = 34, R = 6, T = 10, B = 24, iw = W - L - R, ih = H - T - B;
  const max = Math.max(0, ...data.map((b) => b.push + b.sit + b.squat)), ticks = niceTicks(max), top = ticks[ticks.length - 1];
  const y = (v) => T + ih - (v / top) * ih, band = iw / data.length, bw = Math.max(3, Math.min(34, band * 0.62));
  let g = "";
  for (const v of ticks) g += `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-label" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  data.forEach((b, i) => {
    const x = L + band * i + (band - bw) / 2;
    let base = T + ih; const segs = KINDS.filter((k) => b[k] > 0);
    segs.forEach((k, j) => {
      const h = (b[k] / top) * ih, last = j === segs.length - 1, gap = j > 0 ? 2 : 0;
      const hh = Math.max(1, h - gap), yTop = base - gap - hh;
      if (last) { const r = Math.min(4, bw / 2, hh); g += `<path d="M${x} ${yTop + hh}V${yTop + r}Q${x} ${yTop} ${x + r} ${yTop}H${x + bw - r}Q${x + bw} ${yTop} ${x + bw} ${yTop + r}V${yTop + hh}Z" fill="${EXERCISES[k].color}"/>`; }
      else g += `<rect x="${x}" y="${yTop}" width="${bw}" height="${hh}" fill="${EXERCISES[k].color}"/>`;
      base = yTop;
    });
    if (b.label) g += `<text class="ch-label" x="${L + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>`;
    g += `<rect class="ch-hit" data-i="${i}" x="${L + band * i}" y="${T}" width="${band}" height="${ih}" fill="transparent"/>`;
  });
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Reps per ${st.range === "12w" ? "week" : "day"}, stacked by exercise">${g}</svg>
    ${max === 0 ? '<div class="ch-empty">No reps in this range yet. Finish a set and it shows up here.</div>' : ""}<div class="ch-tip" id="chartTip" hidden></div>`;
  box._data = data;

  // consistency
  const t = st.data.today, a7 = activeDays(addDays(t, -6), t), a28 = activeDays(addDays(t, -27), t), r7 = restDays(addDays(t, -6), t);
  $("#consistency").innerHTML = `<div><b class="num">${a7}<span>/7</span></b><small>of the last 7 days trained${r7 ? ` · ${r7} rest` : ""}</small></div>
    <div><b class="num">${Math.round(a28 / 28 * 100)}<span>%</span></b><small>of the last 28 days trained</small></div>
    <div class="dots" aria-label="Last 14 days">${Array.from({ length: 14 }, (_, i) => { const d = addDays(t, i - 13); const c = reps(st.byDay.get(d)) ? "on" : st.rest.has(d) ? "rest" : ""; return `<i class="${c}" title="${dayLabel(d)}"></i>`; }).join("")}</div>`;

  $("#chartTableBtn").setAttribute("aria-pressed", st.table);
  $("#chartTable").hidden = !st.table;
  if (st.table) $("#chartTable").innerHTML = `<table><thead><tr><th>${st.range === "12w" ? "Week" : "Day"}</th>${KINDS.map((k) => `<th>${EXERCISES[k].name}</th>`).join("")}<th>Total</th></tr></thead><tbody>${
    data.slice().reverse().map((b) => `<tr><td>${esc(b.tip)}</td>${KINDS.map((k) => `<td>${fmt(b[k])}</td>`).join("")}<td><b>${fmt(b.push + b.sit + b.squat)}</b></td></tr>`).join("")}</tbody></table>`;
}
function showTip(i) {
  const box = $("#chart"), b = box._data?.[i], tip = $("#chartTip"); if (!b || !tip) return;
  const total = b.push + b.sit + b.squat;
  tip.innerHTML = `<b>${esc(b.tip)}</b>${KINDS.map((k) => `<div><i style="background:${EXERCISES[k].color}"></i>${EXERCISES[k].name}<span class="num">${fmt(b[k])}</span></div>`).join("")}<div class="tot">Total<span class="num">${fmt(total)}</span></div>`;
  tip.hidden = false;
  const hit = box.querySelector(`.ch-hit[data-i="${i}"]`), bx = box.getBoundingClientRect(), hb = hit.getBoundingClientRect();
  const left = Math.min(Math.max(hb.left - bx.left + hb.width / 2 - tip.offsetWidth / 2, 0), bx.width - tip.offsetWidth);
  tip.style.left = left + "px";
  box.querySelectorAll(".ch-hit").forEach((h) => h.classList.toggle("on", h === hit));
}
function hideTip() { const t = $("#chartTip"); if (t) t.hidden = true; $("#chart").querySelectorAll(".ch-hit.on").forEach((h) => h.classList.remove("on")); }

// ------------------------------------------------------------ records
function recordValue(meta, v) { return meta.unit === "time" ? clock(v) : meta.unit === "days" ? `${v}<span class="unit">/7 days</span>` : `${fmt(v)}<span class="unit">reps</span>`; }
function renderRecords() {
  const best = new Map(st.data.records.map((r) => [r.key, r]));
  const me = ctx.me();
  $("#hubRecords").innerHTML = RECORDS.map((m) => {
    const r = best.get(m.key);
    return `<button class="panel rec ${r ? "" : "empty-rec"}" type="button" data-rec="${m.key}">
      <span class="rec-top"><span class="eyebrow">${esc(m.label)}</span>${m.cam ? '<span class="cam-tag">CAM</span>' : ""}</span>
      <b class="rec-val num">${r ? recordValue(m, r.value) : "—"}</b>
      <small>${r ? `${dayLabel(r.day, { month: "short", day: "numeric", year: "numeric" })}${r.prev ? ` · was ${m.unit === "time" ? clock(r.prev) : fmt(r.prev)}` : ""}` : m.cam ? "Camera-tracked sets only" : "Not set yet"}</small></button>`;
  }).join("") + `<div class="panel rec lifetime"><span class="eyebrow">Lifetime reps</span><b class="rec-val num">${fmt(me.total_reps ?? 0)}</b>
    <small>${KINDS.map((k) => `${fmt(me["total_" + k] || 0)} ${EXERCISES[k].name.toLowerCase()}`).join(" · ")}</small></div>`;
}
async function openRecord(key) {
  const m = recordMeta(key);
  const sheet = openSheet(`<span class="eyebrow">Personal record</span><h2>${esc(m.label)}</h2><ul class="hist" id="recHist"><li class="skeleton"></li></ul><button class="btn" type="button" data-close>Close</button>`, m.label);
  try {
    const rows = await ctx.backend.recordHistory(key);
    sheet.querySelector("#recHist").innerHTML = rows.length ? rows.map((r, i) => `<li class="${i === 0 ? "cur" : ""}"><span class="num">${m.unit === "time" ? clock(r.value) : fmt(r.value)}</span><span>${r.prev ? `+${m.unit === "time" ? clock(r.value - r.prev) : fmt(r.value - r.prev)} on the old best` : "First record"}</span><span>${dayLabel(r.day, { month: "short", day: "numeric", year: "numeric" })}</span></li>`).join("")
      : `<li class="empty">No record yet.${m.cam ? " Only camera-tracked sets count for single-set records." : ""}</li>`;
  } catch (e) { sheet.querySelector("#recHist").innerHTML = `<li class="empty">Couldn’t load history: ${esc(e.message)}</li>`; }
}

// ------------------------------------------------------------ calendar
function renderCalendar() {
  const t = st.data.today, [y, mo] = st.month.split("-").map(Number);
  const first = st.month + "-01", start = weekStart(first), end = addDays(first, new Date(y, mo, 0).getDate() - 1);
  const earliest = addDays(t, -399).slice(0, 7);
  $("#calTitle").textContent = new Date(y, mo - 1, 15).toLocaleDateString([], { month: "long", year: "numeric" });
  $("#calPrev").disabled = st.month <= earliest;
  $("#calNext").disabled = st.month >= t.slice(0, 7);
  let monthMax = 0;
  for (const [d, x] of st.byDay) if (d.startsWith(st.month)) monthMax = Math.max(monthMax, reps(x));
  let cells = "";
  const last = addDays(weekStart(end), 6);
  for (let d = start; d <= last; d = addDays(d, 1)) {
    const x = st.byDay.get(d), n = reps(x), lv = n ? Math.max(1, Math.ceil(n / monthMax * 4)) : 0;
    const cls = [d.startsWith(st.month) ? "" : "out", d === t ? "today" : "", d === st.selected ? "sel" : "", st.rest.has(d) ? "rest" : "", d > t ? "future" : ""].join(" ");
    const marks = `${st.recs.get(d) ? '<i class="m-rec" title="Personal record"></i>' : ""}${st.quests.get(d) ? '<i class="m-q" title="Quest completed"></i>' : ""}`;
    cells += `<button type="button" class="cal-d ${cls}" data-day="${d}" style="--lv:${lv}" ${d > t ? "disabled" : ""} aria-label="${dayLabel(d)}${n ? `, ${n} reps` : ""}${st.rest.has(d) ? ", rest day" : ""}" aria-pressed="${d === st.selected}"><span>${+d.slice(8)}</span>${marks}</button>`;
  }
  $("#calGrid").innerHTML = cells;
}
async function loadDay(day) {
  st.selected = day;
  $("#calGrid").querySelectorAll(".cal-d").forEach((b) => { const on = b.dataset.day === day; b.classList.toggle("sel", on); b.setAttribute("aria-pressed", on); });
  const el = $("#dayDetail");
  el.innerHTML = `<div class="skeleton" style="height:60px"></div>`;
  try {
    const d = await ctx.backend.dayDetail(day);
    if (st.selected !== day) return;
    const total = d.sets.reduce((a, s) => a + s.reps, 0), secs = d.sets.reduce((a, s) => a + s.secs, 0);
    const parts = [];
    if (d.rest) parts.push(`<div class="dd-row">${icon("moon")}<span>Rest day. Recovery counts toward your streak.</span></div>`);
    for (const s of d.sets) parts.push(`<div class="dd-row"><i class="sw" style="background:${EXERCISES[s.kind].color}"></i><span><b>${s.reps}</b> ${EXERCISES[s.kind].name.toLowerCase()}${s.source === "tap" ? ' <span class="tag">TAP</span>' : ""}</span><span class="num muted">${new Date(s.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${clock(s.secs)}</span></div>`);
    for (const r of d.records) { const m = recordMeta(r.key); parts.push(`<div class="dd-row gold">${icon("star")}<span>New record: ${esc(m.label)} · ${m.unit === "time" ? clock(r.value) : fmt(r.value)}</span></div>`); }
    for (const q of d.quests) parts.push(`<div class="dd-row">${icon("check")}<span>Quest: ${esc(q.title)}</span><span class="muted">+${q.xp} XP · +${q.grit} Grit</span></div>`);
    for (const u of d.unlocks) parts.push(`<div class="dd-row gold">${icon("trophy")}<span>Unlocked title: ${esc(titleName(u))}</span></div>`);
    el.innerHTML = `<div class="dd-head"><b>${dayLabel(day, { weekday: "long", month: "long", day: "numeric" })}</b><span class="muted num">${total ? `${fmt(total)} reps · ${d.sets.length} set${d.sets.length === 1 ? "" : "s"} · ${clock(secs)}` : ""}</span></div>
      ${parts.length ? parts.join("") : `<div class="muted">${day === st.data.today ? "Nothing logged yet today." : "Nothing logged this day."}</div>`}`;
  } catch (e) { el.innerHTML = `<div class="muted">Couldn’t load this day: ${esc(e.message)}</div>`; }
}

// ------------------------------------------------------------ recent
function renderRecent() {
  const ach = [
    ...st.data.recent_unlocks.map((u) => ({ at: u.created_at, html: `${icon("trophy")}<span>Unlocked <b>${esc(titleName(u.item_id))}</b></span>` })),
    ...st.data.recent_records.map((r) => { const m = recordMeta(r.key); return { at: r.achieved_at, html: `${icon("star")}<span>${esc(m.label)}: <b>${m.unit === "time" ? clock(r.value) : fmt(r.value)}</b></span>` }; })
  ].sort((a, b) => b.at < a.at ? -1 : 1).slice(0, 6);
  $("#hubAch").innerHTML = ach.length ? ach.map((a) => `<li>${a.html}<small>${relTime(a.at)}</small></li>`).join("") : `<li class="empty">Records and unlocked titles show up here.</li>`;
  const sets = st.data.recent_sets.slice(0, 6);
  $("#hubSets").innerHTML = sets.length ? sets.map((s) => `<li><i class="sw" style="background:${EXERCISES[s.kind].color}"></i><span><b>${s.reps}</b> ${EXERCISES[s.kind].name.toLowerCase()}${s.source === "tap" ? ' <span class="tag">TAP</span>' : ""}</span><small>${relTime(s.created_at)}</small></li>`).join("") : `<li class="empty">No workouts yet.</li>`;
}

// ------------------------------------------------------------ events
export function bindHub() {
  $("#rangeSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-range]"); if (b && st.data) { st.range = b.dataset.range; renderChart(); } });
  $("#chartTableBtn").addEventListener("click", () => { st.table = !st.table; if (st.data) renderChart(); });
  const chart = $("#chart");
  chart.addEventListener("pointermove", (e) => { const h = e.target.closest(".ch-hit"); if (h) showTip(+h.dataset.i); });
  chart.addEventListener("pointerdown", (e) => { const h = e.target.closest(".ch-hit"); if (h) showTip(+h.dataset.i); });
  chart.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTip(); });
  $("#hubRecords").addEventListener("click", (e) => { const b = e.target.closest("[data-rec]"); if (b) openRecord(b.dataset.rec); });
  $("#calGrid").addEventListener("click", (e) => { const b = e.target.closest("[data-day]"); if (b && !b.disabled) { if (!b.dataset.day.startsWith(st.month)) { st.month = b.dataset.day.slice(0, 7); renderCalendar(); } loadDay(b.dataset.day); } });
  const shiftMonth = (n) => { const [y, m] = st.month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); st.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; renderCalendar(); };
  $("#calPrev").addEventListener("click", () => shiftMonth(-1));
  $("#calNext").addEventListener("click", () => shiftMonth(1));
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (st.data && !$("#view-hub").hidden) renderChart(); }, 150); });
}
