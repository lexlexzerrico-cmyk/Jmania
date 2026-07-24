/* ============================================================
   ranks.js — Valorant-style tiers + level curve
   ============================================================ */

// Tiers ordered low → high. Each tier (except Radiant) has 3 divisions.
// `metal` = [highlight, mid, shadow] for the gem gradient on the emblem.
export const TIERS = [
  { key: "iron",       name: "Iron",       emblem: "⚙️", glow: "rgba(150,150,160,0.5)",  divisions: 3, metal: ["#9aa0ab", "#5c626e", "#33373f"] },
  { key: "bronze",     name: "Bronze",     emblem: "🥉", glow: "rgba(190,120,70,0.5)",   divisions: 3, metal: ["#e6a76b", "#b06a34", "#6e3d1c"] },
  { key: "silver",     name: "Silver",     emblem: "🥈", glow: "rgba(200,205,220,0.5)",  divisions: 3, metal: ["#eef1f6", "#b9c0cc", "#7c8494"] },
  { key: "gold",       name: "Gold",       emblem: "🥇", glow: "rgba(255,205,90,0.6)",   divisions: 3, metal: ["#ffe79a", "#f5c341", "#b8871a"] },
  { key: "platinum",   name: "Platinum",   emblem: "💎", glow: "rgba(90,220,220,0.55)",  divisions: 3, metal: ["#a8f0ee", "#4bc6c8", "#227d8a"] },
  { key: "diamond",    name: "Diamond",    emblem: "🔷", glow: "rgba(120,150,255,0.6)",  divisions: 3, metal: ["#dcc6ff", "#a58bf0", "#e78fd0"] },
  { key: "ascendant",  name: "Ascendant",  emblem: "🟢", glow: "rgba(60,220,140,0.6)",   divisions: 3, metal: ["#9bffcf", "#31d47f", "#188a4e"] },
  { key: "immortal",   name: "Immortal",   emblem: "🔴", glow: "rgba(255,80,110,0.6)",   divisions: 3, metal: ["#ff9fb0", "#e34860", "#8f2334"] },
  { key: "radiant",    name: "Radiant",    emblem: "🌟", glow: "rgba(255,215,120,0.75)", divisions: 1, metal: ["#fff6d8", "#ffe487", "#f7b733"] },
];

export const RR_PER_DIVISION = 100;

// A rank index is a flat number across all divisions.
// Build a flat ladder for convenience.
export function buildLadder() {
  const ladder = [];
  TIERS.forEach((tier) => {
    // Within a tier, divisions ascend (Iron 1 < Iron 2 < Iron 3), matching Valorant.
    for (let d = 1; d <= tier.divisions; d++) {
      ladder.push({
        tierKey: tier.key,
        tierName: tier.name,
        emblem: tier.emblem,
        glow: tier.glow,
        metal: tier.metal,
        isRadiant: tier.key === "radiant",
        division: tier.divisions === 1 ? null : d,
        label: tier.divisions === 1 ? tier.name : `${tier.name} ${d}`,
      });
    }
  });
  return ladder;
}

export const LADDER = buildLadder();
export const MAX_RANK_INDEX = LADDER.length - 1;

export function rankFromIndex(i) {
  return LADDER[Math.max(0, Math.min(MAX_RANK_INDEX, i))];
}

// ---- Level curve -----------------------------------------------------------
// XP required to reach level n (cumulative). Smooth escalating curve.
export function xpForLevel(level) {
  // cumulative xp needed to be AT this level
  return Math.round(120 * Math.pow(level - 1, 1.55));
}

export function levelFromXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp) {
  const level = levelFromXp(xp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = xp - cur;
  const span = next - cur;
  return { level, into, span, pct: Math.max(0, Math.min(1, into / span)), next };
}

// Playful level titles by band
export function levelTitle(level) {
  if (level >= 100) return "Clap Deity";
  if (level >= 75) return "Percussion Overlord";
  if (level >= 50) return "Applause Legend";
  if (level >= 35) return "Rhythm Master";
  if (level >= 22) return "Hand Cannon";
  if (level >= 12) return "Rally Clapper";
  if (level >= 6) return "Warm Hands";
  return "Rookie Clapper";
}
