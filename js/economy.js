/* ============================================================
   economy.js — Jerk Coins (JC), Gems, boosts, premium, rewards
   ------------------------------------------------------------
   JC is earned by playing (matches, bosses, daily & playtime
   rewards) and spent in the shop on auras. Gems are the premium
   currency (demo purchases only — no real payments) used for the
   2x JC boost and Premium.
   ============================================================ */
import { saveProfile } from "./storage.js";

export const BOOST_COST_GEMS = 100;
export const BOOST_MS = 20 * 60 * 1000;      // 20 minutes
export const PREMIUM_COST_GEMS = 500;
export const PLAY_CHUNK_S = 600;             // 10 min of playtime...
export const PLAY_REWARD_JC = 50;            // ...pays 50 JC

export function todayKey(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function boostActive(p) { return (p.boostUntil || 0) > Date.now(); }
export function boostRemainMin(p) {
  return boostActive(p) ? Math.ceil((p.boostUntil - Date.now()) / 60000) : 0;
}

export function jcMultiplier(p) {
  let m = 1;
  if (boostActive(p)) m *= 2;
  if (p.premium) m *= 1.5;
  return m;
}

/** Award JC for a finished match/boss. Returns { base, total, mult }.
 *  `scale` (e.g. 0.3 for keyboard mode) reduces the payout. */
export function earnJc(p, result, bossRewardJc = 0, scale = 1) {
  const base = Math.max(1, Math.round(
    (result.score * 0.04 + result.totalClaps * 0.4 + (result.won ? 25 : 8)) * scale
  ) + Math.round(bossRewardJc * scale));
  const mult = jcMultiplier(p);
  const total = Math.round(base * mult);
  p.jc = (p.jc || 0) + total;
  saveProfile(p);
  return { base, total, mult, scale };
}

// ---- Daily reward ----------------------------------------------------------
export function dailyInfo(p) {
  const claimable = p.lastDaily !== todayKey();
  const streak = p.dailyStreak || 0;
  const reward = 100 + Math.min(streak, 6) * 25 + (p.premium ? 100 : 0);
  return { claimable, reward, streak };
}

export function claimDaily(p) {
  const info = dailyInfo(p);
  if (!info.claimable) return null;
  p.dailyStreak = (p.lastDaily === todayKey(-1)) ? (p.dailyStreak || 0) + 1 : 1;
  p.lastDaily = todayKey();
  p.jc = (p.jc || 0) + info.reward;
  saveProfile(p);
  return info.reward;
}

// ---- Playtime reward -------------------------------------------------------
export function playtimeInfo(p) {
  const unclaimed = Math.max(0, (p.playSeconds || 0) - (p.playClaimedSeconds || 0));
  const chunks = Math.floor(unclaimed / PLAY_CHUNK_S);
  return {
    chunks,
    reward: chunks * PLAY_REWARD_JC,
    progress: (unclaimed % PLAY_CHUNK_S) / PLAY_CHUNK_S,
    remainMin: Math.ceil((PLAY_CHUNK_S - (unclaimed % PLAY_CHUNK_S)) / 60),
  };
}

export function claimPlaytime(p) {
  const info = playtimeInfo(p);
  if (info.chunks < 1) return null;
  p.playClaimedSeconds = (p.playClaimedSeconds || 0) + info.chunks * PLAY_CHUNK_S;
  p.jc = (p.jc || 0) + info.reward;
  saveProfile(p);
  return info.reward;
}

// ---- Gem spending ----------------------------------------------------------
export function buyBoost(p) {
  if ((p.gems || 0) < BOOST_COST_GEMS) return false;
  p.gems -= BOOST_COST_GEMS;
  p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + BOOST_MS;
  saveProfile(p);
  return true;
}

export function buyPremium(p) {
  if (p.premium || (p.gems || 0) < PREMIUM_COST_GEMS) return false;
  p.gems -= PREMIUM_COST_GEMS;
  p.premium = true;
  saveProfile(p);
  return true;
}

/** Demo gem grant — this game has no backend, so "purchases" are simulated. */
export function grantGems(p, n) {
  p.gems = (p.gems || 0) + n;
  saveProfile(p);
}

export function spendJc(p, amount) {
  if ((p.jc || 0) < amount) return false;
  p.jc -= amount;
  saveProfile(p);
  return true;
}
