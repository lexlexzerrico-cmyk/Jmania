// Two interchangeable backends with the same methods:
//   Supabase (public, shared leaderboards) when config.js has keys, otherwise Local (this device only).
// Local mirrors the server rules in supabase/schema.sql so the game plays the same offline.
import { item, EARNED_TITLES, EXERCISES, KINDS, QUESTS } from "./catalog.js";

const BOARDS = {
  weekly: { label: "This week", col: "reps" },
  rank:   { label: "Rank",      col: "rp" },
  push:   { label: "Push-ups",  col: "total_push" },
  sit:    { label: "Sit-ups",   col: "total_sit" },
  squat:  { label: "Squats",    col: "total_squat" },
  total:  { label: "All reps",  col: "total_reps" }
};
export { BOARDS };

const PUBLIC_COLS = "id,username,title,theme,rp,total_push,total_sit,total_squat,total_reps,best_set,streak";

function boostOn(boosts, k) { const v = boosts?.[k]; return typeof v === "string" && new Date(v).getTime() > Date.now(); }

// Same maths as submit_set() in schema.sql — used for previews in both modes.
export function previewEarn(p, { kind, reps, source, music }) {
  const tap = source === "tap" ? 0.5 : 1;
  return {
    rp: Math.round(reps * (EXERCISES[kind]?.rp ?? 1) * tap * (boostOn(p.boosts, "rankrush") ? 1.25 : 1)),
    xp: reps * 2 * (boostOn(p.boosts, "xpsurge") ? 2 : 1),
    grit: Math.round(reps * tap * (boostOn(p.boosts, "grit2x") ? 2 : 1) * (music ? 1.1 : 1))
  };
}
export { boostOn };

// ---- calendar-day helpers (YYYY-MM-DD strings; maths done in UTC so DST never shifts a day)
export const localDay = (ms = Date.now()) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const weekStart = (day) => addDays(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ------------------------------------------------------------------ local
class LocalBackend {
  constructor() { this.mode = "local"; this.KEY = "repforge-local-v1"; }

  _load() {
    let d; try { d = JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { d = null; }
    if (d && d.v !== 2) this._upgrade(d);
    return d;
  }
  // v1 local saves -> v2: number sets, add days/sessions, new counters, records from history.
  _upgrade(d) {
    const p = d.profile;
    Object.assign(p, { total_squat: p.total_squat || 0, quests_done: p.quests_done || 0, rest_count: p.rest_count || 0, records_count: p.records_count || 0, tz: "local" });
    d.sets = (d.sets || []).map((s, i) => ({ id: i + 1, ...s, local_day: s.local_day || localDay(s.at), session_start: s.session_start || s.at - (s.secs || 0) * 1000 }));
    d.rests = d.rests || []; d.claims = d.claims || []; d.unlocks = d.unlocks || []; d.records = d.records || [];
    if (!d.records.length && d.sets.length) {
      const byDay = {}, byWeek = {};
      for (const s of d.sets) {
        if (s.source === "cam") {
          const k = "set_" + s.kind, cur = d.records.find((r) => r.key === k);
          if (!cur) d.records.push({ key: k, value: s.reps, prev: 0, period: String(s.id), day: s.local_day, at: s.at });
          else if (s.reps > cur.value) Object.assign(cur, { value: s.reps, period: String(s.id), day: s.local_day, at: s.at });
        }
        byDay[s.local_day] = (byDay[s.local_day] || 0) + s.reps;
      }
      for (const [day, reps] of Object.entries(byDay)) { const w = weekStart(day); byWeek[w] = byWeek[w] || { reps: 0, days: 0 }; byWeek[w].reps += reps; byWeek[w].days++; }
      const top = (obj, f) => Object.entries(obj).sort((a, b) => f(b[1]) - f(a[1]))[0];
      const bd = top(byDay, (x) => x); if (bd) d.records.push({ key: "day_reps", value: bd[1], prev: 0, period: bd[0], day: bd[0], at: Date.parse(bd[0]) });
      const bw = top(byWeek, (x) => x.reps); if (bw) d.records.push({ key: "week_reps", value: bw[1].reps, prev: 0, period: bw[0], day: bw[0], at: Date.parse(bw[0]) });
      const bc = top(byWeek, (x) => x.days); if (bc) d.records.push({ key: "week_days", value: bc[1].days, prev: 0, period: bc[0], day: bc[0], at: Date.parse(bc[0]) });
    }
    d.v = 2; this._save(d);
  }
  _save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {} }
  _need() { const d = this._load(); if (!d) throw new Error("Create your player name first"); return d; }
  _fix(p) { p.total_reps = p.total_push + p.total_sit + (p.total_squat || 0); return p; }
  _today() { return localDay(); }

  _metric(d, m, d0, d1) {
    const sets = d.sets.filter((s) => s.local_day >= d0 && s.local_day <= d1);
    const sum = (arr) => arr.reduce((a, s) => a + s.reps, 0);
    switch (m) {
      case "reps": return sum(sets);
      case "reps_push": case "reps_sit": case "reps_squat": return sum(sets.filter((s) => s.kind === m.slice(5)));
      case "sets": return sets.length;
      case "cam_sets": return sets.filter((s) => s.source === "cam").length;
      case "secs": return sets.reduce((a, s) => a + s.secs, 0);
      case "days": return new Set(sets.map((s) => s.local_day)).size;
      case "records": return d.records.filter((r) => r.day >= d0 && r.day <= d1 && r.prev > 0).length;
      case "rest": return d.rests.filter((r) => r >= d0 && r <= d1).length;
      case "checkin": return new Set([...sets.map((s) => s.local_day), ...d.rests.filter((r) => r >= d0 && r <= d1)]).size;
      default: return 0;
    }
  }
  _assigned(today) {
    const pool = QUESTS.filter((q) => q.period === "daily" && q.slot === "pool").sort((a, b) => hash(today + a.id) - hash(today + b.id)).slice(0, 3);
    return [...QUESTS.filter((q) => q.period === "daily" && q.slot === "fixed"), ...pool, ...QUESTS.filter((q) => q.period === "weekly")];
  }
  _record(d, key, val, period, setId, today) {
    const best = Math.max(0, ...d.records.filter((r) => r.key === key).map((r) => r.value));
    if (val <= best) return null;
    const last = d.records.filter((r) => r.key === key).sort((a, b) => b.at - a.at)[0];
    if (last && last.period === period) { Object.assign(last, { value: val, set_id: setId, day: today, at: Date.now() }); return null; }
    d.records.push({ key, value: val, prev: best, period, set_id: setId, day: today, at: Date.now() });
    return best;
  }
  _streak(p, today) {
    const sh = Number(p.boosts.shield || 0);
    if (p.last_active && p.last_active >= today) return;
    if (p.last_active === addDays(today, -1)) p.streak++;
    else if (p.last_active === addDays(today, -2) && sh > 0) { p.streak++; p.boosts.shield = sh - 1; }
    else p.streak = 1;
    p.last_active = today;
  }
  _unlock(d, id, src, today) {
    const p = d.profile; if (p.inventory.includes(id)) return false;
    p.inventory.push(id); p.grit += 100; d.unlocks.push({ item_id: id, source: src, local_day: today, at: Date.now() }); return true;
  }

  async init() { const d = this._load(); return d ? this._fix(d.profile) : null; }
  async setTimezone() { return null; }
  async createProfile(username) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error("Names are 3-16 letters, numbers or underscores");
    const d = this._load();
    if (d) { d.profile.username = username; this._save(d); return this._fix(d.profile); }
    const profile = { id: "local", username, title: "rookie", theme: "ember", grit: 150, xp: 0, rp: 0,
      total_push: 0, total_sit: 0, total_squat: 0, best_set: 0, sets_count: 0, streak: 0, last_active: null, last_daily: null,
      inventory: ["rookie", "ember"], boosts: {}, quests_done: 0, rest_count: 0, records_count: 0, tz: "local" };
    this._save({ v: 2, profile, sets: [], rests: [], claims: [], unlocks: [], records: [] });
    return this._fix(profile);
  }
  async submitSet({ kind, reps, secs, source, music }) {
    const d = this._need(), p = d.profile, today = this._today(), wk = weekStart(today);
    if (!KINDS.includes(kind)) throw new Error("Unknown exercise");
    if (reps < 1 || reps > 300) throw new Error("A set has to be 1-300 reps");
    if (secs < Math.ceil(reps * 0.5) || secs > 7200) throw new Error("That set was too fast to count (max 2 reps a second)");
    const last = d.sets[d.sets.length - 1];
    if (last && Date.now() - last.at < 5000) throw new Error("Wait a few seconds between sets");
    const e = previewEarn(p, { kind, reps, source, music });

    const ri = d.rests.indexOf(today); if (ri >= 0) { d.rests.splice(ri, 1); p.rest_count = Math.max(0, p.rest_count - 1); }
    this._streak(p, today);
    p.rp += e.rp; p.xp += e.xp; p.grit += e.grit;
    p["total_" + kind] = (p["total_" + kind] || 0) + reps;
    p.best_set = Math.max(p.best_set, reps); p.sets_count++;
    const session_start = last && Date.now() - last.at < 15 * 60000 ? last.session_start : Date.now() - secs * 1000;
    const set = { id: (last?.id || 0) + 1, kind, reps, secs, source, at: Date.now(), local_day: today, session_start, ...e };
    d.sets.push(set);

    const recs = [];
    const rec = (key, val, period) => { const r = this._record(d, key, val, period, set.id, today); if (r > 0) recs.push({ key, value: val, prev: r }); };
    if (source === "cam") rec("set_" + kind, reps, String(set.id));
    rec("day_reps", this._metric(d, "reps", today, today), today);
    rec("week_reps", this._metric(d, "reps", wk, addDays(wk, 6)), wk);
    rec("session_secs", Math.round((Date.now() - session_start) / 1000), String(session_start));
    rec("week_days", this._metric(d, "days", wk, addDays(wk, 6)), wk);
    p.records_count += recs.length;

    const total = p.total_push + p.total_sit + p.total_squat, unlocks = [];
    const test = { first_set: true, fifty: reps >= 50, century: reps >= 100, k1: total >= 1000, k10: total >= 10000,
      streak7: p.streak >= 7, streak30: p.streak >= 30, gilded: p.rp >= 1750, legend: p.rp >= 14000, recordbreaker: p.records_count >= 5 };
    for (const t of EARNED_TITLES) if (test[t] && this._unlock(d, t, "set", today)) unlocks.push(t);
    this._save(d);
    return { profile: this._fix(p), earned: { ...e, bonus: unlocks.length * 100 }, unlocks, records: recs };
  }
  async logRestDay() {
    const d = this._need(), p = d.profile, today = this._today(), wk = weekStart(today);
    if (d.sets.some((s) => s.local_day === today)) throw new Error("You trained today already. Rest days are for days off.");
    if (d.rests.includes(today)) throw new Error("Today is already a rest day");
    if (d.rests.filter((r) => r >= wk && r <= addDays(wk, 6)).length >= 2) throw new Error("You can log up to 2 rest days a week");
    d.rests.push(today); this._streak(p, today); p.rest_count++;
    const unlocks = p.rest_count >= 5 && this._unlock(d, "restwise", "rest", today) ? ["restwise"] : [];
    this._save(d); return { profile: this._fix(p), unlocks };
  }
  async getQuests() {
    const d = this._need(), p = d.profile, today = this._today(), wk = weekStart(today);
    const quests = this._assigned(today).map((q) => {
      const [d0, d1] = q.period === "daily" ? [today, today] : [wk, addDays(wk, 6)];
      return { ...q, progress: Math.min(this._metric(d, q.metric, d0, d1), q.target), claimed: d.claims.some((c) => c.quest_id === q.id && c.period_start === d0) };
    });
    const midnight = (day) => { const [y, m, dd] = day.split("-").map(Number); return new Date(y, m - 1, dd).toISOString(); };
    return { today, week_start: wk, daily_reset: midnight(addDays(today, 1)), weekly_reset: midnight(addDays(wk, 7)), quests,
      quests_done: p.quests_done, trained_today: d.sets.some((s) => s.local_day === today), rested_today: d.rests.includes(today),
      rest_this_week: d.rests.filter((r) => r >= wk && r <= addDays(wk, 6)).length };
  }
  async claimQuest(id) {
    const d = this._need(), p = d.profile, today = this._today();
    const q = this._assigned(today).find((x) => x.id === id);
    if (!q) throw new Error("That quest isn't active right now");
    const d0 = q.period === "daily" ? today : weekStart(today), d1 = q.period === "daily" ? today : addDays(d0, 6);
    if (d.claims.some((c) => c.quest_id === id && c.period_start === d0)) throw new Error("Reward already claimed");
    const prog = this._metric(d, q.metric, d0, d1);
    if (prog < q.target) throw new Error(`Not finished yet (${prog} of ${q.target})`);
    d.claims.push({ quest_id: id, period_start: d0, xp: q.xp, grit: q.grit, local_day: today, at: Date.now() });
    p.xp += q.xp; p.grit += q.grit; p.quests_done++;
    const unlocks = p.quests_done >= 25 && this._unlock(d, "questbound", "quest", today) ? ["questbound"] : [];
    this._save(d); return { profile: this._fix(p), xp: q.xp, grit: q.grit, unlocks };
  }
  async dashboard() {
    const d = this._need(), today = this._today(), d0 = addDays(today, -399);
    const days = {};
    for (const s of d.sets) {
      if (s.local_day < d0) continue;
      const x = days[s.local_day] ||= { d: s.local_day, push: 0, sit: 0, squat: 0, sets: 0, cam_sets: 0, secs: 0 };
      x[s.kind] += s.reps; x.sets++; x.secs += s.secs; if (s.source === "cam") x.cam_sets++;
    }
    const count = (arr, f) => { const m = {}; for (const a of arr) { const k = f(a); if (k >= d0) m[k] = (m[k] || 0) + 1; } return Object.entries(m).map(([d, n]) => ({ d, n })); };
    const best = {};
    for (const r of d.records) if (!best[r.key] || r.value > best[r.key].value) best[r.key] = r;
    const iso = (r) => ({ ...r, achieved_at: new Date(r.at).toISOString() });
    return {
      today, days: Object.values(days).sort((a, b) => a.d < b.d ? -1 : 1), rest: d.rests.filter((r) => r >= d0),
      quest_days: count(d.claims, (c) => c.local_day), record_days: count(d.records.filter((r) => r.prev > 0), (r) => r.day),
      unlock_days: count(d.unlocks, (u) => u.local_day),
      records: Object.values(best).map(iso),
      recent_unlocks: d.unlocks.slice(-8).reverse().map((u) => ({ ...u, created_at: new Date(u.at).toISOString() })),
      recent_records: d.records.filter((r) => r.prev > 0).sort((a, b) => b.at - a.at).slice(0, 8).map(iso),
      recent_sets: d.sets.slice(-10).reverse().map((s) => ({ ...s, created_at: new Date(s.at).toISOString() }))
    };
  }
  async dayDetail(day) {
    const d = this._need();
    return {
      day, rest: d.rests.includes(day),
      sets: d.sets.filter((s) => s.local_day === day).map((s) => ({ ...s, created_at: new Date(s.at).toISOString() })),
      records: d.records.filter((r) => r.day === day && r.prev > 0),
      quests: d.claims.filter((c) => c.local_day === day).map((c) => ({ ...c, title: QUESTS.find((q) => q.id === c.quest_id)?.title || c.quest_id })),
      unlocks: d.unlocks.filter((u) => u.local_day === day).map((u) => u.item_id)
    };
  }
  async recordHistory(key) {
    const d = this._need();
    return d.records.filter((r) => r.key === key).sort((a, b) => b.at - a.at).map((r) => ({ ...r, achieved_at: new Date(r.at).toISOString() }));
  }
  async claimDaily() {
    const d = this._need(), p = d.profile, today = this._today();
    if (p.last_daily && p.last_daily >= today) throw new Error("Daily drop already claimed. Come back tomorrow");
    const amount = 50 + 10 * Math.min(p.streak, 10);
    p.grit += amount; p.last_daily = today; this._save(d);
    return { profile: this._fix(p), amount };
  }
  async buy(id) {
    const d = this._need(), p = d.profile, it = item(id);
    if (!it || it.price == null) throw new Error("That item is not for sale");
    if (p.grit < it.price) throw new Error("Not enough Grit yet");
    if (it.kind !== "boost") { if (p.inventory.includes(id)) throw new Error("You already own this"); p.inventory.push(id); }
    else if (id === "shield") { const s = Number(p.boosts.shield || 0); if (s >= 3) throw new Error("You can hold up to 3 Streak Shields"); p.boosts.shield = s + 1; }
    else { const from = Math.max(Date.now(), new Date(p.boosts[id] || 0).getTime()); p.boosts[id] = new Date(from + it.minutes * 60000).toISOString(); }
    p.grit -= it.price; this._save(d);
    return { profile: this._fix(p) };
  }
  async equip(id) {
    const d = this._need(), p = d.profile, it = item(id);
    if (!p.inventory.includes(id)) throw new Error("Unlock this first");
    if (it.kind === "theme") p.theme = id; else if (it.kind === "title") p.title = id; else throw new Error("That can't be equipped");
    this._save(d); return { profile: this._fix(p) };
  }
  async leaderboard(board) {
    const d = this._load(); if (!d) return { rows: [], me: null };
    const p = this._fix(d.profile), col = BOARDS[board].col;
    const weekAgo = Date.now() - 7 * 86400000;
    const value = board === "weekly" ? d.sets.filter((s) => s.at > weekAgo).reduce((a, s) => a + s.reps, 0) : p[col] || 0;
    return { rows: value || board !== "weekly" ? [{ ...p, value }] : [], me: { pos: 1, value } };
  }
  async recentSets() { const d = this._load(); return (d?.sets || []).slice(-8).reverse().map((s) => ({ ...s, created_at: new Date(s.at).toISOString() })); }
}

// ------------------------------------------------------------------ supabase
class SupaBackend {
  constructor(url, key) {
    this.mode = "online";
    this.sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
    this.uid = null;
  }
  _err(error) { if (error) throw new Error(error.message || String(error)); }
  async _rpc(fn, args) { const { data, error } = await this.sb.rpc(fn, args); this._err(error); return data; }
  async init() {
    const { data } = await this.sb.auth.getSession();
    this.uid = data.session?.user?.id || null;
    if (!this.uid) return null;
    const { data: p, error } = await this.sb.from("profiles").select("*").eq("id", this.uid).maybeSingle();
    this._err(error);
    return p;
  }
  async createProfile(username) {
    if (!this.uid) {
      const { data, error } = await this.sb.auth.signInAnonymously();
      if (error) throw new Error(/anonymous/i.test(error.message)
        ? "Anonymous sign-ins are off in Supabase. Turn them on: Authentication → Sign In / Providers → Allow anonymous sign-ins."
        : error.message);
      this.uid = data.user.id;
    }
    return this._rpc("create_profile", { p_username: username });
  }
  setTimezone(tz) { return this._rpc("set_timezone", { p_tz: tz }); }
  submitSet({ kind, reps, secs, source, music }) { return this._rpc("submit_set", { p_kind: kind, p_reps: reps, p_secs: secs, p_source: source, p_music: !!music }); }
  logRestDay() { return this._rpc("log_rest_day"); }
  getQuests() { return this._rpc("get_quests"); }
  claimQuest(id) { return this._rpc("claim_quest", { p_quest: id }); }
  dashboard() { return this._rpc("get_dashboard", { p_days: 400 }); }
  dayDetail(day) { return this._rpc("day_detail", { p_day: day }); }
  recordHistory(key) { return this._rpc("record_history", { p_key: key }); }
  claimDaily() { return this._rpc("claim_daily"); }
  buy(id) { return this._rpc("buy_item", { p_item: id }); }
  equip(id) { return this._rpc("equip", { p_item: id }); }
  async leaderboard(board, me) {
    const col = BOARDS[board].col;
    if (board === "weekly") {
      const { data, error } = await this.sb.from("lb_weekly").select("*"); this._err(error);
      const rows = data.map((r) => ({ ...r, value: r.reps }));
      const i = rows.findIndex((r) => r.id === this.uid);
      return { rows, me: i >= 0 ? { pos: i + 1, value: rows[i].value } : null };
    }
    const { data, error } = await this.sb.from("profiles").select(PUBLIC_COLS).order(col, { ascending: false }).order("created_at").limit(100);
    this._err(error);
    const rows = data.map((r) => ({ ...r, value: r[col] }));
    let pos = null;
    if (me) {
      const { count } = await this.sb.from("profiles").select("id", { count: "exact", head: true }).gt(col, me[col] ?? 0);
      pos = (count ?? 0) + 1;
    }
    return { rows, me: me ? { pos, value: me[col] ?? 0 } : null };
  }
  async recentSets() {
    if (!this.uid) return [];
    const { data, error } = await this.sb.from("sets").select("kind,reps,secs,source,rp,grit,created_at").eq("user_id", this.uid).order("created_at", { ascending: false }).limit(8);
    this._err(error); return data;
  }
  async email() { const { data } = await this.sb.auth.getUser(); return data.user?.email || null; }
  async linkEmail(email) {
    const { error } = await this.sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + location.pathname });
    this._err(error);
  }
  async signInEmail(email) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    this._err(error);
  }
  async signOut() { await this.sb.auth.signOut(); this.uid = null; }
}

export function createBackend(cfg) {
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase?.createClient) {
    try { return new SupaBackend(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY); } catch (e) { console.error(e); }
  }
  return new LocalBackend();
}
