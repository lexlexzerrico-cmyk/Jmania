// Two interchangeable backends with the same methods:
//   Supabase (public, shared leaderboards) when config.js has keys, otherwise Local (this device only).
// Local mirrors the server rules in supabase/schema.sql so the game plays the same offline.
import { item, EARNED_TITLES } from "./catalog.js";

const BOARDS = {
  weekly: { label: "This week", col: "reps" },
  rank:   { label: "Rank",      col: "rp" },
  push:   { label: "Push-ups",  col: "total_push" },
  sit:    { label: "Sit-ups",   col: "total_sit" },
  total:  { label: "All reps",  col: "total_reps" }
};
export { BOARDS };

const PUBLIC_COLS = "id,username,title,theme,rp,total_push,total_sit,total_reps,best_set,streak";

function boostOn(boosts, k) { const v = boosts?.[k]; return typeof v === "string" && new Date(v).getTime() > Date.now(); }

// Same maths as submit_set() in schema.sql — used for previews in both modes.
export function previewEarn(p, { kind, reps, source, music }) {
  const tap = source === "tap" ? 0.5 : 1;
  return {
    rp: Math.round(reps * (kind === "push" ? 1 : 0.8) * tap * (boostOn(p.boosts, "rankrush") ? 1.25 : 1)),
    xp: reps * 2 * (boostOn(p.boosts, "xpsurge") ? 2 : 1),
    grit: Math.round(reps * tap * (boostOn(p.boosts, "grit2x") ? 2 : 1) * (music ? 1.1 : 1))
  };
}
export { boostOn };

// ------------------------------------------------------------------ local
class LocalBackend {
  constructor() { this.mode = "local"; this.KEY = "repforge-local-v1"; }
  _load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { return null; } }
  _save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {} }
  _today() { return new Date().toISOString().slice(0, 10); }
  _days(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  _fix(p) { p.total_reps = p.total_push + p.total_sit; return p; }

  async init() { const d = this._load(); return d ? this._fix(d.profile) : null; }
  async createProfile(username) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error("Names are 3-16 letters, numbers or underscores");
    const d = this._load();
    if (d) { d.profile.username = username; this._save(d); return this._fix(d.profile); }
    const profile = { id: "local", username, title: "rookie", theme: "ember", grit: 150, xp: 0, rp: 0,
      total_push: 0, total_sit: 0, best_set: 0, sets_count: 0, streak: 0, last_active: null, last_daily: null,
      inventory: ["rookie", "ember"], boosts: {} };
    this._save({ profile, sets: [] });
    return this._fix(profile);
  }
  async submitSet({ kind, reps, secs, source, music }) {
    const d = this._load(); if (!d) throw new Error("Create your player name first");
    const p = d.profile, today = this._today();
    if (reps < 1 || reps > 300) throw new Error("A set has to be 1-300 reps");
    if (secs < Math.ceil(reps * 0.5)) throw new Error("That set was too fast to count (max 2 reps a second)");
    const last = d.sets[d.sets.length - 1];
    if (last && Date.now() - last.at < 5000) throw new Error("Wait a few seconds between sets");
    const e = previewEarn(p, { kind, reps, source, music });

    const sh = Number(p.boosts.shield || 0);
    if (p.last_active === today) {}
    else if (p.last_active && this._days(p.last_active, today) === 1) p.streak++;
    else if (p.last_active && this._days(p.last_active, today) === 2 && sh > 0) { p.streak++; p.boosts.shield = sh - 1; }
    else p.streak = 1;
    p.last_active = today;

    p.rp += e.rp; p.xp += e.xp; p.grit += e.grit;
    if (kind === "push") p.total_push += reps; else p.total_sit += reps;
    p.best_set = Math.max(p.best_set, reps); p.sets_count++;
    const total = p.total_push + p.total_sit;
    const unlocks = [];
    const test = { first_set: true, fifty: reps >= 50, century: reps >= 100, k1: total >= 1000, k10: total >= 10000,
      streak7: p.streak >= 7, streak30: p.streak >= 30, gilded: p.rp >= 1750, legend: p.rp >= 14000 };
    for (const t of EARNED_TITLES) if (!p.inventory.includes(t) && test[t]) { unlocks.push(t); p.inventory.push(t); }
    const bonus = unlocks.length * 100; p.grit += bonus;
    d.sets.push({ kind, reps, secs, source, at: Date.now(), ...e });
    this._save(d);
    return { profile: this._fix(p), earned: { ...e, bonus }, unlocks };
  }
  async claimDaily() {
    const d = this._load(), p = d.profile, today = this._today();
    if (p.last_daily === today) throw new Error("Daily drop already claimed. Come back tomorrow");
    const amount = 50 + 10 * Math.min(p.streak, 10);
    p.grit += amount; p.last_daily = today; this._save(d);
    return { profile: this._fix(p), amount };
  }
  async buy(id) {
    const d = this._load(), p = d.profile, it = item(id);
    if (!it || it.price == null) throw new Error("That item is not for sale");
    if (p.grit < it.price) throw new Error("Not enough Grit yet");
    if (it.kind !== "boost") { if (p.inventory.includes(id)) throw new Error("You already own this"); p.inventory.push(id); }
    else if (id === "shield") { const s = Number(p.boosts.shield || 0); if (s >= 3) throw new Error("You can hold up to 3 Streak Shields"); p.boosts.shield = s + 1; }
    else { const from = Math.max(Date.now(), new Date(p.boosts[id] || 0).getTime()); p.boosts[id] = new Date(from + it.minutes * 60000).toISOString(); }
    p.grit -= it.price; this._save(d);
    return { profile: this._fix(p) };
  }
  async equip(id) {
    const d = this._load(), p = d.profile, it = item(id);
    if (!p.inventory.includes(id)) throw new Error("Unlock this first");
    if (it.kind === "theme") p.theme = id; else if (it.kind === "title") p.title = id; else throw new Error("That can't be equipped");
    this._save(d); return { profile: this._fix(p) };
  }
  async leaderboard(board) {
    const d = this._load(); if (!d) return { rows: [], me: null };
    const p = this._fix(d.profile), col = BOARDS[board].col;
    const weekAgo = Date.now() - 7 * 86400000;
    const value = board === "weekly" ? d.sets.filter((s) => s.at > weekAgo).reduce((a, s) => a + s.reps, 0) : p[col];
    const row = { ...p, value };
    return { rows: value || board !== "weekly" ? [row] : [], me: { pos: 1, value } };
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
    const { data, error } = await this.sb.rpc("create_profile", { p_username: username });
    this._err(error); return data;
  }
  async submitSet({ kind, reps, secs, source, music }) {
    const { data, error } = await this.sb.rpc("submit_set", { p_kind: kind, p_reps: reps, p_secs: secs, p_source: source, p_music: !!music });
    this._err(error); return data;
  }
  async claimDaily() { const { data, error } = await this.sb.rpc("claim_daily"); this._err(error); return data; }
  async buy(id) { const { data, error } = await this.sb.rpc("buy_item", { p_item: id }); this._err(error); return data; }
  async equip(id) { const { data, error } = await this.sb.rpc("equip", { p_item: id }); this._err(error); return data; }
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
      const { count } = await this.sb.from("profiles").select("id", { count: "exact", head: true }).gt(col, me[col]);
      pos = (count ?? 0) + 1;
    }
    return { rows, me: me ? { pos, value: me[col] } : null };
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
