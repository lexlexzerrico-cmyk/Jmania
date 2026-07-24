/* ============================================================
   quests.js — daily quests (3/day, JC rewards)
   ------------------------------------------------------------
   Three quests are picked deterministically from the pool per
   UTC day. Progress accumulates from match/boss results and is
   claimed in the lobby.
   ============================================================ */
import { saveProfile } from "./storage.js";
import { todayKey } from "./economy.js";

export const QUEST_POOL = [
  { id: "claps300",  desc: "Land 300 claps",             target: 300, reward: 120, prog: (r) => r.totalClaps },
  { id: "cps9",      desc: "Hit 9 claps/sec once",       target: 1,   reward: 150, prog: (r) => (r.peakCps >= 9 ? 1 : 0) },
  { id: "win2",      desc: "Win 2 matches",              target: 2,   reward: 140, prog: (r) => (r.won && r.hasOpponent ? 1 : 0) },
  { id: "maxmult2",  desc: "Max the ×2 multiplier twice", target: 2,  reward: 130, prog: (r) => (r.peakCombo >= 20 ? 1 : 0) },
  { id: "play3",     desc: "Finish 3 games",             target: 3,   reward: 100, prog: () => 1 },
  { id: "boss1",     desc: "Defeat any boss",            target: 1,   reward: 160, prog: (r) => (r.bossKill ? 1 : 0) },
  { id: "perfect5",  desc: "Land 5 PERFECT claps",       target: 5,   reward: 150, prog: (r) => r.perfects || 0 },
  { id: "ko1",       desc: "Win by knockout",            target: 1,   reward: 150, prog: (r) => (r.knockout && r.won ? 1 : 0) },
];

function pickToday() {
  // Deterministic 3 picks from the pool based on the date. Uses Math.imul
  // for a true 32-bit LCG (plain `*` overflows 2^53 and corrupts low bits)
  // and a Fisher-Yates shuffle so it always terminates with distinct picks.
  const key = todayKey();
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pool = QUEST_POOL.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  return pool.slice(0, 3).map((i) => QUEST_POOL[i].id);
}

/** Ensure today's quest set exists on the profile; returns quest state. */
export function ensureQuests(profile) {
  const key = todayKey();
  if (!profile.quests || profile.quests.date !== key) {
    profile.quests = {
      date: key,
      items: pickToday().map((id) => ({ id, prog: 0, claimed: false })),
    };
    saveProfile(profile);
  }
  return profile.quests;
}

/** Feed a finished game result into quest progress. */
export function questProgress(profile, result) {
  const q = ensureQuests(profile);
  let changed = false;
  for (const item of q.items) {
    const def = QUEST_POOL.find((d) => d.id === item.id);
    if (!def || item.claimed || item.prog >= def.target) continue;
    const add = def.prog(result) || 0;
    if (add > 0) { item.prog = Math.min(def.target, item.prog + add); changed = true; }
  }
  if (changed) saveProfile(profile);
  return q;
}

export function claimQuest(profile, id) {
  const q = ensureQuests(profile);
  const item = q.items.find((i) => i.id === id);
  const def = QUEST_POOL.find((d) => d.id === id);
  if (!item || !def || item.claimed || item.prog < def.target) return null;
  item.claimed = true;
  profile.jc = (profile.jc || 0) + def.reward;
  saveProfile(profile);
  return def.reward;
}

export function questDef(id) { return QUEST_POOL.find((d) => d.id === id); }
