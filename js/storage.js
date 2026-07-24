/* ============================================================
   storage.js — profile persistence + progression logic
   ============================================================ */
import { levelFromXp, rankFromIndex, RR_PER_DIVISION, MAX_RANK_INDEX } from "./ranks.js";

const KEY = "jerkmania.profile.v1";

const DEFAULT_PROFILE = {
  name: "Player",
  xp: 0,
  rankIndex: 0,   // flat ladder index
  rr: 30,         // rating within current division (0-100)
  stats: {
    matches: 0,
    wins: 0,
    totalClaps: 0,
    bestScore: 0,
    bestCps: 0,
    bestCombo: 0,
  },
  settings: {
    sensitivity: 0.5,   // 0..1
    musicOn: true,
    camOn: false,       // webcam feed (off by default for privacy)
  },
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const p = JSON.parse(raw);
    // shallow-merge to survive schema additions
    return {
      ...structuredClone(DEFAULT_PROFILE),
      ...p,
      stats: { ...DEFAULT_PROFILE.stats, ...(p.stats || {}) },
      settings: { ...DEFAULT_PROFILE.settings, ...(p.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore quota */ }
}

// ---- Progression -----------------------------------------------------------

/**
 * Apply a completed match to the profile.
 * @returns a report describing xp/rr deltas and rank changes for animation.
 */
export function applyMatchResult(profile, result) {
  const before = {
    xp: profile.xp,
    level: levelFromXp(profile.xp),
    rankIndex: profile.rankIndex,
    rr: profile.rr,
  };

  // XP from score (all modes give xp)
  const xpGain = Math.round(result.score * 0.35 + result.totalClaps * 2 + (result.won ? 60 : 0));
  profile.xp += xpGain;

  // RR only moves in ranked / 1v1
  let rrDelta = 0;
  let rankChange = 0; // -1 demote, +1 promote, 0 none
  if (result.ranked) {
    if (result.won) {
      rrDelta = 18 + Math.round(Math.min(14, result.margin * 0.4));
    } else {
      rrDelta = -(15 + Math.round(Math.min(10, (result.margin || 0) * 0.3)));
    }
    // Performance bonus regardless — big scores soften losses
    rrDelta += Math.round(Math.min(8, result.score / 220));

    profile.rr += rrDelta;
    while (profile.rr >= RR_PER_DIVISION && profile.rankIndex < MAX_RANK_INDEX) {
      profile.rr -= RR_PER_DIVISION;
      profile.rankIndex++;
      rankChange = 1;
    }
    while (profile.rr < 0 && profile.rankIndex > 0) {
      profile.rr += RR_PER_DIVISION;
      profile.rankIndex--;
      rankChange = -1;
    }
    profile.rr = Math.max(0, Math.min(RR_PER_DIVISION, profile.rr));
    if (profile.rankIndex >= MAX_RANK_INDEX) profile.rr = Math.min(profile.rr, RR_PER_DIVISION);
  }

  // Stats
  const s = profile.stats;
  s.matches += 1;
  if (result.won) s.wins += 1;
  s.totalClaps += result.totalClaps;
  s.bestScore = Math.max(s.bestScore, result.score);
  s.bestCps = Math.max(s.bestCps, result.peakCps);
  s.bestCombo = Math.max(s.bestCombo, result.peakCombo);

  saveProfile(profile);

  return {
    xpGain,
    rrDelta,
    rankChange,
    before,
    after: {
      xp: profile.xp,
      level: levelFromXp(profile.xp),
      rankIndex: profile.rankIndex,
      rr: profile.rr,
    },
    rankBefore: rankFromIndex(before.rankIndex),
    rankAfter: rankFromIndex(profile.rankIndex),
    leveledUp: levelFromXp(profile.xp) > before.level,
  };
}

export function resetProfile() {
  const p = structuredClone(DEFAULT_PROFILE);
  saveProfile(p);
  return p;
}
