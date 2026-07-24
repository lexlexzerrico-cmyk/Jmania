/* ============================================================
   achievements.js — unlockable badges
   ------------------------------------------------------------
   Each achievement has a test(ctx) predicate evaluated after
   every match. ctx = { profile, result, level, rankIndex }.
   ============================================================ */

export const ACHIEVEMENTS = [
  { id: "first_match", icon: "🎬", name: "First Steps",      desc: "Play your first match.",
    test: (c) => c.profile.stats.matches >= 1 },
  { id: "speed_8",     icon: "⚡", name: "Quick Hands",       desc: "Reach 8 claps per second.",
    test: (c) => c.result.peakCps >= 8 },
  { id: "speed_12",    icon: "🌪️", name: "Blur",              desc: "Reach 12 claps per second.",
    test: (c) => c.result.peakCps >= 12 },
  { id: "combo_max",   icon: "🔥", name: "Max Multiplier",    desc: "Hit the ×6 combo cap.",
    test: (c) => (1 + c.result.peakCombo * 0.2) >= 6 },
  { id: "knockout",    icon: "💥", name: "Knockout Blow",     desc: "Win a 1v1 by knockout.",
    test: (c) => c.result.knockout && c.result.won },
  { id: "flawless",    icon: "🛡️", name: "Domination",        desc: "Win a 1v1 keeping the rival under 20%.",
    test: (c) => c.result.hasOpponent && c.result.won && c.result.foeBar <= 20 },
  { id: "centurion",   icon: "💯", name: "Centurion",         desc: "Land 100 claps in a single match.",
    test: (c) => c.result.totalClaps >= 100 },
  { id: "marathon",    icon: "🏃", name: "Marathoner",        desc: "Finish a 2-minute match.",
    test: (c) => c.result.duration >= 120 },
  { id: "reach_gold",  icon: "🥇", name: "Gold Standard",     desc: "Climb to Gold or higher.",
    test: (c) => c.rankIndex >= 9 },
  { id: "reach_diamond", icon: "🔷", name: "Carats",          desc: "Climb to Diamond or higher.",
    test: (c) => c.rankIndex >= 15 },
  { id: "reach_radiant", icon: "🌟", name: "Radiant",         desc: "Reach the Radiant rank.",
    test: (c) => c.rankIndex >= 24 },
  { id: "level_10",    icon: "⭐", name: "Seasoned",          desc: "Reach level 10.",
    test: (c) => c.level >= 10 },
  { id: "level_25",    icon: "🌠", name: "Veteran",           desc: "Reach level 25.",
    test: (c) => c.level >= 25 },
  { id: "grinder",     icon: "🎰", name: "Grinder",           desc: "Play 25 matches.",
    test: (c) => c.profile.stats.matches >= 25 },
  { id: "clap_5000",   icon: "👐", name: "Clap Machine",      desc: "Clap 5,000 times total.",
    test: (c) => c.profile.stats.totalClaps >= 5000 },
];

/**
 * Evaluate achievements against the given context and mark newly
 * unlocked ones on profile.achievements. Returns the newly unlocked list.
 */
export function checkAchievements(profile, ctx) {
  if (!Array.isArray(profile.achievements)) profile.achievements = [];
  const owned = new Set(profile.achievements);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (owned.has(a.id)) continue;
    try {
      if (a.test(ctx)) { owned.add(a.id); fresh.push(a); }
    } catch { /* ignore bad predicate */ }
  }
  profile.achievements = [...owned];
  return fresh;
}

export function isUnlocked(profile, id) {
  return Array.isArray(profile.achievements) && profile.achievements.includes(id);
}
